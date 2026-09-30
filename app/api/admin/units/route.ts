import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, dbReady } from "@/db";
import { units } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth/session";
import { validateCsrf } from "@/lib/auth/csrf";
import { recordAuditEvent } from "@/lib/audit";
import { getClientIp } from "@/lib/utils";

export async function GET() {
  await dbReady();
  const session = await getSession();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const allUnits = await db.select().from(units).orderBy(units.name);
  return NextResponse.json({ units: allUnits });
}

export async function POST(request: NextRequest) {
  await dbReady();
  const session = await getSession();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const ip = getClientIp(request);
  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const schema = z.discriminatedUnion("action", [
    z.object({
      action: z.literal("create"),
      csrfToken: z.string(),
      name: z.string().min(1).max(80),
      code: z.string().min(1).max(20).toUpperCase(),
      description: z.string().max(200).optional(),
      minimumGroupSize: z.number().int().min(1).max(100).default(10),
    }),
    z.object({
      action: z.literal("update"),
      csrfToken: z.string(),
      unitId: z.number().int(),
      name: z.string().min(1).max(80).optional(),
      description: z.string().max(200).optional(),
      minimumGroupSize: z.number().int().min(1).max(100).optional(),
    }),
  ]);

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }
  await validateCsrf(parsed.data.csrfToken);

  if (parsed.data.action === "create") {
    const [unit] = await db
      .insert(units)
      .values({
        name: parsed.data.name,
        code: parsed.data.code,
        description: parsed.data.description ?? null,
        minimumGroupSize: parsed.data.minimumGroupSize,
      })
      .returning({ id: units.id });

    await recordAuditEvent({
      actorId: session.user.id,
      actorRole: "admin",
      event: "admin_action",
      subjectType: "unit",
      subjectId: unit.id,
      metadata: { action: "create", name: parsed.data.name },
      ipAddress: ip,
    });
    return NextResponse.json({ ok: true, unitId: unit.id });
  }

  if (parsed.data.action === "update") {
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (parsed.data.name) updates.name = parsed.data.name;
    if (parsed.data.description !== undefined) updates.description = parsed.data.description;
    if (parsed.data.minimumGroupSize !== undefined) updates.minimumGroupSize = parsed.data.minimumGroupSize;

    await db.update(units).set(updates).where(eq(units.id, parsed.data.unitId));
    await recordAuditEvent({
      actorId: session.user.id, actorRole: "admin", event: "admin_action",
      subjectType: "unit", subjectId: parsed.data.unitId,
      metadata: { action: "update", ...updates }, ipAddress: ip,
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
