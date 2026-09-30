/**
 * POST /api/personnel/checkin/analysis
 * Generate or retrieve the personalized insight for a check-in.
 *
 * - If an analysis already exists and the check-in hasn't been edited since, return cached.
 * - If the check-in was edited or no analysis exists, generate a new one.
 * - Uses AI only when GEMINI_API_KEY is set AND ai_processing consent is granted.
 * - Always falls back to a template result — check-in data is never lost.
 * - Does not trigger a new welfare assessment (that already happened on POST /checkin).
 * - Personal notes (concern) are sent to AI only when includeOptionalText=true.
 *
 * Privacy: Identity from server session. No cross-user access possible.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, dbReady } from "@/db";
import {
  checkIns, checkInAnalyses, assessments, assessmentFactors,
  consentRecords, dutyRecords, leaveRecords, dutyLedger,
} from "@/db/schema";
import { eq, and, gte, desc, lte } from "drizzle-orm";
import { getSession } from "@/lib/auth/session";
import { validateCsrf } from "@/lib/auth/csrf";
import { recordAuditEvent } from "@/lib/audit";
import { getClientIp } from "@/lib/utils";
import {
  generateCheckInInsight, type InsightInput, type DutyContext,
  type CheckInSnapshot, type AssessmentSnapshot,
} from "@/lib/checkin-insight";

export async function GET(request: NextRequest) {
  await dbReady();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "personnel") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const userId = session.user.id;
  const checkInId = parseInt(new URL(request.url).searchParams.get("checkInId") ?? "0", 10);
  if (!checkInId) return NextResponse.json({ error: "checkInId required" }, { status: 400 });

  // Verify ownership
  const [ci] = await db.select().from(checkIns)
    .where(and(eq(checkIns.id, checkInId), eq(checkIns.userId, userId))).limit(1);
  if (!ci) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Return existing analysis if valid (not invalidated)
  const [existing] = await db.select().from(checkInAnalyses)
    .where(and(eq(checkInAnalyses.checkInId, checkInId), eq(checkInAnalyses.userId, userId))).limit(1);

  if (existing && !existing.invalidatedAt) {
    return NextResponse.json({ analysis: existing, checkIn: ci });
  }

  return NextResponse.json({ analysis: null, checkIn: ci });
}

export async function POST(request: NextRequest) {
  await dbReady();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "personnel") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const userId = session.user.id;
  const ip = getClientIp(request);

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const schema = z.object({
    csrfToken: z.string(),
    checkInId: z.number().int(),
    includeOptionalText: z.boolean().default(false), // explicit permission to send concern text
    forceRegenerate: z.boolean().default(false),
  });

  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  await validateCsrf(parsed.data.csrfToken);

  const { checkInId, includeOptionalText, forceRegenerate } = parsed.data;

  // Verify ownership
  const [ci] = await db.select().from(checkIns)
    .where(and(eq(checkIns.id, checkInId), eq(checkIns.userId, userId))).limit(1);
  if (!ci) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Return cached if valid and not forced
  if (!forceRegenerate) {
    const [existing] = await db.select().from(checkInAnalyses)
      .where(and(eq(checkInAnalyses.checkInId, checkInId), eq(checkInAnalyses.userId, userId))).limit(1);
    if (existing && !existing.invalidatedAt) {
      return NextResponse.json({ analysis: existing, cached: true });
    }
  }

  // ── Consent checks ─────────────────────────────────────────────────────────
  const consentRows = await db.select().from(consentRecords)
    .where(eq(consentRecords.userId, userId));
  const wellnessConsent = consentRows.find((c) => c.scope === "wellness_checkins")?.granted ?? false;
  const aiConsent = consentRows.find((c) => c.scope === "ai_processing")?.granted ?? false;

  if (!wellnessConsent) {
    return NextResponse.json({ error: "Wellness consent required." }, { status: 403 });
  }

  // ── Fetch the assessment for this check-in ─────────────────────────────────
  const [latestAssessment] = await db.select().from(assessments)
    .where(and(eq(assessments.userId, userId), eq(assessments.isLatest, true)))
    .orderBy(desc(assessments.assessedAt)).limit(1);

  let factors: AssessmentSnapshot["factors"] = [];
  if (latestAssessment) {
    const factorRows = await db.select().from(assessmentFactors)
      .where(eq(assessmentFactors.assessmentId, latestAssessment.id));
    factors = factorRows.map((f) => ({
      name: f.name, kind: f.kind, points: f.points,
      value: f.value, rationale: f.rationale ?? "",
    }));
  }

  const assessmentSnapshot: AssessmentSnapshot = latestAssessment ? {
    id: latestAssessment.id,
    rawScore: latestAssessment.totalScore,
    maxPossibleScore: latestAssessment.maxPossibleScore,
    priority: latestAssessment.priority,
    factors,
    plainExplanation: latestAssessment.plainExplanation ?? "",
    missingDataFlags: latestAssessment.missingDataFlags ?? [],
    dataCoverage: latestAssessment.dataCoverage,
  } : {
    id: 0, rawScore: 0, maxPossibleScore: 103, priority: "routine",
    factors: [], plainExplanation: "", missingDataFlags: [], dataCoverage: 0.7,
  };

  // ── Fetch recent check-ins (last 7 days) ───────────────────────────────────
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const recentRows = await db.select().from(checkIns)
    .where(and(
      eq(checkIns.userId, userId),
      gte(checkIns.checkInDate, sevenDaysAgo.toISOString().slice(0, 10)),
      lte(checkIns.checkInDate, ci.checkInDate),
    ))
    .orderBy(desc(checkIns.checkInDate)).limit(8);

  const recentExcludingToday = recentRows
    .filter((r) => r.checkInDate !== ci.checkInDate)
    .map((r): CheckInSnapshot => ({
      id: r.id, checkInDate: r.checkInDate, mood: r.mood, sleepHours: r.sleepHours,
      sleepQuality: r.sleepQuality, fatigue: r.fatigue, perceivedWorkload: r.perceivedWorkload,
      concern: null, // never include concern in trend analysis
      requestedSupport: r.requestedSupport, createdAt: r.createdAt.toISOString(),
    }));

  // ── Fetch duty context ─────────────────────────────────────────────────────
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const [latestDuty] = await db.select().from(dutyRecords)
    .where(and(eq(dutyRecords.userId, userId), gte(dutyRecords.periodEnd, thirtyDaysAgo.toISOString().slice(0, 10))))
    .orderBy(desc(dutyRecords.periodStart)).limit(1);

  // Additional hours from duty ledger
  const ledgerRows = await db.select({
    additionalMinutes: dutyLedger.additionalMinutes,
    verificationStatus: dutyLedger.verificationStatus,
  }).from(dutyLedger)
    .where(and(eq(dutyLedger.userId, userId), gte(dutyLedger.scheduledStart, thirtyDaysAgo)));
  const additionalHours = ledgerRows
    .filter((r) => r.verificationStatus === "verified" || r.verificationStatus === "pending")
    .reduce((s, r) => s + (r.additionalMinutes ?? 0) / 60, 0);

  const leaveRows = await db.select({ endDate: leaveRecords.endDate })
    .from(leaveRecords).where(eq(leaveRecords.userId, userId))
    .orderBy(desc(leaveRecords.endDate)).limit(1);
  const daysSinceLeave = leaveRows[0]
    ? Math.ceil((new Date().getTime() - new Date(leaveRows[0].endDate + "T00:00:00").getTime()) / 86_400_000)
    : null;

  const dutyCtx: DutyContext = {
    weeklyHoursThisPeriod: latestDuty?.weeklyHours ?? null,
    nightShiftsThisPeriod: latestDuty?.nightShifts ?? null,
    additionalHoursThisWeek: additionalHours > 0 ? additionalHours : null,
    daysSinceLastLeave: daysSinceLeave,
    consecutiveDays: latestDuty?.consecutiveDays ?? null,
  };

  // ── Build input ────────────────────────────────────────────────────────────
  const currentSnapshot: CheckInSnapshot = {
    id: ci.id, checkInDate: ci.checkInDate, mood: ci.mood, sleepHours: ci.sleepHours,
    sleepQuality: ci.sleepQuality, fatigue: ci.fatigue, perceivedWorkload: ci.perceivedWorkload,
    concern: includeOptionalText && aiConsent ? ci.concern : null,
    requestedSupport: ci.requestedSupport, createdAt: ci.createdAt.toISOString(),
  };

  const insightInput: InsightInput = {
    current: currentSnapshot,
    recent: recentExcludingToday,
    assessment: assessmentSnapshot,
    duty: dutyCtx,
    aiConsent,
    includeOptionalText: includeOptionalText && aiConsent,
  };

  // ── Generate insight ───────────────────────────────────────────────────────
  const insight = await generateCheckInInsight(insightInput);

  // ── Persist (upsert) ───────────────────────────────────────────────────────
  const existing = await db.select({ id: checkInAnalyses.id })
    .from(checkInAnalyses).where(and(eq(checkInAnalyses.checkInId, checkInId), eq(checkInAnalyses.userId, userId))).limit(1);

  let analysisId: number;
  if (existing.length > 0) {
    await db.update(checkInAnalyses).set({
      assessmentId: latestAssessment?.id ?? null,
      summary: insight.summary,
      summarySource: insight.summarySource,
      observations: insight.observations as any,
      trendSummary: insight.trendSummary as any,
      suggestedActions: insight.suggestedActions as any,
      followUpQuestions: insight.followUpQuestions as any,
      missingContext: insight.missingContext,
      invalidatedAt: null, // clear invalidation
      updatedAt: new Date(),
    }).where(eq(checkInAnalyses.id, existing[0].id));
    analysisId = existing[0].id;
  } else {
    const [inserted] = await db.insert(checkInAnalyses).values({
      checkInId, userId,
      assessmentId: latestAssessment?.id ?? null,
      summary: insight.summary,
      summarySource: insight.summarySource,
      observations: insight.observations as any,
      trendSummary: insight.trendSummary as any,
      suggestedActions: insight.suggestedActions as any,
      followUpQuestions: insight.followUpQuestions as any,
      missingContext: insight.missingContext,
    }).returning({ id: checkInAnalyses.id });
    analysisId = inserted.id;
  }

  // Audit — record only that analysis was generated, not the content
  await recordAuditEvent({
    actorId: userId, actorRole: "personnel",
    event: "assessment_generated",
    subjectType: "checkin_analysis", subjectId: analysisId,
    metadata: { aiUsed: insight.summarySource === "gemini", checkInId },
    ipAddress: ip,
  });
  if (insight.summarySource === "gemini") {
    await recordAuditEvent({
      actorId: userId, actorRole: "personnel",
      event: "ai_explanation_requested",
      subjectType: "checkin_analysis", subjectId: analysisId,
      metadata: { includeOptionalText },
      ipAddress: ip,
    });
  }

  const [saved] = await db.select().from(checkInAnalyses).where(eq(checkInAnalyses.id, analysisId)).limit(1);
  return NextResponse.json({ analysis: saved, cached: false });
}
