/**
 * In-process token-bucket rate limiter for login attempts.
 * In production with multiple instances, replace the in-memory store
 * with a Redis-backed implementation (e.g. Upstash) using the same interface.
 */

interface Bucket {
  count: number;
  windowStart: number;
}

const store = new Map<string, Bucket>();
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = parseInt(process.env.LOGIN_MAX_ATTEMPTS ?? "5", 10);

function key(email: string, ip: string | null): string {
  return `${email}::${ip ?? "unknown"}`;
}

export function checkRateLimit(
  email: string,
  ip: string | null
): { allowed: boolean; remaining: number; resetAt: Date } {
  const k = key(email, ip);
  const now = Date.now();
  const bucket = store.get(k);

  if (!bucket || now - bucket.windowStart > WINDOW_MS) {
    // Fresh window
    store.set(k, { count: 0, windowStart: now });
    return {
      allowed: true,
      remaining: MAX_ATTEMPTS,
      resetAt: new Date(now + WINDOW_MS),
    };
  }

  const remaining = Math.max(0, MAX_ATTEMPTS - bucket.count);
  return {
    allowed: bucket.count < MAX_ATTEMPTS,
    remaining,
    resetAt: new Date(bucket.windowStart + WINDOW_MS),
  };
}

export function recordAttempt(email: string, ip: string | null): void {
  const k = key(email, ip);
  const now = Date.now();
  const bucket = store.get(k);

  if (!bucket || now - bucket.windowStart > WINDOW_MS) {
    store.set(k, { count: 1, windowStart: now });
  } else {
    bucket.count++;
  }
}

export function resetAttempts(email: string, ip: string | null): void {
  store.delete(key(email, ip));
}

// Periodic cleanup to avoid memory growth
setInterval(() => {
  const now = Date.now();
  for (const [k, bucket] of store.entries()) {
    if (now - bucket.windowStart > WINDOW_MS) store.delete(k);
  }
}, WINDOW_MS);
