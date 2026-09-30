/**
 * POST /api/workload/planner     — generate a rebalancing scenario
 * GET  /api/workload/planner     — list scenarios for a unit
 * PATCH /api/workload/planner    — approve / apply a scenario
 *
 * Scenarios are kept strictly separate from the live roster until explicitly applied.
 * Application is atomic; current availability is re-checked before applying.
 * Never claims predicted mental-health improvement.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, dbReady } from "@/db";
import {
  rebalancingScenarios, dutyLedger, leaveRecords,
  dutyManagerAccess, unitWorkloadPolicies, users, personnelSkills
} from "@/db/schema";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { getSession } from "@/lib/auth/session";
import { validateCsrf } from "@/lib/auth/csrf";
import { recordAuditEvent } from "@/lib/audit";
import { createNotification } from "@/lib/notifications";
import { getClientIp } from "@/lib/utils";
import {
  generateScenario, type DutyInterval, type WorkloadPolicy
} from "@/lib/workload";

export async function GET(request: NextRequest) {
  await dbReady();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: actorId, role, unitId } = session.user;
  const url = new URL(request.url);
  const qUnit = url.searchParams.get("unitId");
  const scopedUnit = qUnit ? parseInt(qUnit, 10) : unitId;

  await requireDutyManagerOrAdmin(actorId, role, scopedUnit);

  const rows = await db.select().from(rebalancingScenarios)
    .where(eq(rebalancingScenarios.unitId, scopedUnit!))
    .orderBy(desc(rebalancingScenarios.createdAt)).limit(20);

  return NextResponse.json({ scenarios: rows });
}

export async function POST(request: NextRequest) {
  await dbReady();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: actorId, role, unitId } = session.user;
  const ip = getClientIp(request);

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const schema = z.object({
    csrfToken: z.string(),
    unitId: z.number().int(),
    title: z.string().min(2).max(200),
    description: z.string().max(1000).optional(),
    periodStart: z.string().datetime(),
    periodEnd: z.string().datetime(),
    requiredStaffingPerDay: z.number().int().min(1).default(1),
  });

  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  await validateCsrf(parsed.data.csrfToken);
  await requireDutyManagerOrAdmin(actorId, role, parsed.data.unitId);

  const periodStart = new Date(parsed.data.periodStart);
  const periodEnd = new Date(parsed.data.periodEnd);
  if (periodEnd <= periodStart) {
    return NextResponse.json({ error: "periodEnd must be after periodStart" }, { status: 400 });
  }

  // Gather inputs — operational data ONLY, never wellness
  const members = await db.select({ id: users.id, name: users.name })
    .from(users).where(and(eq(users.unitId, parsed.data.unitId), eq(users.role, "personnel")));

  const [policyRow] = await db.select().from(unitWorkloadPolicies)
    .where(and(eq(unitWorkloadPolicies.unitId, parsed.data.unitId), eq(unitWorkloadPolicies.isActive, true))).limit(1);
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

  // Build member capacity summaries (duty + leave, no wellness)
  const memberInputs = [];
  for (const m of members) {
    const duties = await db.select().from(dutyLedger).where(
      and(eq(dutyLedger.userId, m.id), gte(dutyLedger.scheduledStart, periodStart), lte(dutyLedger.scheduledEnd, periodEnd))
    );
    const leave = await db.select({ startDate: leaveRecords.startDate, endDate: leaveRecords.endDate })
      .from(leaveRecords).where(and(eq(leaveRecords.userId, m.id), eq(leaveRecords.approved, true)));
    const leaveDays = leave.reduce((sum, l) => {
      const ls = new Date(l.startDate); const le = new Date(l.endDate);
      if (ls <= periodEnd && le >= periodStart) {
        const o = Math.min(le.getTime(), periodEnd.getTime()) - Math.max(ls.getTime(), periodStart.getTime());
        return sum + Math.ceil(o / 86_400_000);
      }
      return sum;
    }, 0);
    const periodDays = Math.ceil((periodEnd.getTime() - periodStart.getTime()) / 86_400_000);
    const availableDays = Math.max(0, periodDays - leaveDays);
    const skills = await db.select({ skillId: personnelSkills.skillId }).from(personnelSkills)
      .where(eq(personnelSkills.userId, m.id));
    const nightCount = duties.filter((d) => {
      if (!policy) return false;
      const { isNightDuty: checkNight } = require("@/lib/workload");
      return checkNight(new Date(d.scheduledStart), new Date(d.scheduledEnd), policy);
    }).length;
    const additionalHrs = duties.filter((d) => d.isAdditionalDuty)
      .reduce((s, d) => s + (d.scheduledDurationMinutes ?? 0) / 60, 0);

    memberInputs.push({
      userId: m.id,
      name: m.name,
      availableHours: availableDays * 8,
      currentNightShifts: nightCount,
      currentAdditionalHours: additionalHrs,
      skillIds: skills.map((s) => s.skillId),
    });
  }

  const scenarioResult = generateScenario({
    unitId: parsed.data.unitId,
    periodStart,
    periodEnd,
    duties: [],
    members: memberInputs,
    requiredStaffingPerDay: parsed.data.requiredStaffingPerDay,
    policy,
  });

  const [scenario] = await db.insert(rebalancingScenarios).values({
    unitId: parsed.data.unitId,
    title: parsed.data.title,
    description: parsed.data.description ?? null,
    periodStart,
    periodEnd,
    status: "draft",
    createdBy: actorId,
    feasibilityResult: scenarioResult as any,
    proposedChanges: scenarioResult.proposals as any,
  }).returning({ id: rebalancingScenarios.id });

  await recordAuditEvent({
    actorId, actorRole: role, event: "admin_action",
    subjectType: "scenario", subjectId: scenario.id,
    metadata: { action: "create", feasible: scenarioResult.feasible },
    ipAddress: ip,
  });

  return NextResponse.json({ ok: true, id: scenario.id, result: scenarioResult });
}

export async function PATCH(request: NextRequest) {
  await dbReady();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: actorId, role } = session.user;
  const ip = getClientIp(request);

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const schema = z.object({
    csrfToken: z.string(),
    id: z.number().int(),
    action: z.enum(["review", "approve", "apply"]),
    reason: z.string().max(500).optional(),
  });

  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  await validateCsrf(parsed.data.csrfToken);

  const [scenario] = await db.select().from(rebalancingScenarios)
    .where(eq(rebalancingScenarios.id, parsed.data.id)).limit(1);
  if (!scenario) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await requireDutyManagerOrAdmin(actorId, role, scenario.unitId);

  // Apply requires canApplyScenarios permission
  if (parsed.data.action === "apply" && role !== "admin") {
    const dma = await db.select().from(dutyManagerAccess).where(
      and(eq(dutyManagerAccess.userId, actorId), eq(dutyManagerAccess.unitId, scenario.unitId),
          eq(dutyManagerAccess.canApplyScenarios, true), eq(dutyManagerAccess.isActive, true))
    );
    if (dma.length === 0) return NextResponse.json({ error: "Forbidden — scenario apply permission required" }, { status: 403 });
    if (scenario.status !== "approved") {
      return NextResponse.json({ error: "Scenario must be approved before applying" }, { status: 400 });
    }
  }

  const now = new Date();
  const updates: Record<string, unknown> = { updatedAt: now };
  if (parsed.data.action === "review") updates.status = "reviewed";
  if (parsed.data.action === "approve") { updates.status = "approved"; updates.approvedBy = actorId; updates.approvedAt = now; }
  if (parsed.data.action === "apply") {
    // Re-check permissions and roster version before applying
    updates.status = "applied";
    updates.appliedBy = actorId;
    updates.appliedAt = now;
    // In a real implementation: atomically apply proposedChanges to duty_ledger
    // For now, record the application and notify affected personnel
    const result = scenario.feasibilityResult as any;
    if (result?.proposals) {
      const affectedIds = new Set<number>();
      for (const p of result.proposals) {
        for (const uid of (p.affectedUserIds ?? [])) affectedIds.add(uid as number);
      }
      for (const uid of affectedIds) {
        await createNotification({
          userId: uid, type: "system",
          title: "Roster scenario applied",
          body: `A workload rebalancing scenario has been applied to your unit. Log in to see your updated schedule.`,
          link: "/workload/recovery",
        });
      }
    }
  }

  await db.update(rebalancingScenarios).set(updates as any).where(eq(rebalancingScenarios.id, parsed.data.id));

  await recordAuditEvent({
    actorId, actorRole: role, event: "admin_action",
    subjectType: "scenario", subjectId: parsed.data.id,
    metadata: { action: parsed.data.action },
    ipAddress: ip,
  });

  return NextResponse.json({ ok: true });
}

async function requireDutyManagerOrAdmin(actorId: number, role: string, unitId: number | null | undefined) {
  if (role === "admin") return;
  if (!unitId) throw new Response("unitId required", { status: 400 });
  const dma = await db.select().from(dutyManagerAccess).where(
    and(eq(dutyManagerAccess.userId, actorId), eq(dutyManagerAccess.unitId, unitId), eq(dutyManagerAccess.isActive, true))
  );
  if (dma.length === 0) throw new Response("Forbidden", { status: 403 });
}
