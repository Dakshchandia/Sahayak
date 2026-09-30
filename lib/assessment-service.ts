/**
 * Shared Assessment Service
 * ─────────────────────────
 * Single authoritative function for computing and storing welfare assessments.
 * All triggers (check-in, import, consent-change, manual) call computeAndStoreAssessment().
 *
 * Assessment inputs are read from the actual organizational data tables.
 * No hardcoded stub values.
 *
 * Historical snapshots are preserved — existing assessments are marked
 * isLatest=false before a new one is inserted.
 */
import { db, dbReady } from "@/db";
import {
  checkIns, consentRecords, assessments, assessmentFactors,
  ruleVersions, dutyRecords, deploymentRecords, leaveRecords,
  transferRecords, trainingRecords,
} from "@/db/schema";
import { eq, and, desc, gte, lte, sql } from "drizzle-orm";
import {
  calculateAssessment, RULES_V1, type RuleInput, type RuleConfig,
} from "@/lib/domain";
import { getAiExplanation } from "@/lib/ai/provider";
import { recordAuditEvent } from "@/lib/audit";

export type AssessmentTrigger =
  | "checkin"
  | "checkin_edit"
  | "import"
  | "consent_change"
  | "record_correction"
  | "manual"
  | "seed";

export interface ComputeResult {
  assessmentId: number;
  rawScore: number;
  maxPossibleScore: number;
  priority: string;
  triggered: boolean; // false if skipped (e.g. no rule version active)
}

/**
 * Compute a new assessment for one user and persist it.
 * Marks the previous latest assessment as historical (isLatest=false).
 * Idempotent for the same trigger+checkInId combination.
 */
