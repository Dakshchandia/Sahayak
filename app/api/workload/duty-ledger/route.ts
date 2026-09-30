/**
 * GET  /api/workload/duty-ledger   — fetch duty entries for a user or unit
 * POST /api/workload/duty-ledger   — create a new duty ledger entry (roster manager)
 * PATCH /api/workload/duty-ledger  — verify/update actual times (roster manager)
 *
 * Privacy guarantee:
 *   Personnel see ONLY their own entries.
 *   Duty managers with canViewIndividualDuty see unit entries.
 *   NEVER returns wellness, mood, fatigue, counselling or psychological data.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, dbReady } from "@/db";
import {
  dutyLedger, dutyManagerAccess, users, unitWorkloadPolicies
} from "@/db/schema";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { getSession } from "@/lib/auth/session";
import { validateCsrf } from "@/lib/auth/csrf";
import { recordAuditEvent } from "@/lib/audit";
import { getClientIp } from "@/lib/utils";
import {
  computeDutyDurations, detectOverlap, isNightDuty,
  type DutyInterval, type WorkloadPolicy,
} from "@/lib/workload";
import { computeAndStoreAssessment } from "@/lib/assessment-service";

// ─── GET ─────────────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  await dbReady();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: actorId, role, unitId } = session.user;
  const url = new URL(request.url);
  const targetUserId = url.searchParams.get("userId");
  const targetUnitId = url.searchParams.get("unitId");
  const from = url.searchParams.get("from"); // ISO date
  const to = url.searchParams.get("to");     // ISO date

  // Authorization
  if (role === "personnel") {
    // Personnel can only see their own entries
    const userId = actorId;
    const rows = await fetchDutyLedger(userId, null, from, to);
    return NextResponse.json({ duties: rows });
  }

  if (role === "welfare_officer") {
    // Welfare officers see duty context for their unit's cases — scoped to their unit
    if (!targetUserId) return NextResponse.json({ error: "userId required" }, { status: 400 });
    const uid = parseInt(targetUserId, 10);
    // Verify target is in the officer's unit
    const [person] = await db.select({ unitId: users.unitId }).from(users).where(eq(users.id, uid)).limit(1);
    if (!person || person.unitId !== unitId) {
      return NextResponse.json({ error: "Forbidden — not in your unit" }, { status: 403 });
    }
    const rows = await fetchDutyLedger(uid, null, from, to);
    return NextResponse.json({ duties: rows, accessNote: "Duty records only. Wellness data excluded." });
  }

  // Duty manager / admin / commander
  if (role === "admin") {
    const uid = targetUserId ? parseInt(targetUserId, 10) : null;
    const uUnit = targetUnitId ? parseInt(targetUnitId, 10) : null;
    const rows = await fetchDutyLedger(uid, uUnit, from, to);
    return NextResponse.json({ duties: rows });
  }

  if (role === "commander") {
    // Commander needs explicit duty manager access for individual records
    const hasAccess = await getDutyManagerAccess(actorId);
    const dma = hasAccess.find(
      (a) => (!targetUnitId || a.unitId === parseInt(targetUnitId, 10)) && a.canViewIndividualDuty && a.isActive
    );
    if (!dma) {
      return NextResponse.json({
        error: "Individual duty records require duty manager access. Contact your administrator.",
        aggregateOnly: true,
      }, { status: 403 });
    }
    const uid = targetUserId ? parseInt(targetUserId, 10) : null;
    const rows = await fetchDutyLedger(uid, dma.unitId, from, to);
    return NextResponse.json({ duties: rows, accessNote: "Duty records only. Wellness data excluded." });
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

// ─── POST ─────────────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  await dbReady();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: actorId, role } = session.user;
  const ip = getClientIp(request);

  // Only roster managers and admins can create entries
  if (role !== "admin") {
    const dma = await getDutyManagerAccess(actorId);
    if (!dma.some((a) => a.canEditRoster && a.isActive)) {
      return NextResponse.json({ error: "Forbidden — roster edit permission required" }, { status: 403 });
    }
  }

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const schema = z.object({
    csrfToken: z.string(),
    userId: z.number().int(),
    unitId: z.number().int(),
    dutyType: z.enum(["general", "guard", "patrol", "training", "administrative"]).default("general"),
    scheduledStart: z.string().datetime(),
    scheduledEnd: z.string().datetime(),
    scheduledBreakMinutes: z.number().int().min(0).default(0),
    actualStart: z.string().datetime().optional(),
    actualEnd: z.string().datetime().optional(),
    actualBreakMinutes: z.number().int().min(0).optional(),
    actualSource: z.enum(["self_reported", "supervisor", "system", "imported"]).optional(),
    isAdditionalDuty: z.boolean().default(false),
    additionalDutyReason: z.string().max(500).optional(),
    notes: z.string().max(1000).optional(),
  });

  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  await validateCsrf(parsed.data.csrfToken);

  const scheduledStart = new Date(parsed.data.scheduledStart);
  const scheduledEnd = new Date(parsed.data.scheduledEnd);

  if (scheduledEnd <= scheduledStart) {
    return NextResponse.json({ error: "scheduledEnd must be after scheduledStart" }, { status: 400 });
  }

  // Overlap check against existing entries for this user
  const existing = await fetchDutyLedger(parsed.data.userId, null, null, null);
  const intervals: DutyInterval[] = existing.map(rowToInterval);
  const overlap = detectOverlap(scheduledStart, scheduledEnd, intervals);
  const hasOverlapFlag = overlap.hasOverlap;

  // Compute derived fields
  const scheduledDurationMinutes = Math.max(0, (scheduledEnd.getTime() - scheduledStart.getTime()) / 60_000);
  const policy = await getActivePolicy(parsed.data.unitId);
  const nightMins = policy
    ? await computeNightMinutes(scheduledStart, scheduledEnd, policy)
    : 0;

  const [entry] = await db.insert(dutyLedger).values({
    userId: parsed.data.userId,
    unitId: parsed.data.unitId,
    dutyType: parsed.data.dutyType,
    scheduledStart,
    scheduledEnd,
    scheduledBreakMinutes: parsed.data.scheduledBreakMinutes,
    actualStart: parsed.data.actualStart ? new Date(parsed.data.actualStart) : null,
    actualEnd: parsed.data.actualEnd ? new Date(parsed.data.actualEnd) : null,
    actualBreakMinutes: parsed.data.actualBreakMinutes ?? null,
    actualSource: parsed.data.actualSource ?? null,
    verificationStatus: "pending",
    isAdditionalDuty: parsed.data.isAdditionalDuty,
    additionalDutyReason: parsed.data.additionalDutyReason ?? null,
    status: "scheduled",
    scheduledDurationMinutes,
    nightDurationMinutes: nightMins,
    hasOverlapFlag,
    notes: parsed.data.notes ?? null,
  }).returning({ id: dutyLedger.id });

  await recordAuditEvent({
    actorId, actorRole: role, event: "admin_action",
    subjectType: "duty_ledger", subjectId: entry.id,
    metadata: { action: "create", userId: parsed.data.userId, hasOverlapFlag },
    ipAddress: ip,
  });

  return NextResponse.json({ ok: true, id: entry.id, hasOverlapFlag });
}

// ─── PATCH — verify actual times ──────────────────────────────────────────────
export async function PATCH(request: NextRequest) {
  await dbReady();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: actorId, role } = session.user;
  const ip = getClientIp(request);

  if (role !== "admin") {
    const dma = await getDutyManagerAccess(actorId);
    if (!dma.some((a) => a.canEditRoster && a.isActive)) {
      return NextResponse.json({ error: "Forbidden — roster edit permission required" }, { status: 403 });
    }
  }

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const schema = z.object({
    csrfToken: z.string(),
    id: z.number().int(),
    actualStart: z.string().datetime(),
    actualEnd: z.string().datetime(),
    actualBreakMinutes: z.number().int().min(0).default(0),
    verificationStatus: z.enum(["verified", "disputed"]),
    notes: z.string().max(1000).optional(),
  });

  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  await validateCsrf(parsed.data.csrfToken);

  const [existing] = await db.select().from(dutyLedger).where(eq(dutyLedger.id, parsed.data.id)).limit(1);
  if (!existing) return NextResponse.json({ error: "Entry not found" }, { status: 404 });

  const actualStart = new Date(parsed.data.actualStart);
  const actualEnd = new Date(parsed.data.actualEnd);
  if (actualEnd <= actualStart) return NextResponse.json({ error: "actualEnd must be after actualStart" }, { status: 400 });

  // Recalculate derived fields
  const scheduledWorkMins = Math.max(0, existing.scheduledDurationMinutes! - (existing.scheduledBreakMinutes ?? 0));
  const actualDurationMinutes = Math.max(0, (actualEnd.getTime() - actualStart.getTime()) / 60_000);
  const actualBreak = parsed.data.actualBreakMinutes;
  const actualWorkMins = Math.max(0, actualDurationMinutes - actualBreak);
  const additionalMinutes = Math.max(0, actualWorkMins - scheduledWorkMins);
  const policy = await getActivePolicy(existing.unitId);
  const nightMins = policy ? await computeNightMinutes(actualStart, actualEnd, policy) : 0;

  await db.update(dutyLedger).set({
    actualStart,
    actualEnd,
    actualBreakMinutes: actualBreak,
    actualDurationMinutes,
    additionalMinutes,
    nightDurationMinutes: nightMins,
    verificationStatus: parsed.data.verificationStatus,
    verifiedBy: actorId,
    verifiedAt: new Date(),
    updatedAt: new Date(),
    notes: parsed.data.notes ?? existing.notes,
  }).where(eq(dutyLedger.id, parsed.data.id));

  await recordAuditEvent({
    actorId, actorRole: role, event: "admin_action",
    subjectType: "duty_ledger", subjectId: parsed.data.id,
    metadata: { action: "verify", verificationStatus: parsed.data.verificationStatus, additionalMinutes },
    ipAddress: ip,
  });

  // After verification, refresh assessment for the user
  if (parsed.data.verificationStatus === "verified") {
    computeAndStoreAssessment(existing.userId, "record_correction", undefined, ip)
      .catch((err) => console.error("[workload] Post-verify reassessment failed:", err));
  }

  return NextResponse.json({ ok: true, additionalMinutes, nightDurationMinutes: nightMins });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function fetchDutyLedger(userId: number | null, unitId: number | null, from: string | null, to: string | null) {
  let q = db.select().from(dutyLedger).$dynamic();
  const conditions = [];
  if (userId !== null) conditions.push(eq(dutyLedger.userId, userId));
  if (unitId !== null) conditions.push(eq(dutyLedger.unitId, unitId));
  if (from) conditions.push(gte(dutyLedger.scheduledStart, new Date(from)));
  if (to) conditions.push(lte(dutyLedger.scheduledEnd, new Date(to + "T23:59:59")));
  if (conditions.length > 0) q = q.where(and(...conditions));
  return q.orderBy(desc(dutyLedger.scheduledStart)).limit(200);
}

async function getDutyManagerAccess(userId: number) {
  return db.select().from(dutyManagerAccess).where(
    and(eq(dutyManagerAccess.userId, userId), eq(dutyManagerAccess.isActive, true))
  );
}

async function getActivePolicy(unitId: number): Promise<WorkloadPolicy | null> {
  const [p] = await db.select().from(unitWorkloadPolicies)
    .where(and(eq(unitWorkloadPolicies.unitId, unitId), eq(unitWorkloadPolicies.isActive, true)))
    .limit(1);
  if (!p) return null;
  return {
    nightStartHH: p.nightStartHH,
    nightEndHH: p.nightEndHH,
    warnWeeklyHoursExceeds: p.warnWeeklyHoursExceeds ?? 48,
    warnConsecutiveDaysExceeds: p.warnConsecutiveDaysExceeds ?? 6,
    warnNightShiftsPerMonthExceeds: p.warnNightShiftsPerMonthExceeds ?? 8,
    blockWeeklyHoursExceeds: p.blockWeeklyHoursExceeds ?? 60,
    blockConsecutiveDaysExceeds: p.blockConsecutiveDaysExceeds ?? 10,
    minRecoveryHoursWarning: p.minRecoveryHoursWarning ?? 10,
    minRecoveryHoursBlock: p.minRecoveryHoursBlock ?? 8,
    maxAdditionalHoursPerWeek: p.maxAdditionalHoursPerWeek ?? 10,
    isDemoConfig: p.isDemoConfig,
    label: p.label,
  };
}

async function computeNightMinutes(start: Date, end: Date, policy: WorkloadPolicy): Promise<number> {
  const { nightDurationMinutes } = await import("@/lib/workload");
  return nightDurationMinutes(start, end, policy.nightStartHH, policy.nightEndHH, 5.5);
}

function rowToInterval(row: typeof dutyLedger.$inferSelect): DutyInterval {
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
