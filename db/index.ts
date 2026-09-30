/**
 * Database connection — PostgreSQL (production/Neon) or PGlite (local dev).
 *
 * Uses @neondatabase/serverless on Vercel (HTTP transport, works in serverless).
 * Uses postgres npm package for local PostgreSQL dev.
 * Falls back to PGlite for zero-install local development.
 */

/* eslint-disable @typescript-eslint/no-require-imports */
const nodePath: typeof import("path") = require("path");

import * as schema from "./schema";

type AnyDb = ReturnType<typeof import("drizzle-orm/pglite").drizzle<typeof schema>>;

declare global {
  // eslint-disable-next-line no-var
  var __sahayakDb: AnyDb | undefined;
  // eslint-disable-next-line no-var
  var __sahayakDbPromise: Promise<AnyDb> | undefined;
}

export async function dbReady(): Promise<void> {
  if (globalThis.__sahayakDb) return;

  if (globalThis.__sahayakDbPromise) {
    try {
      await globalThis.__sahayakDbPromise;
      return;
    } catch {
      globalThis.__sahayakDbPromise = undefined;
      globalThis.__sahayakDb = undefined;
    }
  }

  const promise = (async (): Promise<AnyDb> => {
    const url = process.env.DATABASE_URL ?? "";

    if (url && !url.startsWith("file:")) {
      // Use Neon serverless driver in production (Vercel)
      // Use postgres npm package in local dev
      if (process.env.NODE_ENV === "production" || url.includes("neon.tech")) {
        return await createNeonServerless(url);
      }
      return await createPostgres(url);
    }

    if (process.env.NODE_ENV === "production") {
      throw new Error("[db] DATABASE_URL is not set in production.");
    }
    return createPglite();
  })();

  globalThis.__sahayakDbPromise = promise;

  try {
    globalThis.__sahayakDb = await promise;
  } catch (err) {
    globalThis.__sahayakDbPromise = undefined;
    globalThis.__sahayakDb = undefined;
    throw err;
  }
}

function cleanUrl(url: string): string {
  return url
    .replace(/[&?]channel_binding=[^&]*/g, "")
    .replace(/[&?]pgbouncer=[^&]*/g, "")
    .replace(/\?&/, "?")
    .replace(/[?&]$/, "");
}

/**
 * Neon serverless driver — uses HTTP fetch transport.
 * Works in Vercel serverless functions (no TCP socket needed).
 */
async function createNeonServerless(url: string): Promise<AnyDb> {
  const { neon } = await import("@neondatabase/serverless");
  const { drizzle } = await import("drizzle-orm/neon-http");

  const clean = cleanUrl(url);
  console.info("[db] Neon serverless connecting...", clean.replace(/:[^:@]*@/, ":***@").split("?")[0]);

  const sql = neon(clean);
  const db = drizzle(sql, { schema });

  // Test connection
  try {
    await sql`SELECT 1 as ok`;
    console.info("[db] Neon serverless connected ✓");
  } catch (err) {
    throw new Error(`[db] Neon connection test failed: ${(err as Error).message}`);
  }

  return db as unknown as AnyDb;
}

/**
 * Standard postgres npm driver — for local PostgreSQL dev.
 */
async function createPostgres(url: string): Promise<AnyDb> {
  const postgres = (await import("postgres")).default;
  const { drizzle } = await import("drizzle-orm/postgres-js");

  const clean = cleanUrl(url);
  console.info("[db] PostgreSQL connecting...", clean.replace(/:[^:@]*@/, ":***@").split("?")[0]);

  const client = postgres(clean, {
    max: 3,
    idle_timeout: 30,
    connect_timeout: 15,
    prepare: false,
  });

  try {
    await client`SELECT 1 as ok`;
    console.info("[db] PostgreSQL connected ✓");
  } catch (err) {
    await client.end({ timeout: 1 }).catch(() => {});
    throw new Error(`[db] PostgreSQL connection failed: ${(err as Error).message}`);
  }

  return drizzle(client, { schema }) as unknown as AnyDb;
}

/**
 * PGlite — zero-install local dev only.
 */
async function createPglite(): Promise<AnyDb> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");

  const dataDir = nodePath.join(process.cwd(), ".pglite");
  const migrationsDir = nodePath.join(process.cwd(), "drizzle");

  console.info(`[db] PGlite → ${dataDir}`);
  const client = new PGlite(dataDir);
  await client.waitReady;
  const db = drizzle(client, { schema });

  try {
    await migrate(db, { migrationsFolder: migrationsDir });
    console.info("[db] PGlite migrations applied");
  } catch (err: unknown) {
    const msg = String((err as Error)?.message ?? "");
    if (!msg.includes("already exists") && !msg.includes("duplicate")) {
      console.error("[db] Migration error:", msg);
    }
  }

  return db as unknown as AnyDb;
}

export const db: AnyDb = new Proxy({} as AnyDb, {
  get(_t, prop: string | symbol) {
    const instance = globalThis.__sahayakDb;
    if (!instance) {
      throw new Error(
        `[db] db.${String(prop)} called before dbReady(). Add 'await dbReady()' at the top of the route handler.`
      );
    }
    const val = (instance as unknown as Record<string | symbol, unknown>)[prop];
    return typeof val === "function" ? (val as Function).bind(instance) : val;
  },
});

export async function initDb(): Promise<AnyDb> {
  await dbReady();
  return globalThis.__sahayakDb!;
}

export * from "./schema";
