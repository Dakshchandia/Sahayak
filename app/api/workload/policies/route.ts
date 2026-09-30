/**
 * GET  /api/workload/policies   — get active policy for a unit
 * POST /api/workload/policies   — create/update unit policy (admin only)
 *
 * Policy changes do NOT rewrite historical records.
 * Every policy is labeled as demonstration configuration by default.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, dbReady } from "@/db";
import { unitWorkloadPolicies } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getSession } from "@/lib/auth/session";
import { validateCsrf } from "@/lib/auth/csrf";
import { recordAuditEvent } from "@/lib/audit";
import { getClientIp } from "@/lib/utils";

export async function GET(request: NextRequest) {
  await dbReady();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const unitId = new URL(request.url).searchParams.get("unitId");
  if (!unitId) return NextResponse.json({ error: "unitId required" }, { status: 400 });

  const [policy] = await db.select().from(unitWorkloadPolicies)
    .where(and(eq(unitWorkloadPolicies.unitId, parseInt(unitId, 10)), eq(unitWorkloadPolicies.isActive, true)))
    .limit(1);

  if (!policy) {
    return NextResponse.json({ policy: null, message: "Policy not configured" });
  }

  return NextResponse.json({
    policy,
    demoNote: policy.isDemoConfig
      ? "DEMONSTRATION CONFIGURATION ONLY — not a legal standard. An authorized administrator must configure real unit policies."
      : null,
  });
}

export async function POST(request: NextRequest) {
  await dbReady();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden — admin only" }, { status: 403 });
  }

  const { id: actorId } = session.user;
  const ip = getClientIp(request);

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const schema = z.object({
    csrfToken: z.string(),
    unitId: z.number().int(),
    label: z.string().min(2).max(200),
    nightStartHH: z.number().int().min(0).max(23).default(22),
    nightEndHH: z.number().int().min(0).max(23).default(6),
    warnWeeklyHoursExceeds: z.number().min(0).default(48),
    warnConsecutiveDaysExceeds: z.number().int().min(0).default(6),
    warnNightShiftsPerMonthExceeds: z.number().int().min(0).default(8),
    blockWeeklyHoursExceeds: z.number().min(0).default(60),
    blockConsecutiveDaysExceeds: z.number().int().min(0).default(10),
    minRecoveryHoursWarning: z.number().min(0).default(10),
    minRecoveryHoursBlock: z.number().min(0).default(8),
    maxAdditionalHoursPerWeek: z.number().min(0).default(10),
    isDemoConfig: z.boolean().default(true),
    demoConfigNote: z.string().optional(),
  });

  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  await validateCsrf(parsed.data.csrfToken);

  // Deactivate existing active policy for this unit (policy changes don't rewrite history)
  await db.update(unitWorkloadPolicies).set({ isActive: false })
    .where(and(eq(unitWorkloadPolicies.unitId, parsed.data.unitId), eq(unitWorkloadPolicies.isActive, true)));

  const [policy] = await db.insert(unitWorkloadPolicies).values({
    unitId: parsed.data.unitId,
    label: parsed.data.label,
    nightStartHH: parsed.data.nightStartHH,
    nightEndHH: parsed.data.nightEndHH,
    warnWeeklyHoursExceeds: parsed.data.warnWeeklyHoursExceeds,
    warnConsecutiveDaysExceeds: parsed.data.warnConsecutiveDaysExceeds,
    warnNightShiftsPerMonthExceeds: parsed.data.warnNightShiftsPerMonthExceeds,
    blockWeeklyHoursExceeds: parsed.data.blockWeeklyHoursExceeds,
    blockConsecutiveDaysExceeds: parsed.data.blockConsecutiveDaysExceeds,
    minRecoveryHoursWarning: parsed.data.minRecoveryHoursWarning,
    minRecoveryHoursBlock: parsed.data.minRecoveryHoursBlock,
    maxAdditionalHoursPerWeek: parsed.data.maxAdditionalHoursPerWeek,
    isDemoConfig: parsed.data.isDemoConfig,
    demoConfigNote: parsed.data.demoConfigNote ?? "DEMONSTRATION CONFIGURATION ONLY — not a legal standard.",
    createdBy: actorId,
    isActive: true,
    effectiveFrom: new Date(),
  }).returning({ id: unitWorkloadPolicies.id });

  await recordAuditEvent({
    actorId, actorRole: "admin", event: "admin_action",
    subjectType: "unit_policy", subjectId: policy.id,
    metadata: { action: "create", unitId: parsed.data.unitId, label: parsed.data.label },
    ipAddress: ip,
  });

  return NextResponse.json({ ok: true, id: policy.id });
}
