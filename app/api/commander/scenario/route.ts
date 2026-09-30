import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, dbReady } from "@/db";
import { users, dutyRecords, units } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { getSession } from "@/lib/auth/session";
import { validateCsrf } from "@/lib/auth/csrf";
import { calculateAssessment, RULES_V1, type RuleInput } from "@/lib/domain";
import { recordAuditEvent } from "@/lib/audit";

const MIN_GROUP_SIZE = parseInt(process.env.MIN_GROUP_SIZE ?? "10", 10);

const scenarioSchema = z.object({
  csrfToken: z.string(),
  unitCode: z.string().optional(),
  nightReduction: z.number().int().min(0).max(6),
  hourReduction: z.number().int().min(0).max(16),
});

export async function POST(request: NextRequest) {
  await dbReady();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { role, id: actorId } = session.user;
  if (role !== "commander" && role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }

  const parsed = scenarioSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  await validateCsrf(parsed.data.csrfToken);

  const { nightReduction, hourReduction } = parsed.data;

  // Get all personnel in scope
  let memberIds: number[] = [];
  const allUsers = await db.select({ id: users.id }).from(users);
  memberIds = allUsers.map((u) => u.id);

  if (memberIds.length < MIN_GROUP_SIZE) {
    return NextResponse.json(
      { error: `Cannot run scenario: fewer than ${MIN_GROUP_SIZE} personnel in scope.` },
      { status: 400 }
    );
  }

  // Calculate before and after scores using ORGANIZATIONAL factors only
  // Wellness factors are excluded from commander view
  let totalBefore = 0;
  let totalAfter = 0;
  let counted = 0;

  for (const memberId of memberIds) {
    const [latestDuty] = await db
      .select()
      .from(dutyRecords)
      .where(eq(dutyRecords.userId, memberId))
      .orderBy(desc(dutyRecords.periodStart))
      .limit(1);

    if (!latestDuty) continue;

    const baseInput: RuleInput = {
      weeklyHours: latestDuty.weeklyHours,
      nightShifts: latestDuty.nightShifts,
      consecutiveDays: latestDuty.consecutiveDays ?? 0,
      deploymentDays: 14,
      daysSinceLeave: 45,
      transfersLast6Months: 0,
      trainingDaysLast30: 5,
      // Wellness data excluded from commander scenario
      sleepHours: null,
      fatigue: null,
      mood: null,
      perceivedWorkload: null,
      hasActiveSupport: false,
    };

    const before = calculateAssessment(baseInput, RULES_V1);

    const modifiedInput: RuleInput = {
      ...baseInput,
      weeklyHours: Math.max(0, baseInput.weeklyHours - hourReduction),
      nightShifts: Math.max(0, baseInput.nightShifts - nightReduction),
    };

    const after = calculateAssessment(modifiedInput, RULES_V1);

    totalBefore += before.totalScore;
    totalAfter += after.totalScore;
    counted++;
  }

  const avgBefore = counted > 0 ? Math.round(totalBefore / counted) : 0;
  const avgAfter = counted > 0 ? Math.round(totalAfter / counted) : 0;

  await recordAuditEvent({
    actorId,
    actorRole: role,
    event: "export_generated",
    subjectType: "scenario",
    metadata: { nightReduction, hourReduction, avgBefore, avgAfter },
  });

  return NextResponse.json({
    before: avgBefore,
    after: avgAfter,
    personnel: counted,
    nightReduction,
    hourReduction,
    disclaimer: [
      "Scenario estimates only.",
      "Recalculates organizational duty indicators under stated assumptions.",
      "Does not predict mental-health outcomes.",
      "Does not model staffing coverage or operational requirements.",
      "No real duty schedules are changed.",
      "Wellness indicators are excluded from commander view.",
    ].join(" "),
  });
}
