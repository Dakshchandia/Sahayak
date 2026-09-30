import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, dbReady } from "@/db";
import {
  welfareCases, users, assessments, assessmentFactors,
  supportRequests, caseStatusHistory, notifications
} from "@/db/schema";
import { eq, and, desc, inArray } from "drizzle-orm";
import { getSession } from "@/lib/auth/session";
import { validateCsrf } from "@/lib/auth/csrf";
import { recordAuditEvent } from "@/lib/audit";
import { createNotification } from "@/lib/notifications";
import { getClientIp } from "@/lib/utils";

// Valid case status transitions (server-enforced state machine)
const VALID_TRANSITIONS: Record<string, string[]> = {
  new:                  ["reviewed", "dismissed"],
  reviewed:             ["contacted", "dismissed"],
  contacted:            ["intervention_agreed", "follow_up", "dismissed"],
  intervention_agreed:  ["follow_up", "closed"],
  follow_up:            ["closed", "contacted"],
  closed:               [],
  dismissed:            [],
};

export async function GET(request: NextRequest) {
  await dbReady();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { role, unitId, id: officerId } = session.user;
  if (role !== "welfare_officer" && role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const statusFilter = url.searchParams.get("status");
  const search = url.searchParams.get("q");

  // Officers can only see cases for their unit
  let caseQuery = db
    .select({
      case: welfareCases,
      personnel: {
        id: users.id,
        name: users.name,
        personnelId: users.personnelId,
        unitId: users.unitId,
      },
    })
    .from(welfareCases)
    .innerJoin(users, eq(welfareCases.personnelId, users.id));

  // Unit scope restriction (enforced server-side, not just UI)
  if (role === "welfare_officer" && unitId) {
    caseQuery = caseQuery.where(eq(users.unitId, unitId)) as typeof caseQuery;
  }

  const cases = await caseQuery
    .orderBy(desc(welfareCases.lastActivityAt))
    .limit(100);

  // Apply search filter in-process
  const filtered = cases.filter((c) => {
    if (statusFilter && statusFilter !== "all" && c.case.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        c.personnel.name.toLowerCase().includes(q) ||
        (c.personnel.personnelId ?? "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  return NextResponse.json({ cases: filtered });
}

export async function POST(request: NextRequest) {
  await dbReady();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { role, unitId, id: officerId } = session.user;
  if (role !== "welfare_officer" && role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const ip = getClientIp(request);
  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }

  const schema = z.object({
    csrfToken: z.string(),
    action: z.enum(["open", "update_status", "assign"]),
    personnelId: z.number().int().optional(),
    caseId: z.number().int().optional(),
    status: z.enum(["new","reviewed","contacted","intervention_agreed","follow_up","closed","dismissed"]).optional(),
    closureReason: z.string().max(500).optional(),
    dismissalReason: z.string().max(500).optional(),
    nextFollowUpDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    assignToOfficerId: z.number().int().optional(),
  });

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  await validateCsrf(parsed.data.csrfToken);

  const { action } = parsed.data;

  if (action === "open") {
    if (!parsed.data.personnelId) {
      return NextResponse.json({ error: "personnelId required to open case" }, { status: 400 });
    }

    // Verify officer has scope over this personnel's unit
    const [person] = await db
      .select({ unitId: users.unitId })
      .from(users)
      .where(eq(users.id, parsed.data.personnelId))
      .limit(1);

    if (!person) return NextResponse.json({ error: "Personnel not found" }, { status: 404 });
    if (role === "welfare_officer" && unitId && person.unitId !== unitId) {
      return NextResponse.json({ error: "Forbidden — not in your unit" }, { status: 403 });
    }

    // Check for existing open case
    const existingOpen = await db
      .select({ id: welfareCases.id })
      .from(welfareCases)
      .where(
        and(
          eq(welfareCases.personnelId, parsed.data.personnelId),
          inArray(welfareCases.status, ["new","reviewed","contacted","intervention_agreed","follow_up"])
        )
      )
      .limit(1);

    let caseId: number;
    if (existingOpen.length > 0) {
      caseId = existingOpen[0].id;
    } else {
      const [newCase] = await db
        .insert(welfareCases)
        .values({
          personnelId: parsed.data.personnelId,
          assignedOfficerId: officerId,
          status: "new",
        })
        .returning({ id: welfareCases.id });
      caseId = newCase.id;
    }

    await recordAuditEvent({
      actorId: officerId,
      actorRole: role,
      event: "case_accessed",
      subjectType: "welfare_case",
      subjectId: caseId,
      ipAddress: ip,
    });

    // Full case detail with factors
    return getCaseDetail(caseId);
  }

  if (action === "update_status") {
    if (!parsed.data.caseId || !parsed.data.status) {
      return NextResponse.json({ error: "caseId and status required" }, { status: 400 });
    }

    const [existing] = await db
      .select()
      .from(welfareCases)
      .where(eq(welfareCases.id, parsed.data.caseId))
      .limit(1);

    if (!existing) return NextResponse.json({ error: "Case not found" }, { status: 404 });

    // Unit scope check
    const [person] = await db
      .select({ unitId: users.unitId })
      .from(users)
      .where(eq(users.id, existing.personnelId))
      .limit(1);

    if (role === "welfare_officer" && unitId && person?.unitId !== unitId) {
      return NextResponse.json({ error: "Forbidden — not in your unit" }, { status: 403 });
    }

    // Validate state machine transition
    const validNextStatuses = VALID_TRANSITIONS[existing.status] ?? [];
    if (!validNextStatuses.includes(parsed.data.status)) {
      return NextResponse.json(
        { error: `Invalid transition: ${existing.status} → ${parsed.data.status}` },
        { status: 400 }
      );
    }

    // Optimistic concurrency via version
    const result = await db
      .update(welfareCases)
      .set({
        status: parsed.data.status,
        closedAt: parsed.data.status === "closed" ? new Date() : existing.closedAt,
        closureReason: parsed.data.closureReason ?? existing.closureReason,
        dismissalReason: parsed.data.dismissalReason ?? existing.dismissalReason,
        nextFollowUpDate: parsed.data.nextFollowUpDate ?? existing.nextFollowUpDate,
        lastActivityAt: new Date(),
        version: existing.version + 1,
      })
      .where(and(eq(welfareCases.id, parsed.data.caseId), eq(welfareCases.version, existing.version)))
      .returning({ id: welfareCases.id });

    if (result.length === 0) {
      return NextResponse.json({ error: "Concurrent edit detected. Reload and retry." }, { status: 409 });
    }

    // Record status history
    await db.insert(caseStatusHistory).values({
      caseId: parsed.data.caseId,
      fromStatus: existing.status,
      toStatus: parsed.data.status,
      changedBy: officerId,
      reason: parsed.data.closureReason ?? parsed.data.dismissalReason ?? null,
    });

    await recordAuditEvent({
      actorId: officerId,
      actorRole: role,
      event: "case_updated",
      subjectType: "welfare_case",
      subjectId: parsed.data.caseId,
      metadata: { from: existing.status, to: parsed.data.status },
      ipAddress: ip,
    });

    // Notify the personnel member of status change
    await createNotification({
      userId: existing.personnelId,
      type: "case_status_changed",
      title: "Your welfare case has been updated",
      body: "Your welfare case status has been updated. Log in to SAHAYAK for details.",
      link: "/personnel/dashboard",
    });

    return NextResponse.json({ ok: true, caseId: parsed.data.caseId });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

async function getCaseDetail(caseId: number) {
  let [c] = await db
    .select()
    .from(welfareCases)
    .where(eq(welfareCases.id, caseId))
    .limit(1);

  if (!c) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [person] = await db
    .select({ id: users.id, name: users.name, personnelId: users.personnelId, unitId: users.unitId })
    .from(users)
    .where(eq(users.id, c.personnelId))
    .limit(1);

  // Get latest assessment — use isLatest flag rather than case.assessmentId
  // which is often null for older or seed-created cases.
  let latestAssessment = null;
  const [latestA] = await db
    .select()
    .from(assessments)
    .where(and(eq(assessments.userId, c.personnelId), eq(assessments.isLatest, true)))
    .orderBy(desc(assessments.assessedAt))
    .limit(1);

  if (latestA) {
    const factors = await db
      .select()
      .from(assessmentFactors)
      .where(eq(assessmentFactors.assessmentId, latestA.id));
    latestAssessment = { ...latestA, factors };

    // Sync welfare case priority with latest assessment priority if they differ
    if (c.priority !== latestA.priority) {
      await db
        .update(welfareCases)
        .set({ priority: latestA.priority, lastActivityAt: new Date() })
        .where(eq(welfareCases.id, caseId));
      c = { ...c, priority: latestA.priority };
    }
  }

  return NextResponse.json({
    case: c,
    personnel: person,
    assessment: latestAssessment,
  });
}
