/**
 * Server-side authorization helpers.
 * Import these in Server Components, Server Actions and Route Handlers.
 * Hiding UI elements is NOT authorization — always call these server-side.
 */
import { redirect } from "next/navigation";
import { getSession, type SessionUser } from "./session";

type Role = SessionUser["role"];

export async function requireAuth(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session.user;
}

export async function requireRole(allowed: Role | Role[]): Promise<SessionUser> {
  const user = await requireAuth();
  const roles = Array.isArray(allowed) ? allowed : [allowed];
  if (!roles.includes(user.role)) {
    // Return 403-equivalent page rather than silently redirecting
    redirect("/unauthorized");
  }
  return user;
}

/**
 * Verify that the acting user can access the target personnel's data.
 * Rules:
 *   - personnel can only access their own data
 *   - welfare_officer can access personnel in their assigned unit
 *   - commander can access unit aggregates only (not individual records here)
 *   - admin can access any profile
 */
export async function requirePersonnelAccess(
  targetUserId: number
): Promise<SessionUser> {
  const user = await requireAuth();

  if (user.role === "admin") return user;

  if (user.role === "personnel") {
    if (user.id !== targetUserId) redirect("/unauthorized");
    return user;
  }

  if (user.role === "welfare_officer" || user.role === "commander") {
    // Further unit-scope check done in the data layer
    return user;
  }

  redirect("/unauthorized");
}

/** Returns the current session user or null — for conditional UI rendering. */
export async function getUser(): Promise<SessionUser | null> {
  const session = await getSession();
  return session?.user ?? null;
}
