import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, dbReady } from "@/db";
import { supportRequests, users, welfareCases } from "@/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { getSession } from "@/lib/auth/session";
import { validateCsrf } from "@/lib/auth/csrf";
import { recordAuditEvent } from "@/lib/audit";
import { createNotification } from "@/lib/notifications";
import { getClientIp } from "@/lib/utils";

const supportSchema = z.object({
  csrfToken: z.string(),
  preferredContact: z.enum(["in_person", "phone", "message"]).optional(),
  availabilityNote: z.string().max(200).optional(),
  urgency: z.enum(["standard", "urgent"]).default("standard"),
});

export async function GET(request: NextRequest) {
  await dbReady();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "personnel")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const requests = await db
    .select()
    .from(supportRequests)
    .where(eq(supportRequests.userId, session.user.id))
    .orderBy(desc(supportRequests.createdAt))
    .limit(10);

  return NextResponse.json({ requests });
}

export async function POST(request: NextRequest) {
  await dbReady();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "personnel")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const ip = getClientIp(request);
  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }

  const parsed = supportSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  await validateCsrf(parsed.data.csrfToken);

  const userId = session.user.id;

  const [req] = await db
    .insert(supportRequests)
    .values({
      userId,
      preferredContact: parsed.data.preferredContact ?? null,
      availabilityNote: parsed.data.availabilityNote ?? null,
      urgency: parsed.data.urgency,
    })
    .returning({ id: supportRequests.id });

  await recordAuditEvent({
    actorId: userId,
    actorRole: "personnel",
    event: "support_requested",
    subjectType: "support_request",
    subjectId: req.id,
    ipAddress: ip,
  });

  // Notify welfare officers in the unit ONLY (not all unit members)
  const unitId = session.user.unitId;
  let notificationCreated = false;
  if (unitId) {
    const officers = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.unitId, unitId), eq(users.role, "welfare_officer")));

    for (const officer of officers) {
      await createNotification({
        userId: officer.id,
        type: "support_request_received",
        title: "New support request",
        // Generic body — no sensitive wellness details
        body: "A personnel member in your unit has submitted a support request.",
        link: "/welfare/cases",
      });
      notificationCreated = true;
    }
  }

  return NextResponse.json({
    ok: true,
    requestId: req.id,
    // Accurate status: submitted = persisted to DB, notificationQueued = in-app notification created.
    // These do NOT guarantee the officer has seen it.
    status: "submitted",
    notificationQueued: notificationCreated,
  });
}
