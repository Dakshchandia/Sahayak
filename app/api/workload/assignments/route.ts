/**
 * GET  /api/workload/assignments   — list assignments for unit or assignee
 * POST /api/workload/assignments   — create an assignment (runs capacity check)
 * PATCH /api/workload/assignments  — approve/reject/cancel
 *
 * Privacy: NEVER returns wellness, mood, fatigue, counselling or psychological data.
 * Capacity checks use duty records and approved leave only.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, dbReady } from "@/db";
import {
  assignments, dutyLedger, dutyManagerAccess, leaveRecords,
  unitWorkloadPolicies, users
} from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { getSession } from "@/lib/auth/session";
import { validateCsrf } from "@/lib/auth/csrf";
import { recordAuditEvent } from "@/lib/audit";
import { createNotification } from "@/lib/notifications";
import { getClientIp } from "@/lib/utils";
import {
  checkAssignmentCapacity, type DutyInterval, type WorkloadPolicy
} from "@/lib/workload";

export async function GET(request: NextRequest) {
  await dbReady();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: actorId, role, unitId } = session.user;
  const url = new URL(request.url);
  const qUnit = url.searchParams.get("unitId");
  const qUser = url.searchParams.get("assigneeId");

  if (role === "personnel") {
    const rows = await db.select().from(assignments)
      .where(eq(assignments.assigneeId, actorId))
      .orderBy(desc(assignments.createdAt));
    return NextResponse.json({ assignments: rows });
  }

  if (role === "admin") {
    const rows = await db.select().from(assignments).orderBy(desc(assignments.createdAt)).limit(200);
    return NextResponse.json({ assignments: rows });
  }

  const scopedUnit = qUnit ? parseInt(qUnit, 10) : unitId;
  if (!scopedUnit) return NextResponse.json({ assignments: [] });

  const dma = await db.select().from(dutyManagerAccess).where(
    and(eq(dutyManagerAccess.userId, actorId), eq(dutyManagerAccess.unitId, scopedUnit), eq(dutyManagerAccess.isActive, true))
  );
  if (dma.length === 0 && role !== "welfare_officer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rows = await db.select().from(assignments)
    .where(eq(assignments.unitId, scopedUnit))
    .orderBy(desc(assignments.createdAt)).limit(200);
  return NextResponse.json({ assignments: rows });
}

export async function POST(request: NextRequest) {
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
    title: z.string().min(2).max(200),
    description: z.string().max(1000).optional(),
    unitId: z.number().int(),
    assigneeId: z.number().int().optional(),
    requiredSkillId: z.number().int().optional(),
    estimatedEffortHours: z.number().min(0).max(500).optional(),
    plannedStart: z.string().datetime().optional(),
    plannedEnd: z.string().datetime().optional(),
    deadline: z.string().datetime().optional(),
    priority: z.enum(["low", "normal", "high", "critical"]).default("normal"),
    effortType: z.enum(["within_shift", "additional"]).default("additional"),
    assignmentReason: z.string().max(500).optional(),
    overrideReason: z.string().max(500).optional(), // only if manager overrides a warning
  });

  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  await validateCsrf(parsed.data.csrfToken);

  // Authorization — must have approve-assignments permission for this unit
  if (role !== "admin") {
    const dma = await db.select().from(dutyManagerAccess).where(
      and(eq(dutyManagerAccess.userId, actorId), eq(dutyManagerAccess.unitId, parsed.data.unitId),
          eq(dutyManagerAccess.canApproveAssignments, true), eq(dutyManagerAccess.isActive, true))
    );
    if (dma.length === 0) {
      return NextResponse.json({ error: "Forbidden — assignment approval permission required for this unit" }, { status: 403 });
    }
  }

  // ── Capacity check (if assignee is specified) ───────────────────────────────
  let capacityResult = null;
  if (parsed.data.assigneeId && parsed.data.plannedStart && parsed.data.plannedEnd) {
    const proposedStart = new Date(parsed.data.plannedStart);
    const proposedEnd = new Date(parsed.data.plannedEnd);

    // Fetch assignee's existing duty entries
    const dutyRows = await db.select().from(dutyLedger)
      .where(eq(dutyLedger.userId, parsed.data.assigneeId));
    const intervals: DutyInterval[] = dutyRows.map(rowToInterval);

    // Fetch approved leave
    const leaveRows = await db.select({ startDate: leaveRecords.startDate, endDate: leaveRecords.endDate })
      .from(leaveRecords)
      .where(and(eq(leaveRecords.userId, parsed.data.assigneeId), eq(leaveRecords.approved, true)));

    // Fetch existing assignments
    const existingAssign = await db.select({
      id: assignments.id,
      plannedStart: assignments.plannedStart,
      plannedEnd: assignments.plannedEnd,
      deadline: assignments.deadline,
      estimatedEffortHours: assignments.estimatedEffortHours,
      effortType: assignments.effortType,
      status: assignments.status,
    }).from(assignments).where(eq(assignments.assigneeId, parsed.data.assigneeId));

    // Get policy
    const [policyRow] = await db.select().from(unitWorkloadPolicies)
      .where(and(eq(unitWorkloadPolicies.unitId, parsed.data.unitId), eq(unitWorkloadPolicies.isActive, true)))
      .limit(1);
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

    const [assigneeUser] = await db.select({ name: users.name }).from(users)
      .where(eq(users.id, parsed.data.assigneeId)).limit(1);

    capacityResult = checkAssignmentCapacity(
      parsed.data.assigneeId,
      assigneeUser?.name ?? "Assignee",
      proposedStart,
      proposedEnd,
      parsed.data.estimatedEffortHours ?? null,
      parsed.data.effortType,
      intervals,
      leaveRows,
      existingAssign.map((a) => ({
        ...a,
        plannedStart: a.plannedStart ? new Date(a.plannedStart) : null,
        plannedEnd: a.plannedEnd ? new Date(a.plannedEnd) : null,
        deadline: a.deadline ? new Date(a.deadline) : null,
      })),
      policy
    );

    // Block on hard conflicts — cannot proceed without override
    const hasBlockingConflict = capacityResult.findings.some(
      (f) => f.severity === "blocking"
    );
    if (hasBlockingConflict) {
      return NextResponse.json({
        ok: false,
        blocked: true,
        capacityCheck: capacityResult,
        message: "Assignment blocked due to conflicts. Review capacity findings before proceeding.",
      }, { status: 409 });
    }

    // Warnings require an explicit override reason
    if (capacityResult.hasWarnings && !parsed.data.overrideReason) {
      return NextResponse.json({
        ok: false,
        requiresOverride: true,
        capacityCheck: capacityResult,
        message: "Assignment has policy warnings. Provide an overrideReason to proceed.",
      }, { status: 409 });
    }
  }

  const [assignment] = await db.insert(assignments).values({
    title: parsed.data.title,
    description: parsed.data.description ?? null,
    unitId: parsed.data.unitId,
    assigneeId: parsed.data.assigneeId ?? null,
    requiredSkillId: parsed.data.requiredSkillId ?? null,
    estimatedEffortHours: parsed.data.estimatedEffortHours ?? null,
    plannedStart: parsed.data.plannedStart ? new Date(parsed.data.plannedStart) : null,
    plannedEnd: parsed.data.plannedEnd ? new Date(parsed.data.plannedEnd) : null,
    deadline: parsed.data.deadline ? new Date(parsed.data.deadline) : null,
    priority: parsed.data.priority,
    effortType: parsed.data.effortType,
    assignmentReason: parsed.data.assignmentReason ?? null,
    status: "pending_approval",
    createdBy: actorId,
    capacityCheckResult: capacityResult as any,
    overrideReason: parsed.data.overrideReason ?? null,
    overriddenBy: parsed.data.overrideReason ? actorId : null,
    overriddenAt: parsed.data.overrideReason ? new Date() : null,
  }).returning({ id: assignments.id });

  await recordAuditEvent({
    actorId, actorRole: role, event: "admin_action",
    subjectType: "assignment", subjectId: assignment.id,
    metadata: { action: "create", hasOverride: !!parsed.data.overrideReason },
    ipAddress: ip,
  });

  // Notify assignee
  if (parsed.data.assigneeId) {
    await createNotification({
      userId: parsed.data.assigneeId, type: "system",
      title: `New assignment: ${parsed.data.title}`,
      body: "You have been assigned a new operational task. Log in to view details.",
      link: "/workload/assignments",
    });
  }

  return NextResponse.json({ ok: true, id: assignment.id, capacityCheck: capacityResult });
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
    status: z.enum(["approved", "rejected", "cancelled", "in_progress", "completed"]),
    reason: z.string().max(500).optional(),
  });

  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  await validateCsrf(parsed.data.csrfToken);

  const [existing] = await db.select().from(assignments).where(eq(assignments.id, parsed.data.id)).limit(1);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Unit scope check
  if (role !== "admin") {
    const dma = await db.select().from(dutyManagerAccess).where(
      and(eq(dutyManagerAccess.userId, actorId), eq(dutyManagerAccess.unitId, existing.unitId),
          eq(dutyManagerAccess.canApproveAssignments, true), eq(dutyManagerAccess.isActive, true))
    );
    if (dma.length === 0) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await db.update(assignments).set({
    status: parsed.data.status,
    approvedBy: parsed.data.status === "approved" ? actorId : existing.approvedBy,
    approvedAt: parsed.data.status === "approved" ? new Date() : existing.approvedAt,
    updatedAt: new Date(),
  }).where(eq(assignments.id, parsed.data.id));

  await recordAuditEvent({
    actorId, actorRole: role, event: "admin_action",
    subjectType: "assignment", subjectId: parsed.data.id,
    metadata: { action: "status_change", status: parsed.data.status },
    ipAddress: ip,
  });

  if (existing.assigneeId) {
    await createNotification({
      userId: existing.assigneeId, type: "system",
      title: `Assignment ${parsed.data.status}: ${existing.title}`,
      body: "Your assignment status has been updated. Log in to view details.",
      link: "/workload/assignments",
    });
  }

  return NextResponse.json({ ok: true });
}

function rowToInterval(row: any): DutyInterval {
  return {
    id: row.id,
    scheduledStart: new Date(row.scheduledStart),
    scheduledEnd: new Date(row.scheduledEnd),
    scheduledBreakMinutes: row.scheduledBreakMinutes ?? 0,
    actualStart: row.actualStart ? new Date(row.actualStart) : null,
    actualEnd: row.actualEnd ? new Date(row.actualEnd) : null,
    actualBreakMinutes: row.actualBreakMinutes ?? null,
    verificationStatus: row.verificationStatus,
    isAdditionalDuty: row.isAdditionalDuty,
    status: row.status,
  };
}
