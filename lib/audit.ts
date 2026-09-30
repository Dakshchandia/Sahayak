/**
 * Audit event service.
 * All sensitive record access, mutations and consent changes are recorded here.
 *
 * Limitations (documented honestly):
 * - Records are stored in a regular PostgreSQL table with timestamps.
 * - They are NOT cryptographically signed or append-only at the database level.
 * - Deletion is possible via direct DB access — this is audit history, not
 *   a compliance ledger with tamper-evidence guarantees.
 * - For a production deployment requiring immutability, replace this with
 *   an append-only write path (e.g. WAL streaming, Ledger DB, or external SIEM).
 */
import { db, dbReady } from "@/db";
import { auditEvents, type auditEventEnum } from "@/db/schema";
import type { InferSelectModel } from "drizzle-orm";

type AuditEventType = (typeof auditEventEnum.enumValues)[number];

interface AuditOptions {
  actorId?: number | null;
  actorRole?: string | null;
  event: AuditEventType;
  subjectType?: string;
  subjectId?: string | number;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
}

/**
 * Record an audit event. Does not throw — audit failures are logged but do
 * not block the primary operation (fail-open for availability; if tamper-
 * evidence is required, flip this to fail-closed).
 */
export async function recordAuditEvent(opts: AuditOptions): Promise<void> {
  try {
    await dbReady();
    await db.insert(auditEvents).values({
      actorId: opts.actorId ?? null,
      actorRole: opts.actorRole ?? null,
      event: opts.event,
      subjectType: opts.subjectType ?? null,
      subjectId: opts.subjectId?.toString() ?? null,
      metadata: opts.metadata ?? null,
      ipAddress: opts.ipAddress ?? null,
    });
  } catch (err) {
    // Log but do not rethrow — audit write must not break the primary flow
    console.error("[audit] Failed to write audit event:", err);
  }
}
