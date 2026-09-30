/**
 * Session management — HttpOnly, SameSite=Lax, Secure (in production)
 * Sessions are stored in the database. The cookie contains the session ID only.
 */
import { cookies } from "next/headers";
import { db, dbReady } from "@/db";
import { sessions, users } from "@/db/schema";
import { eq, lt, and, gt } from "drizzle-orm";
import { randomUUID } from "crypto";

export type SessionUser = {
  id: number;
  name: string;
  email: string;
  role: "personnel" | "welfare_officer" | "commander" | "admin";
  unitId: number | null;
  personnelId: string | null;
};

const COOKIE_NAME = "sahayak_session";
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000; // 8 hours

function getCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_DURATION_MS / 1000,
  };
}

export async function createSession(
  userId: number,
  csrfToken: string,
  ipAddress?: string,
  userAgent?: string
): Promise<string> {
  await dbReady();
  const sessionId = randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  await db.insert(sessions).values({
    id: sessionId,
    userId,
    csrfToken,
    ipAddress: ipAddress ?? null,
    userAgent: userAgent ?? null,
    expiresAt,
  });

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, sessionId, getCookieOptions());

  return sessionId;
}

export async function getSession(): Promise<{
  user: SessionUser;
  csrfToken: string;
} | null> {
  await dbReady();
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(COOKIE_NAME)?.value;
  if (!sessionId) return null;

  const now = new Date();

  const result = await db
    .select({
      sessionId: sessions.id,
      csrfToken: sessions.csrfToken,
      expiresAt: sessions.expiresAt,
      userId: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      unitId: users.unitId,
      personnelId: users.personnelId,
      isActive: users.isActive,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.id, sessionId), gt(sessions.expiresAt, now)))
    .limit(1);

  if (result.length === 0) return null;
  const row = result[0];
  if (!row.isActive) return null;

  // Extend session on each access
  await db
    .update(sessions)
    .set({ lastAccessedAt: now })
    .where(eq(sessions.id, sessionId));

  return {
    user: {
      id: row.userId,
      name: row.name,
      email: row.email,
      role: row.role as SessionUser["role"],
      unitId: row.unitId,
      personnelId: row.personnelId,
    },
    csrfToken: row.csrfToken,
  };
}

export async function destroySession(): Promise<void> {
  await dbReady();
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(COOKIE_NAME)?.value;

  if (sessionId) {
    await db.delete(sessions).where(eq(sessions.id, sessionId));
    cookieStore.delete(COOKIE_NAME);
  }
}

export async function invalidateAllUserSessions(userId: number): Promise<void> {
  await dbReady();
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

/** Prune expired sessions — call from a periodic job or startup */
export async function pruneExpiredSessions(): Promise<void> {
  await dbReady();
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
}

export function generateCsrfToken(): string {
  return randomUUID();
}
