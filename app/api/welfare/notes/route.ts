import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, dbReady } from "@/db";
import { caseNotes, welfareCases, users } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { getSession } from "@/lib/auth/session";
import { validateCsrf } from "@/lib/auth/csrf";
import { recordAuditEvent } from "@/lib/audit";
import { getClientIp } from "@/lib/utils";

export async function GET(request: NextRequest) {
  await dbReady();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { role, unitId, id: actorId } = session.user;
  if (role !== "welfare_officer" && role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const caseId = new URL(request.url).searchParams.get("caseId");
  if (!caseId) return NextResponse.json({ error: "caseId required" }, { status: 400 });

  // Verify officer has scope
  const [wcase] = await db
    .select({ personnelId: welfareCases.personnelId })
    .from(welfareCases)
    .where(eq(welfareCases.id, parseInt(caseId)))
    .limit(1);

  if (!wcase) return NextResponse.json({ error: "Case not found" }, { status: 404 });

  if (role === "welfare_officer" && unitId) {
    const [person] = await db
      .select({ unitId: users.unitId })
      .from(users)
      .where(eq(users.id, wcase.personnelId))
      .limit(1);
    if (person?.unitId !== unitId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const notes = await db
    .select({
      id: caseNotes.id,
      content: caseNotes.content,
      isConfidential: caseNotes.isConfidential,
      createdAt: caseNotes.createdAt,
      editedAt: caseNotes.editedAt,
      authorId: caseNotes.authorId,
    })
    .from(caseNotes)
    .where(eq(caseNotes.caseId, parseInt(caseId)))
    .orderBy(desc(caseNotes.createdAt));

  await recordAuditEvent({
    actorId,
    actorRole: role,
    event: "note_accessed",
    subjectType: "welfare_case",
    subjectId: caseId,
    metadata: { noteCount: notes.length },
  });

  return NextResponse.json({ notes });
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
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }

  const schema = z.object({
    csrfToken: z.string(),
    caseId: z.number().int(),
    content: z.string().min(1).max(2000),
    isConfidential: z.boolean().default(true),
  });

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  await validateCsrf(parsed.data.csrfToken);

  // Unit scope check
  const [wcase] = await db
    .select({ personnelId: welfareCases.personnelId })
    .from(welfareCases)
    .where(eq(welfareCases.id, parsed.data.caseId))
    .limit(1);

  if (!wcase) return NextResponse.json({ error: "Case not found" }, { status: 404 });

  if (role === "welfare_officer" && unitId) {
    const [person] = await db
      .select({ unitId: users.unitId })
      .from(users)
      .where(eq(users.id, wcase.personnelId))
      .limit(1);
    if (person?.unitId !== unitId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const [note] = await db
    .insert(caseNotes)
    .values({
      caseId: parsed.data.caseId,
      authorId: actorId,
      content: parsed.data.content,
      isConfidential: parsed.data.isConfidential,
    })
    .returning({ id: caseNotes.id });

  await recordAuditEvent({
    actorId,
    actorRole: role,
    event: "note_created",
    subjectType: "welfare_case",
    subjectId: parsed.data.caseId,
    ipAddress: ip,
  });

  // Update case activity timestamp
  await db
    .update(welfareCases)
    .set({ lastActivityAt: new Date() })
    .where(eq(welfareCases.id, parsed.data.caseId));

  return NextResponse.json({ ok: true, noteId: note.id });
}
