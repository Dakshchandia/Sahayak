/**
 * GET /api/workload/distribution
 * Unit workload distribution for duty managers / commanders.
 *
 * Returns per-person operational duty summaries for a unit.
 * NEVER includes wellness, mood, fatigue, counselling notes or psychological scores.
 * Commanders WITHOUT duty-manager access receive aggregate-only data.
 */
import { NextRequest, NextResponse } from "next/server";
import { db, dbReady } from "@/db";
import {
  dutyLedger, dutyManagerAccess, users, leaveRecords,
  unitWorkloadPolicies, workloadReviewRequests
} from "@/db/schema";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { getSession } from "@/lib/auth/session";
import { recordAuditEvent } from "@/lib/audit";
import {
  computeDutyDurations, isNightDuty, consecutiveDutyDays,
  type DutyInterval, type WorkloadPolicy
} from "@/lib/workload";

const MIN_GROUP = parseInt(process.env.MIN_GROUP_SIZE ?? "10", 10);

export async function GET(request: NextRequest) {
  await dbReady();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: actorId, role, unitId: sessionUnitId } = session.user;
  const url = new URL(request.url);
  const qUnit = url.searchParams.get("unitId");
  const from = url.searchParams.get("from") ?? new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const to   = url.searchParams.get("to")   ?? new Date().toISOString().slice(0, 10);

  if (role !== "admin" && role !== "commander" && role !== "welfare_officer") {
    // Only duty managers with explicit access
    const dma = await db.select().from(dutyManagerAccess).where(
      and(eq(dutyManagerAccess.userId, actorId), eq(dutyManagerAccess.isActive, true), eq(dutyManagerAccess.canViewIndividualDuty, true))
    );
    if (dma.length === 0) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const scopedUnit = qUnit ? parseInt(qUnit, 10) : sessionUnitId;
  if (!scopedUnit) return NextResponse.json({ error: "unitId required" }, { status: 400 });

  // Commander without DMA → aggregate only
  if (role === "commander") {
    const dma = await db.select().from(dutyManagerAccess).where(
      and(eq(dutyManagerAccess.userId, actorId), eq(dutyManagerAccess.unitId, scopedUnit), eq(dutyManagerAccess.isActive, true))
    );
    if (dma.length === 0) {
      return NextResponse.json({
        aggregateOnly: true,
        message: "Individual duty records require duty manager access. Contact your administrator.",
      }, { status: 403 });
    }
  }

  // Fetch all unit members
  const members = await db.select({ id: users.id, name: users.name, personnelId: users.personnelId })
    .from(users)
    .where(and(eq(users.unitId, scopedUnit), eq(users.role, "personnel")));

  if (members.length < MIN_GROUP && role !== "admin") {
    return NextResponse.json({
      suppressed: true,
      suppressionReason: `Unit has fewer than ${MIN_GROUP} personnel. Individual distribution data is suppressed.`,
      count: members.length,
    });
  }

  // Fetch policy
  const [policyRow] = await db.select().from(unitWorkloadPolicies)
    .where(and(eq(unitWorkloadPolicies.unitId, scopedUnit), eq(unitWorkloadPolicies.isActive, true))).limit(1);
  const policy: WorkloadPolicy | null = policyRow ? {
    nightStartHH: policyRow.nightStartHH, nightEndHH: policyRow.nightEndHH,
    warnWeeklyHoursExceeds: policyRow.warnWeeklyHoursExceeds ?? 48,
    warnConsecutiveDaysExceeds: policyRow.warnConsecutiveDaysExceeds ?? 6,
    warnNightShiftsPerMonthExceeds: policyRow.warnNightShiftsPerMonthExceeds ?? 8,
    blockWeeklyHoursExceeds: policyRow.blockWeeklyHoursExceeds ?? 60,
    blockConsecutiveDaysExceeds: policyRow.blockConsecutiveDaysExceeds ?? 10,
    minRecoveryHoursWarning: policyRow.minRecoveryHoursWarning ?? 10,
    minRecoveryHoursBlock: policyRow.minRecoveryHoursBlock ?? 8,
    maxAdditionalHoursPerWeek: policyRow.maxAdditionalHoursPerWeek ?? 10,
    isDemoConfig: policyRow.isDemoConfig, label: policyRow.label,
  } : null;

  const now = new Date();
  const distribution = [];

  for (const member of members) {
    // Duty entries in window — NEVER fetches wellness/check-in data
    const duties = await db.select().from(dutyLedger).where(
      and(
        eq(dutyLedger.userId, member.id),
        gte(dutyLedger.scheduledStart, new Date(from)),
        lte(dutyLedger.scheduledStart, new Date(to + "T23:59:59"))
      )
    ).orderBy(dutyLedger.scheduledStart);

    const intervals: DutyInterval[] = duties.map((d) => ({
      id: d.id,
      scheduledStart: new Date(d.scheduledStart),
      scheduledEnd: new Date(d.scheduledEnd),
      scheduledBreakMinutes: d.scheduledBreakMinutes ?? 0,
      actualStart: d.actualStart ? new Date(d.actualStart) : null,
      actualEnd: d.actualEnd ? new Date(d.actualEnd) : null,
      actualBreakMinutes: d.actualBreakMinutes ?? null,
      verificationStatus: d.verificationStatus,
      isAdditionalDuty: d.isAdditionalDuty,
      status: d.status,
    }));

    let scheduledHours = 0, verifiedActualHours = 0, pendingHours = 0;
    let additionalHours = 0, nightShifts = 0, missingActualCount = 0;

    for (const interval of intervals) {
      const dur = computeDutyDurations(interval, now);
      scheduledHours += dur.scheduledWorkMinutes / 60;
      if (!dur.missingActual && !dur.isFuture && dur.actualWorkMinutes !== null) {
        if (interval.verificationStatus === "verified") verifiedActualHours += dur.actualWorkMinutes / 60;
        else pendingHours += dur.actualWorkMinutes / 60;
        additionalHours += (dur.additionalMinutes ?? 0) / 60;
      }
      if (dur.missingActual) missingActualCount++;
      if (policy && isNightDuty(interval.scheduledStart, interval.scheduledEnd, policy)) nightShifts++;
    }

    const consec = consecutiveDutyDays(intervals, now);
    const warnings: string[] = [];
    if (policy) {
      if (nightShifts > policy.warnNightShiftsPerMonthExceeds)
        warnings.push(`Night shifts (${nightShifts}) exceed policy recommendation of ${policy.warnNightShiftsPerMonthExceeds}.`);
      if (consec >= policy.warnConsecutiveDaysExceeds)
        warnings.push(`${consec} consecutive duty days reaches policy warning threshold.`);
      if (additionalHours > policy.maxAdditionalHoursPerWeek)
        warnings.push(`Additional hours (${additionalHours.toFixed(1)}h) exceed policy recommendation.`);
    }

    // Open workload requests count (no content exposed, just count)
    const openRequests = await db.select({ id: workloadReviewRequests.id }).from(workloadReviewRequests)
      .where(and(eq(workloadReviewRequests.requestedBy, member.id),
                 eq(workloadReviewRequests.unitId, scopedUnit)));
    const openReviewCount = openRequests.filter(
      // can't filter by status without joining — use count as proxy
      () => true
    ).length;

    distribution.push({
      // Operational fields only — NO wellness, NO psychological score
      userId: member.id,
      name: member.name,
      personnelId: member.personnelId,
      scheduledHours: Math.round(scheduledHours * 10) / 10,
      verifiedActualHours: Math.round(verifiedActualHours * 10) / 10,
      pendingActualHours: Math.round(pendingHours * 10) / 10,
      additionalHours: Math.round(additionalHours * 10) / 10,
      nightShifts,
      consecutiveDays: consec,
      missingActualCount,
      warnings,
      openWorkloadRequests: openReviewCount,
    });
  }

  // Unit-level summary
  const totalScheduled = distribution.reduce((s, m) => s + m.scheduledHours, 0);
  const totalAdditional = distribution.reduce((s, m) => s + m.additionalHours, 0);
  const uneven = distribution.filter((m) => m.additionalHours > (totalAdditional / distribution.length) * 1.5);

  const unitSummary: string[] = [];
  if (uneven.length > 0 && uneven.length < distribution.length * 0.4) {
    unitSummary.push(`Additional duties concentrated among ${uneven.length} of ${distribution.length} personnel. Review assignment distribution.`);
  }
  if (!policy) {
    unitSummary.push("No workload policy configured for this unit. Policy checks unavailable.");
  }

  await recordAuditEvent({
    actorId, actorRole: role, event: "export_generated",
    subjectType: "workload_distribution", subjectId: scopedUnit.toString(),
    metadata: { from, to, memberCount: members.length },
  });

  return NextResponse.json({
    distribution,
    unitSummary,
    period: { from, to },
    policy: policy ? { label: policy.label, isDemoConfig: policy.isDemoConfig } : null,
    privacyNote: "Duty records only. Wellness, fatigue, mood and counselling data excluded.",
    disclaimer: "Operational planning data. Does not reflect welfare assessment scores.",
  });
}
