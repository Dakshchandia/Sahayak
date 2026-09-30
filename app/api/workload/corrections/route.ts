/**
 * GET  /api/workload/corrections   — list correction requests (own or unit)
 * POST /api/workload/corrections   — personnel submits a correction report
 * PATCH /api/workload/corrections  — reviewer approves/rejects (no self-approval)
 *
 * A correction request is evidence awaiting review — NOT an automatic record change.
 * Rejected reports retain their history and explanation.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, dbReady } from "@/db";
import { dutyCorrections, dutyLedger, users, dutyManagerAccess } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { getSession } from "@/lib/auth/session";
import { validateCsrf } from "@/lib/auth/csrf";
import { recordAuditEvent } from "@/lib/audit";
import { createNotification } from "@/lib/notifications";
import { getClientIp } from "@/lib/utils";
import { computeAndStoreAssessment } from "@/lib/assessment-service";

export async function GET(request: NextRequest) {
  await dbReady();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: actorId, role, unitId } = session.user;
  const url = new URL(request.url);
  const targetUserId = url.searchParams.get("userId");

  if (role === "personnel") {
    // Only own corrections
    const rows = await db.select().from(dutyCorrections)
      .where(eq(dutyCorrections.reportedBy, actorId))
      .orderBy(desc(dutyCorrections.createdAt));
    return NextResponse.json({ corrections: rows });
  }

  // Duty managers see their unit's corrections
  if (role === "admin") {
    const uid = targetUserId ? parseInt(targetUserId, 10) : null;
    const rows = uid
      ? await db.select().from(dutyCorrections).where(eq(dutyCorrections.reportedBy, uid)).orderBy(desc(dutyCorrections.createdAt))
      : await db.select().from(dutyCorrections).orderBy(desc(dutyCorrections.createdAt)).limit(100);
    return NextResponse.json({ corrections: rows });
  }

  // Roster managers — unit-scoped
  const dma = await db.select().from(dutyManagerAccess).where(
    and(eq(dutyManagerAccess.userId, actorId), eq(dutyManagerAccess.isActive, true))
  );
  const allowedUnitIds = dma.filter((d) => d.canEditRoster).map((d) => d.unitId);
  if (allowedUnitIds.length === 0 && role !== "commander") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const scoped = unitId ? [unitId] : allowedUnitIds;
  const rows = await db.select().from(dutyCorrections)
    .where(scoped.length > 0 ? eq(dutyCorrections.unitId, scoped[0]) : undefined)
    .orderBy(desc(dutyCorrections.createdAt)).limit(100);
  return NextResponse.json({ corrections: rows });
}

export async function POST(request: NextRequest) {
  await dbReady();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "personnel") {
    return NextResponse.json({ error: "Only personnel can submit duty corrections" }, { status: 403 });
  }

  const { id: actorId, unitId } = session.user;
  if (!unitId) return NextResponse.json({ error: "No unit assigned" }, { status: 400 });
  const ip = getClientIp(request);

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const schema = z.object({
    csrfToken: z.string(),
    dutyLedgerId: z.number().int().optional(),
    reportedActualStart: z.string().datetime().optional(),
    reportedActualEnd: z.string().datetime().optional(),
    reportedBreakMinutes: z.number().int().min(0).optional(),
    isUnrecordedDuty: z.boolean().default(false),
    explanation: z.string().min(10).max(2000),
  });

  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  await validateCsrf(parsed.data.csrfToken);

  if (!parsed.data.isUnrecordedDuty && !parsed.data.dutyLedgerId) {
    return NextResponse.json({ error: "Either link a duty ledger entry or mark as unrecorded duty" }, { status: 400 });
  }

  const [correction] = await db.insert(dutyCorrections).values({
    dutyLedgerId: parsed.data.dutyLedgerId ?? null,
    reportedBy: actorId,
    unitId,
    reportedActualStart: parsed.data.reportedActualStart ? new Date(parsed.data.reportedActualStart) : null,
    reportedActualEnd: parsed.data.reportedActualEnd ? new Date(parsed.data.reportedActualEnd) : null,
    reportedBreakMinutes: parsed.data.reportedBreakMinutes ?? null,
    isUnrecordedDuty: parsed.data.isUnrecordedDuty,
    explanation: parsed.data.explanation,
    status: "submitted",
  }).returning({ id: dutyCorrections.id });

  await recordAuditEvent({
    actorId, actorRole: "personnel", event: "admin_action",
    subjectType: "duty_correction", subjectId: correction.id,
    metadata: { action: "submit" },
    ipAddress: ip,
  });

  // Notify duty managers in the unit
  const dma = await db.select({ userId: dutyManagerAccess.userId })
    .from(dutyManagerAccess)
    .where(and(eq(dutyManagerAccess.unitId, unitId), eq(dutyManagerAccess.isActive, true), eq(dutyManagerAccess.canEditRoster, true)));

  for (const d of dma) {
    await createNotification({
      userId: d.userId,
      type: "system",
      title: "New duty correction request",
      body: "A personnel member has submitted a duty hours correction for review.",
      link: "/roster/corrections",
    });
  }

  return NextResponse.json({ ok: true, correctionId: correction.id });
}

export async function PATCH(request: NextRequest) {
  await dbReady();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: actorId, role } = session.user;
  const ip = getClientIp(request);

  // Reviewers: admin or roster managers
  if (role !== "admin") {
    const dma = await db.select().from(dutyManagerAccess).where(
      and(eq(dutyManagerAccess.userId, actorId), eq(dutyManagerAccess.canEditRoster, true), eq(dutyManagerAccess.isActive, true))
    );
    if (dma.length === 0) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const schema = z.object({
    csrfToken: z.string(),
    id: z.number().int(),
    decision: z.enum(["approved", "partially_approved", "rejected", "under_review"]),
    reviewDecision: z.string().min(5).max(1000),
  });

  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  await validateCsrf(parsed.data.csrfToken);

  const [correction] = await db.select().from(dutyCorrections)
    .where(eq(dutyCorrections.id, parsed.data.id)).limit(1);
  if (!correction) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // No self-approval
  if (correction.reportedBy === actorId) {
    return NextResponse.json({ error: "Self-approval is not permitted." }, { status: 403 });
  }

  // Unit scope check
  const dma = await db.select().from(dutyManagerAccess).where(
    and(eq(dutyManagerAccess.userId, actorId), eq(dutyManagerAccess.unitId, correction.unitId), eq(dutyManagerAccess.isActive, true))
  );
  if (dma.length === 0 && role !== "admin") {
    return NextResponse.json({ error: "Forbidden — not your unit" }, { status: 403 });
  }

  const now = new Date();
  await db.update(dutyCorrections).set({
    status: parsed.data.decision,
    reviewedBy: actorId,
    reviewedAt: now,
    reviewDecision: parsed.data.reviewDecision,
    updatedAt: now,
  }).where(eq(dutyCorrections.id, parsed.data.id));

  await recordAuditEvent({
    actorId, actorRole: role, event: "admin_action",
    subjectType: "duty_correction", subjectId: parsed.data.id,
    metadata: { action: "review", decision: parsed.data.decision },
    ipAddress: ip,
  });

  // Notify the reporter
  await createNotification({
    userId: correction.reportedBy,
    type: "system",
    title: `Duty correction ${parsed.data.decision.replace("_", " ")}`,
    body: "Your duty correction request has been reviewed. Log in for details.",
    link: "/workload/recovery",
  });

  // If approved, trigger assessment refresh
  if (parsed.data.decision === "approved") {
    computeAndStoreAssessment(correction.reportedBy, "record_correction", undefined, ip)
      .catch((err) => console.error("[corrections] Post-approval reassessment failed:", err));
  }

  return NextResponse.json({ ok: true });
}
