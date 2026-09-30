/**
 * GET  /api/workload/reviews   — list workload review requests
 * POST /api/workload/reviews   — personnel submits a workload review request
 * PATCH /api/workload/reviews  — manager acknowledges, proposes, or closes
 *
 * PRIVACY NOTE: This workflow is operational, NOT confidential welfare.
 * The visibility note is stored with every request and displayed before submission.
 * Raising a request must not create disciplinary points or affect assignments automatically.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, dbReady } from "@/db";
import { workloadReviewRequests, dutyManagerAccess, users } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { getSession } from "@/lib/auth/session";
import { validateCsrf } from "@/lib/auth/csrf";
import { recordAuditEvent } from "@/lib/audit";
import { createNotification } from "@/lib/notifications";
import { getClientIp } from "@/lib/utils";

const VISIBILITY_NOTE =
  "This request is visible to your operational manager and unit administrator. " +
  "It is NOT routed to the confidential welfare officer unless you separately request welfare support. " +
  "Raising a workload concern has no effect on your disciplinary record or performance score.";

const VALID_REASONS = [
  "hours_exceed_roster",
  "repeated_additional",
  "insufficient_recovery",
  "conflicting_deadlines",
  "postponed_rest",
  "capacity_exceeded",
  "other",
] as const;

// Workflow transitions
const VALID_TRANSITIONS: Record<string, string[]> = {
  submitted:             ["acknowledged", "closed_no_adjustment"],
  acknowledged:          ["under_review", "closed_no_adjustment"],
  under_review:          ["adjustment_proposed", "closed_no_adjustment"],
  adjustment_proposed:   ["resolved"],
  resolved:              [],
  closed_no_adjustment:  [],
};

export async function GET(request: NextRequest) {
  await dbReady();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: actorId, role, unitId } = session.user;
  const url = new URL(request.url);
  const status = url.searchParams.get("status");

  if (role === "personnel") {
    const rows = await db.select().from(workloadReviewRequests)
      .where(eq(workloadReviewRequests.requestedBy, actorId))
      .orderBy(desc(workloadReviewRequests.createdAt));
    return NextResponse.json({ requests: rows });
  }

  if (role === "admin") {
    const rows = await db.select().from(workloadReviewRequests)
      .orderBy(desc(workloadReviewRequests.createdAt)).limit(100);
    return NextResponse.json({ requests: rows });
  }

  // Duty managers / commanders — unit-scoped
  const dma = await db.select().from(dutyManagerAccess).where(
    and(eq(dutyManagerAccess.userId, actorId), eq(dutyManagerAccess.isActive, true))
  );
  const allowedUnitIds = dma.map((d) => d.unitId);
  const scopedUnit = unitId && allowedUnitIds.includes(unitId) ? unitId : (allowedUnitIds[0] ?? null);

  if (!scopedUnit) return NextResponse.json({ requests: [] });

  const rows = await db.select().from(workloadReviewRequests)
    .where(eq(workloadReviewRequests.unitId, scopedUnit))
    .orderBy(desc(workloadReviewRequests.createdAt)).limit(100);
  return NextResponse.json({ requests: rows, visibilityNote: VISIBILITY_NOTE });
}

export async function POST(request: NextRequest) {
  await dbReady();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "personnel") {
    return NextResponse.json({ error: "Only personnel can submit workload review requests" }, { status: 403 });
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
    reason: z.enum(VALID_REASONS),
    explanation: z.string().min(20).max(2000),
    preferredAdjustment: z.string().max(500).optional(),
    linkedDutyLedgerIds: z.array(z.number().int()).optional(),
    linkedAssignmentIds: z.array(z.number().int()).optional(),
    visibilityAcknowledged: z.literal(true, {
      errorMap: () => ({ message: "You must acknowledge who can see this request before submitting." }),
    }),
  });

  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  await validateCsrf(parsed.data.csrfToken);

  const [req] = await db.insert(workloadReviewRequests).values({
    requestedBy: actorId,
    unitId,
    reason: parsed.data.reason,
    explanation: parsed.data.explanation,
    preferredAdjustment: parsed.data.preferredAdjustment ?? null,
    linkedDutyLedgerIds: parsed.data.linkedDutyLedgerIds ?? null,
    linkedAssignmentIds: parsed.data.linkedAssignmentIds ?? null,
    visibilityAcknowledged: true,
    visibilityNote: VISIBILITY_NOTE,
    status: "submitted",
  }).returning({ id: workloadReviewRequests.id });

  await recordAuditEvent({
    actorId, actorRole: "personnel", event: "admin_action",
    subjectType: "workload_review", subjectId: req.id,
    metadata: { action: "submit", reason: parsed.data.reason },
    ipAddress: ip,
  });

  // Notify duty managers
  const dma = await db.select({ userId: dutyManagerAccess.userId }).from(dutyManagerAccess)
    .where(and(eq(dutyManagerAccess.unitId, unitId), eq(dutyManagerAccess.isActive, true)));
  for (const d of dma) {
    await createNotification({
      userId: d.userId, type: "system",
      title: "New workload review request",
      body: "A personnel member has submitted a workload review request.",
      link: "/roster/workload-requests",
    });
  }

  return NextResponse.json({
    ok: true,
    requestId: req.id,
    visibilityNote: VISIBILITY_NOTE,
  });
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

  // Personnel responding to a proposed adjustment
  const personnelResponseSchema = z.object({
    csrfToken: z.string(),
    id: z.number().int(),
    personnelResponse: z.string().min(5).max(1000),
  });

  // Manager updating status
  const managerSchema = z.object({
    csrfToken: z.string(),
    id: z.number().int(),
    newStatus: z.string(),
    proposedAdjustment: z.string().max(2000).optional(),
    closureNote: z.string().max(1000).optional(),
  });

  await validateCsrf((body as any)?.csrfToken ?? "");

  const [existing] = await db.select().from(workloadReviewRequests)
    .where(eq(workloadReviewRequests.id, (body as any)?.id ?? 0)).limit(1);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Personnel can respond to adjustment_proposed
  if (role === "personnel") {
    if (existing.requestedBy !== actorId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const parsed = personnelResponseSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
    await db.update(workloadReviewRequests).set({
      personnelResponse: parsed.data.personnelResponse,
      personnelRespondedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(workloadReviewRequests.id, parsed.data.id));
    return NextResponse.json({ ok: true });
  }

  // Manager update
  if (role !== "admin") {
    const dma = await db.select().from(dutyManagerAccess).where(
      and(eq(dutyManagerAccess.userId, actorId), eq(dutyManagerAccess.unitId, existing.unitId), eq(dutyManagerAccess.isActive, true))
    );
    if (dma.length === 0) return NextResponse.json({ error: "Forbidden — not your unit" }, { status: 403 });
  }

  const parsed = managerSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });

  // Validate transition
  const validNext = VALID_TRANSITIONS[existing.status] ?? [];
  if (!validNext.includes(parsed.data.newStatus)) {
    return NextResponse.json({
      error: `Invalid status transition: ${existing.status} → ${parsed.data.newStatus}`,
    }, { status: 400 });
  }

  const now = new Date();
  await db.update(workloadReviewRequests).set({
    status: parsed.data.newStatus,
    acknowledgedBy: parsed.data.newStatus === "acknowledged" ? actorId : existing.acknowledgedBy,
    acknowledgedAt: parsed.data.newStatus === "acknowledged" ? now : existing.acknowledgedAt,
    reviewedBy: ["under_review", "adjustment_proposed"].includes(parsed.data.newStatus)
      ? actorId : existing.reviewedBy,
    proposedAdjustment: parsed.data.proposedAdjustment ?? existing.proposedAdjustment,
    proposedAt: parsed.data.proposedAdjustment ? now : existing.proposedAt,
    closureNote: parsed.data.closureNote ?? existing.closureNote,
    closedAt: ["resolved", "closed_no_adjustment"].includes(parsed.data.newStatus) ? now : existing.closedAt,
    updatedAt: now,
  }).where(eq(workloadReviewRequests.id, parsed.data.id));

  await recordAuditEvent({
    actorId, actorRole: role, event: "admin_action",
    subjectType: "workload_review", subjectId: parsed.data.id,
    metadata: { action: "status_update", newStatus: parsed.data.newStatus },
    ipAddress: ip,
  });

  await createNotification({
    userId: existing.requestedBy, type: "system",
    title: "Your workload review request was updated",
    body: "Your workload review request status has been updated. Log in to see details.",
    link: "/workload/reviews",
  });

  return NextResponse.json({ ok: true });
}
