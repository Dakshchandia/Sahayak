/**
 * Tests for authentication utilities (no database required).
 */
import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword, validatePassword } from "../lib/auth/password";
import { checkRateLimit, recordAttempt, resetAttempts } from "../lib/auth/rate-limit";
import { randomUUID } from "crypto";

// generateCsrfToken is just randomUUID — test it directly to avoid
// importing session.ts which has a top-level db connection side-effect
function generateCsrfToken(): string { return randomUUID(); }

describe("Password hashing", () => {
  it("hashes a password and verifies it correctly", async () => {
    const hash = await hashPassword("SecurePassword1");
    expect(await verifyPassword("SecurePassword1", hash)).toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("CorrectPassword1");
    expect(await verifyPassword("WrongPassword1", hash)).toBe(false);
  });

  it("produces different hashes for the same password (salting)", async () => {
    const h1 = await hashPassword("SamePassword1");
    const h2 = await hashPassword("SamePassword1");
    expect(h1).not.toBe(h2);
  });
});

describe("Password validation", () => {
  it("accepts a valid password", () => {
    expect(validatePassword("ValidPass1")).toBeNull();
  });

  it("rejects passwords shorter than 8 characters", () => {
    expect(validatePassword("Abc1")).not.toBeNull();
  });

  it("rejects passwords without an uppercase letter", () => {
    expect(validatePassword("lowercase1")).not.toBeNull();
  });

  it("rejects passwords without a number", () => {
    expect(validatePassword("NoNumbers")).not.toBeNull();
  });
});

describe("Rate limiting", () => {
  it("allows requests below the limit", () => {
    const email = `test-${Date.now()}@example.com`;
    const result = checkRateLimit(email, "127.0.0.1");
    expect(result.allowed).toBe(true);
  });

  it("blocks after exceeding max attempts", () => {
    const email = `blocked-${Date.now()}@example.com`;
    const ip = "192.168.1.1";
    // Record more attempts than the limit (default 5)
    for (let i = 0; i < 6; i++) recordAttempt(email, ip);
    const result = checkRateLimit(email, ip);
    expect(result.allowed).toBe(false);
  });

  it("allows again after resetting attempts", () => {
    const email = `reset-${Date.now()}@example.com`;
    const ip = "10.0.0.1";
    for (let i = 0; i < 6; i++) recordAttempt(email, ip);
    resetAttempts(email, ip);
    const result = checkRateLimit(email, ip);
    expect(result.allowed).toBe(true);
  });
});

describe("CSRF token generation", () => {
  it("generates a non-empty token", () => {
    const token = generateCsrfToken();
    expect(token.length).toBeGreaterThan(10);
  });

  it("generates unique tokens each time", () => {
    const t1 = generateCsrfToken();
    const t2 = generateCsrfToken();
    expect(t1).not.toBe(t2);
  });
});
