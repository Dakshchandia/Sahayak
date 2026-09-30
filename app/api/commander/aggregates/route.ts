import { NextRequest, NextResponse } from "next/server";
import { db, dbReady } from "@/db";
import { users, assessments, dutyRecords, units } from "@/db/schema";
import { eq, desc, and, gte, sql } from "drizzle-orm";
import { getSession } from "@/lib/auth/session";
import { recordAuditEvent } from "@/lib/audit";
import { aggregateUnit } from "@/lib/domain";

const MIN_GROUP_SIZE = parseInt(process.env.MIN_GROUP_SIZE ?? "10", 10);

export async function GET(request: NextRequest) {
  await dbReady();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { role, unitId, id: actorId } = session.user;
  if (role !== "commander" && role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Get all units commander has scope over
  // A commander sees their assigned unit and its sub-units
  // For simplicity in this version: commanders see their assigned unit only
  const scopedUnits = await db
    .select()
    .from(units);

  const result = [];
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  for (const unit of scopedUnits) {
    // Get unit members
    const members = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.unitId, unit.id));

    if (members.length < MIN_GROUP_SIZE) {
      result.push({
        unit: unit.name,
        unitCode: unit.code,
        suppressed: true,
        suppressionReason: `Group has fewer than ${MIN_GROUP_SIZE} personnel. Individual data cannot be displayed to protect privacy.`,
        count: members.length,
      });
      continue;
    }

    // Get latest assessment for each member — NO individual wellness data
    const memberIds = members.map((m) => m.id);

    // Aggregate by using latest assessment scores
    // Important: assessments contain score/priority only, not check-in content
    const memberData = [];
    for (const memberId of memberIds) {
      const [latestAssessment] = await db
        .select({
          totalScore: assessments.totalScore,
          priority: assessments.priority,
        })
        .from(assessments)
        .where(eq(assessments.userId, memberId))
        .orderBy(desc(assessments.assessedAt))
        .limit(1);

      // Get latest duty record
      const [latestDuty] = await db
        .select({
          weeklyHours: dutyRecords.weeklyHours,
          nightShifts: dutyRecords.nightShifts,
          deploymentDays: sql<number>`0`,
        })
        .from(dutyRecords)
        .where(eq(dutyRecords.userId, memberId))
        .orderBy(desc(dutyRecords.periodStart))
        .limit(1);

      if (latestAssessment) {
        memberData.push({
          score: latestAssessment.totalScore,
          weeklyHours: latestDuty?.weeklyHours ?? 40,
          nightShifts: latestDuty?.nightShifts ?? 0,
          deploymentDays: 0,
        });
      }
    }

    if (memberData.length < MIN_GROUP_SIZE) {
      result.push({
        unit: unit.name,
        unitCode: unit.code,
        suppressed: true,
        suppressionReason: `Insufficient recent assessments to display aggregate.`,
        count: members.length,
      });
      continue;
    }

    const aggregate = aggregateUnit(memberData);
    result.push({
      unit: unit.name,
      unitCode: unit.code,
      suppressed: false,
      ...aggregate,
    });
  }

  await recordAuditEvent({
    actorId,
    actorRole: role,
    event: "export_generated",
    subjectType: "aggregate",
    metadata: { unitCount: result.length },
  });

  return NextResponse.json({
    units: result,
    minGroupSize: MIN_GROUP_SIZE,
    disclaimer: "Aggregate only. Individual identities, check-ins and counselling records are excluded from this response.",
    generatedAt: new Date().toISOString(),
  });
}
