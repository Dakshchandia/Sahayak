/**
 * GET /api/workload/context?userId=X
 * Returns duty-context summary for welfare officers viewing a case.
 * Returns only operational duty data — NEVER wellness, mood, counselling or psychological scores.
 */
import { NextRequest, NextResponse } from "next/server";
import { db, dbReady } from "@/db";
import { dutyLedger, leaveRecords, users } from "@/db/schema";
import { eq, and, gte, desc } from "drizzle-orm";
import { getSession } from "@/lib/auth/session";
import { computeDutyDurations, consecutiveDutyDays, type DutyInterval } from "@/lib/workload";

export async function GET(request: NextRequest) {
  await dbReady();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: actorId, role, unitId } = session.user;
  if (role !== "welfare_officer" && role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const userId = parseInt(url.searchParams.get("userId") ?? "0", 10);
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  // Welfare officers can only access their unit's cases
  const [person] = await db.select({ unitId: users.unitId, name: users.name, personnelId: users.personnelId })
    .from(users).where(eq(users.id, userId)).limit(1);
  if (!person) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (role === "welfare_officer" && unitId && person.unitId !== unitId) {
    return NextResponse.json({ error: "Forbidden — not in your unit" }, { status: 403 });
  }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000);
  const duties = await db.select().from(dutyLedger)
    .where(and(eq(dutyLedger.userId, userId), gte(dutyLedger.scheduledStart, thirtyDaysAgo)))
    .orderBy(desc(dutyLedger.scheduledStart)).limit(30);

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

  const now = new Date();
  let scheduledHours = 0, additionalHours = 0, missingCount = 0;
  let nightShifts = 0;
  for (const interval of intervals) {
    const dur = computeDutyDurations(interval, now);
    scheduledHours += dur.scheduledWorkMinutes / 60;
    if (!dur.missingActual && dur.additionalMinutes) additionalHours += dur.additionalMinutes / 60;
    if (dur.missingActual) missingCount++;
    if ((interval as any).nightDurationMinutes > 120) nightShifts++;
  }
  const consec = consecutiveDutyDays(intervals, now);

  const recentLeave = await db.select({ startDate: leaveRecords.startDate, endDate: leaveRecords.endDate })
    .from(leaveRecords).where(eq(leaveRecords.userId, userId))
    .orderBy(desc(leaveRecords.endDate)).limit(1);
  const lastLeave = recentLeave[0] ?? null;
  const daysSinceLeave = lastLeave
    ? Math.ceil((now.getTime() - new Date(lastLeave.endDate + "T00:00:00").getTime()) / 86_400_000)
    : null;

  return NextResponse.json({
    // Operational context only
    period: "Last 30 days",
    scheduledHours: Math.round(scheduledHours * 10) / 10,
    additionalHours: Math.round(additionalHours * 10) / 10,
    nightShifts,
    consecutiveDays: consec,
    missingActualCount: missingCount,
    daysSinceLeave,
    dutyCount: duties.length,
    // Observation wording — not causal claims
    observationalNote: additionalHours > 5
      ? `Higher recorded duty hours occurred during this period. This is operational context for a welfare conversation, not a diagnosis.`
      : null,
    privacyNote: "Duty records only. Wellness, mood, fatigue, counselling and psychological data excluded from this view.",
  });
}
