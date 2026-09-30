/**
 * Compatibility shim — the original storage.ts used cloudflare:workers.
 * All database access now goes through db/index.ts (postgres.js + Drizzle ORM).
 */
export { db } from "@/db";
