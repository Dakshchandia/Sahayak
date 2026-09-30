import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, dbReady } from "@/db";
import { users, loginAttempts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { verifyPassword } from "@/lib/auth/password";
import { createSession, generateCsrfToken } from "@/lib/auth/session";
import { checkRateLimit, recordAttempt, resetAttempts } from "@/lib/auth/rate-limit";
import { recordAuditEvent } from "@/lib/audit";
import { getClientIp } from "@/lib/utils";

const loginSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  password: z.string().min(1),
});

export async function POST(request: NextRequest) {
  await dbReady();
  const ip = getClientIp(request);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }

  const { email, password } = parsed.data;

  // Check rate limit
  const rateLimit = checkRateLimit(email, ip);
  if (!rateLimit.allowed) {
    const minutesLeft = Math.ceil(
      (rateLimit.resetAt.getTime() - Date.now()) / 60_000
    );
    return NextResponse.json(
      { error: `Too many login attempts. Please wait ${minutesLeft} minutes.` },
      { status: 429 }
    );
  }

  // Record the attempt
  recordAttempt(email, ip);

  // Persist login attempt for audit
  await db.insert(loginAttempts).values({ email, ipAddress: ip, success: false }).catch(() => {});

  // Find user
  const user = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (user.length === 0) {
    // Delay to prevent timing attacks
    await new Promise((r) => setTimeout(r, 200));
    await recordAuditEvent({ event: "login_failed", metadata: { email }, ipAddress: ip });
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }

  const u = user[0];

  if (!u.isActive) {
    await recordAuditEvent({ event: "login_failed", metadata: { email, reason: "inactive" }, ipAddress: ip });
    return NextResponse.json({ error: "Account is disabled. Contact your administrator." }, { status: 403 });
  }

  const valid = await verifyPassword(password, u.passwordHash);
  if (!valid) {
    await recordAuditEvent({ event: "login_failed", actorId: u.id, ipAddress: ip });
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }

  // Success — reset rate limit and create session
  resetAttempts(email, ip);

  const csrfToken = generateCsrfToken();
  const userAgent = request.headers.get("user-agent") ?? undefined;
  await createSession(u.id, csrfToken, ip ?? undefined, userAgent);

  // Update login timestamp
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, u.id));

  // Update login attempt record as successful
  await db
    .update(loginAttempts)
    .set({ success: true })
    .where(eq(loginAttempts.email, email));

  await recordAuditEvent({
    actorId: u.id,
    actorRole: u.role,
    event: "login",
    ipAddress: ip,
  });

  return NextResponse.json({
    user: {
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      unitId: u.unitId,
      personnelId: u.personnelId,
      mustChangePassword: u.mustChangePassword,
    },
    csrfToken,
  });
}
