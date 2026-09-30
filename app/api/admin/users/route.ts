import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, dbReady } from "@/db";
import { users, units } from "@/db/schema";
import { eq, ilike, or } from "drizzle-orm";
import { getSession } from "@/lib/auth/session";
import { validateCsrf } from "@/lib/auth/csrf";
import { hashPassword, validatePassword } from "@/lib/auth/password";
import { invalidateAllUserSessions } from "@/lib/auth/session";
import { recordAuditEvent } from "@/lib/audit";
import { getClientIp } from "@/lib/utils";

async function requireAdmin(request: Request) {
  const session = await getSession();
  if (!session) return null;
  if (session.user.role !== "admin") return null;
  return session;
}

export async function GET(request: NextRequest) {
  await dbReady();
  const session = await requireAdmin(request);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? "";
  const role = url.searchParams.get("role");

  const allUsers = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      unitId: users.unitId,
      personnelId: users.personnelId,
      isActive: users.isActive,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(users.createdAt);

  const allUnits = await db.select().from(units);

  const filtered = allUsers.filter((u) => {
    const matchSearch =
      !q ||
      u.name.toLowerCase().includes(q.toLowerCase()) ||
      u.email.toLowerCase().includes(q.toLowerCase()) ||
      (u.personnelId ?? "").toLowerCase().includes(q.toLowerCase());
    const matchRole = !role || u.role === role;
    return matchSearch && matchRole;
  });

  return NextResponse.json({ users: filtered, units: allUnits });
}

export async function POST(request: NextRequest) {
  await dbReady();
  const session = await requireAdmin(request);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const ip = getClientIp(request);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const schema = z.discriminatedUnion("action", [
    z.object({
      action: z.literal("create"),
      csrfToken: z.string(),
      name: z.string().min(2).max(100),
      email: z.string().email().toLowerCase(),
      password: z.string().min(8),
      role: z.enum(["personnel", "welfare_officer", "commander", "admin"]),
      unitId: z.number().int().nullable().optional(),
      personnelId: z.string().max(20).nullable().optional(),
    }),
    z.object({
      action: z.literal("update"),
      csrfToken: z.string(),
      userId: z.number().int(),
      name: z.string().min(2).max(100).optional(),
      role: z.enum(["personnel", "welfare_officer", "commander", "admin"]).optional(),
      unitId: z.number().int().nullable().optional(),
      isActive: z.boolean().optional(),
    }),
    z.object({
      action: z.literal("reset_password"),
      csrfToken: z.string(),
      userId: z.number().int(),
      newPassword: z.string().min(8),
    }),
  ]);

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  await validateCsrf(parsed.data.csrfToken);

  if (parsed.data.action === "create") {
    const pwError = validatePassword(parsed.data.password);
    if (pwError) return NextResponse.json({ error: pwError }, { status: 400 });

    // Check email uniqueness
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, parsed.data.email))
      .limit(1);
    if (existing.length > 0) {
      return NextResponse.json({ error: "Email already in use." }, { status: 409 });
    }

    const hash = await hashPassword(parsed.data.password);
    const [newUser] = await db
      .insert(users)
      .values({
        name: parsed.data.name,
        email: parsed.data.email,
        passwordHash: hash,
        role: parsed.data.role,
        unitId: parsed.data.unitId ?? null,
        personnelId: parsed.data.personnelId ?? null,
        isActive: true,
        mustChangePassword: true,
      })
      .returning({ id: users.id });

    await recordAuditEvent({
      actorId: session.user.id,
      actorRole: "admin",
      event: "admin_action",
      subjectType: "user",
      subjectId: newUser.id,
      metadata: { action: "create", role: parsed.data.role },
      ipAddress: ip,
    });

    return NextResponse.json({ ok: true, userId: newUser.id });
  }

  if (parsed.data.action === "update") {
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (parsed.data.name !== undefined) updates.name = parsed.data.name;
    if (parsed.data.role !== undefined) updates.role = parsed.data.role;
    if ("unitId" in parsed.data) updates.unitId = parsed.data.unitId;
    if (parsed.data.isActive !== undefined) updates.isActive = parsed.data.isActive;

    await db.update(users).set(updates).where(eq(users.id, parsed.data.userId));

    // If deactivating, invalidate their sessions
    if (parsed.data.isActive === false) {
      await invalidateAllUserSessions(parsed.data.userId);
    }

    await recordAuditEvent({
      actorId: session.user.id,
      actorRole: "admin",
      event: parsed.data.role !== undefined ? "role_changed" : "admin_action",
      subjectType: "user",
      subjectId: parsed.data.userId,
      metadata: updates,
      ipAddress: ip,
    });

    return NextResponse.json({ ok: true });
  }

  if (parsed.data.action === "reset_password") {
    const pwError = validatePassword(parsed.data.newPassword);
    if (pwError) return NextResponse.json({ error: pwError }, { status: 400 });

    const hash = await hashPassword(parsed.data.newPassword);
    await db
      .update(users)
      .set({ passwordHash: hash, mustChangePassword: true, updatedAt: new Date() })
      .where(eq(users.id, parsed.data.userId));

    await invalidateAllUserSessions(parsed.data.userId);

    await recordAuditEvent({
      actorId: session.user.id,
      actorRole: "admin",
      event: "admin_action",
      subjectType: "user",
      subjectId: parsed.data.userId,
      metadata: { action: "password_reset" },
      ipAddress: ip,
    });

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
