/**
 * CSRF protection using the synchronizer token pattern.
 *
 * The CSRF token is generated at login and stored in the server-side session.
 * It is embedded in forms as a hidden field and verified on every state-mutating request.
 * Because the session cookie is HttpOnly, a cross-site attacker cannot read it.
 */
import { headers } from "next/headers";
import { getSession } from "./session";

export class CsrfError extends Error {
  constructor() {
    super("CSRF validation failed — invalid or missing token.");
    this.name = "CsrfError";
  }
}

/**
 * Validate the CSRF token from the request header or body.
 * Call this at the start of every Server Action or POST route handler.
 */
export async function validateCsrf(requestToken: string | null): Promise<void> {
  if (!requestToken) throw new CsrfError();

  const session = await getSession();
  if (!session) throw new CsrfError();

  // Constant-time comparison (timing-safe)
  if (!timingSafeEqual(session.csrfToken, requestToken)) {
    throw new CsrfError();
  }
}

/** Retrieve the current CSRF token for embedding in forms. */
export async function getCsrfToken(): Promise<string | null> {
  const session = await getSession();
  return session?.csrfToken ?? null;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