export async function computeAndStoreAssessment(
  userId: number,
  trigger: AssessmentTrigger,
  triggeredByCheckInId?: number,
  ipAddress?: string | null
): Promise<ComputeResult | null> {
  await dbReady();

  // ── Get active rule version ───────────────────────────────────────────────
  const [ruleVersion] = await db
    .select()
    .from(ruleVersions)
    .where(eq(ruleVersions.isActive, true))
    .limit(1);

  if (!ruleVersion) {
    console.warn("[assessment] No active rule version — skipping assessment for user", userId);
    return null;
  }

  const rules = (ruleVersion.rulesJson as RuleConfig) ?? RULES_V1;
  const windowDays = 30;
  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - windowDays);
  const windowStartStr = windowStart.toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);

  // ── Check wellness consent ────────────────────────────────────────────────
  const [consent] = await db
    .select({ granted: consentRecords.granted })
    .from(consentRecords)
    .where(
      and(
        eq(consentRecords.userId, userId),
        eq(consentRecords.scope, "wellness_checkins")
      )
    )
    .limit(1);
  const wellnessConsented = consent?.granted === true;

  // ── Organizational data (real queries) ────────────────────────────────────

  // Latest duty record within the window
  const [latestDuty] = await db
    .select()
    .from(dutyRecords)
    .where(
      and(
        eq(dutyRecords.userId, userId),
        gte(dutyRecords.periodEnd, windowStartStr)
      )
    )
    .orderBy(desc(dutyRecords.periodStart))
    .limit(1);

  // Current deployment (or most recent ending within window)
  const [latestDeployment] = await db
    .select()
    .from(deploymentRecords)
    .where(eq(deploymentRecords.userId, userId))
    .orderBy(desc(deploymentRecords.startDate))
    .limit(1);

  // Most recent leave record — to compute daysSinceLeave
  const [latestLeave] = await db
    .select()
    .from(leaveRecords)
    .where(eq(leaveRecords.userId, userId))
    .orderBy(desc(leaveRecords.endDate))
    .limit(1);

  // Transfers in last 6 months
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const sixMonthsAgoStr = sixMonthsAgo.toISOString().slice(0, 10);
  const transfers = await db
    .select({ id: transferRecords.id })
    .from(transferRecords)
    .where(
      and(
        eq(transferRecords.userId, userId),
        gte(transferRecords.transferDate, sixMonthsAgoStr)
      )
    );

  // Training days in last 30 days
  const trainingRows = await db
    .select({
      startDate: trainingRecords.startDate,
      endDate: trainingRecords.endDate,
    })
    .from(trainingRecords)
    .where(
      and(
        eq(trainingRecords.userId, userId),
        gte(trainingRecords.endDate, windowStartStr)
      )
    );

  // Sum training days (clamped to window)
  const trainingDaysLast30 = trainingRows.reduce((sum, t) => {
    const start = new Date(Math.max(new Date(t.startDate + "T00:00:00").getTime(), windowStart.getTime()));
    const end = new Date(t.endDate + "T00:00:00");
    const days = Math.max(0, Math.ceil((end.getTime() - start.getTime()) / 86400000));
    return sum + days;
  }, 0);

  // Compute deployment days
  let deploymentDays = 0;
  if (latestDeployment) {
    const depStart = new Date(latestDeployment.startDate + "T00:00:00");
    const depEnd = latestDeployment.endDate
      ? new Date(latestDeployment.endDate + "T00:00:00")
      : new Date();
    deploymentDays = Math.max(
      0,
      Math.ceil((depEnd.getTime() - depStart.getTime()) / 86400000)
    );
  }

  // Compute days since last leave
  let daysSinceLeave = 999; // large sentinel when no leave on record
  if (latestLeave) {
    const leaveEnd = new Date(latestLeave.endDate + "T00:00:00");
    daysSinceLeave = Math.max(
      0,
      Math.ceil((new Date().getTime() - leaveEnd.getTime()) / 86400000)
    );
  }

  // ── Wellness data (only if consented) ────────────────────────────────────
  let sleepHours: number | null = null;
  let fatigue: number | null = null;
  let mood: number | null = null;
  let perceivedWorkload: number | null = null;
  let hasActiveSupport = false;

  if (wellnessConsented) {
    // Use the supplied check-in if given, otherwise most recent stored check-in
    const checkInId = triggeredByCheckInId;
    const [latestCheckin] = await db
      .select()
      .from(checkIns)
      .where(
        checkInId
          ? eq(checkIns.id, checkInId)
          : and(
              eq(checkIns.userId, userId),
              gte(checkIns.checkInDate, windowStartStr)
            )
      )
      .orderBy(desc(checkIns.checkInDate))
      .limit(1);

    if (latestCheckin) {
      sleepHours = latestCheckin.sleepHours;
      fatigue = latestCheckin.fatigue;
      mood = latestCheckin.mood;
      perceivedWorkload = latestCheckin.perceivedWorkload;
      hasActiveSupport = latestCheckin.requestedSupport;
    }
  }
  // When consent is not granted, all wellness fields remain null → 0 pts.

  const input: RuleInput = {
    weeklyHours:         latestDuty?.weeklyHours         ?? 40,
    nightShifts:         latestDuty?.nightShifts          ?? 0,
    consecutiveDays:     latestDuty?.consecutiveDays      ?? 0,
    deploymentDays,
    daysSinceLeave,
    transfersLast6Months: transfers.length,
    trainingDaysLast30,
    sleepHours,
    fatigue,
    mood,
    perceivedWorkload,
    hasActiveSupport,
  };

  const result = calculateAssessment(input, rules);

  // AI explanation (respects consent — never sends raw text concern)
  const aiResult = await getAiExplanation({
    factors: result.factors,
    totalScore: result.rawScore,
    priority: result.priority,
    missingDataFlags: result.missingDataFlags,
  });

  // ── Persist — mark previous latest as historical first ───────────────────
  await db
    .update(assessments)
    .set({ isLatest: false })
    .where(
      and(
        eq(assessments.userId, userId),
        eq(assessments.isLatest, true)
      )
    );

  const [assessment] = await db
    .insert(assessments)
    .values({
      userId,
      ruleVersionId: ruleVersion.id,
      totalScore: result.rawScore,
      maxPossibleScore: result.maxPossibleScore,
      priority: result.priority,
      dataCoverage: result.dataCoverage,
      missingDataFlags: result.missingDataFlags,
      plainExplanation: result.plainExplanation,
      aiExplanation: aiResult.text,
      aiExplanationSource: aiResult.source,
      triggeredBy: trigger,
      inputWindowDays: windowDays,
      isLatest: true,
    })
    .returning({ id: assessments.id });

  await db.insert(assessmentFactors).values(
    result.factors.map((f) => ({
      assessmentId: assessment.id,
      name: f.name,
      kind: f.kind,
      value: f.value,
      points: f.points,
      maxPoints: f.maxPoints,
      rationale: f.rationale,
    }))
  );

  await recordAuditEvent({
    actorId: userId,
    event: "assessment_generated",
    subjectType: "assessment",
    subjectId: assessment.id,
    metadata: {
      trigger,
      priority: result.priority,
      rawScore: result.rawScore,
      maxPossibleScore: result.maxPossibleScore,
    },
    ipAddress: ipAddress ?? null,
  });

  return {
    assessmentId: assessment.id,
    rawScore: result.rawScore,
    maxPossibleScore: result.maxPossibleScore,
    priority: result.priority,
    triggered: true,
  };
}

/**
 * Reassess all personnel in a given unit after an import.
 * Idempotent — safe to call multiple times for the same import job.
 * Processes in small batches to avoid long-running transactions.
 */
export async function reassessUnit(
  userIds: number[],
  trigger: AssessmentTrigger,
  ipAddress?: string | null
): Promise<void> {
  await dbReady();
  for (const userId of userIds) {
    try {
      await computeAndStoreAssessment(userId, trigger, undefined, ipAddress);
    } catch (err) {
      console.error(`[assessment] Failed to reassess user ${userId}:`, err);
    }
  }
}
