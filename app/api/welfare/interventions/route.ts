import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, dbReady } from "@/db";
import { interventions, welfareCases, users } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { getSession } from "@/lib/auth/session";
import { validateCsrf } from "@/lib/auth/csrf";
import { recordAuditEvent } from "@/lib/audit";
import { getClientIp } from "@/lib/utils";

export async function GET(request: NextRequest) {
  await dbReady();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { role, unitId } = session.user;
  if (role !== "welfare_officer" && role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const caseId = new URL(request.url).searchParams.get("caseId");
  if (!caseId) return NextResponse.json({ error: "caseId required" }, { status: 400 });

  // Scope check
  const [wcase] = await db.select({ personnelId: welfareCases.personnelId })
    .from(welfareCases).where(eq(welfareCases.id, parseInt(caseId))).limit(1);
  if (!wcase) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (role === "welfare_officer" && unitId) {
    const [person] = await db.select({ unitId: users.unitId })
      .from(users).where(eq(users.id, wcase.personnelId)).limit(1);
    if (person?.unitId !== unitId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await db.select().from(interventions)
    .where(eq(interventions.caseId, parseInt(caseId)))
    .orderBy(desc(interventions.createdAt));

  return NextResponse.json({ interventions: result });
}

export async function POST(request: NextRequest) {
  await dbReady();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { role, unitId, id: actorId } = session.user;
  if (role !== "welfare_officer" && role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const ip = getClientIp(request);
  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const schema = z.object({
    csrfToken: z.string(),
    caseId: z.number().int(),
    type: z.enum(["welfare_conversation","counsellor_referral","leave_review",
      "duty_adjustment","recovery_planning","follow_up_conversation","no_action_needed"]),
    description: z.string().max(1000).optional(),
    agreedAt: z.string().datetime().optional(),
  });

  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  await validateCsrf(parsed.data.csrfToken);

  // Scope check
  const [wcase] = await db.select({ personnelId: welfareCases.personnelId })
    .from(welfareCases).where(eq(welfareCases.id, parsed.data.caseId)).limit(1);
  if (!wcase) return NextResponse.json({ error: "Case not found" }, { status: 404 });
  if (role === "welfare_officer" && unitId) {
    const [person] = await db.select({ unitId: users.unitId })
      .from(users).where(eq(users.id, wcase.personnelId)).limit(1);
    if (person?.unitId !== unitId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [intervention] = await db.insert(interventions).values({
    caseId: parsed.data.caseId,
    recordedBy: actorId,
    type: parsed.data.type,
    description: parsed.data.description ?? null,
    agreedAt: parsed.data.agreedAt ? new Date(parsed.data.agreedAt) : null,
  }).returning({ id: interventions.id });

  // Update case activity
  await db.update(welfareCases).set({ lastActivityAt: new Date() })
    .where(eq(welfareCases.id, parsed.data.caseId));

  await recordAuditEvent({
    actorId, actorRole: role, event: "intervention_recorded",
    subjectType: "welfare_case", subjectId: parsed.data.caseId,
    metadata: { type: parsed.data.type }, ipAddress: ip,
  });

  return NextResponse.json({ ok: true, interventionId: intervention.id });
}
