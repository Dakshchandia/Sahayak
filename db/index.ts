/**
 * Database connection — PostgreSQL (production) or PGlite (local dev).
 *
 * Uses globalThis to share ONE instance across hot-reloads in Next.js dev.
 * On Vercel serverless, each cold start creates a fresh connection.
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

  // If there's already a pending promise, wait for it
  if (globalThis.__sahayakDbPromise) {
    try {
      await globalThis.__sahayakDbPromise;
      return;
    } catch {
      // Previous attempt failed — clear it and retry
      globalThis.__sahayakDbPromise = undefined;
      globalThis.__sahayakDb = undefined;
    }
  }

  const promise = (async (): Promise<AnyDb> => {
    const url = process.env.DATABASE_URL ?? "";

    if (url && !url.startsWith("file:")) {
      const db = await createPostgres(url);
      return db;
    }

    // No DATABASE_URL — use PGlite (local dev only)
    if (process.env.NODE_ENV === "production") {
      throw new Error("[db] DATABASE_URL is not set. Cannot start in production without a database.");
    }
    return createPglite();
  })();

  globalThis.__sahayakDbPromise = promise;

  try {
    globalThis.__sahayakDb = await promise;
  } catch (err) {
    // Clear so next request retries
    globalThis.__sahayakDbPromise = undefined;
    globalThis.__sahayakDb = undefined;
    throw err;
  }
}

function cleanDatabaseUrl(url: string): string {
  // Remove params unsupported by the postgres npm driver
  return url
    .replace(/[&?]channel_binding=[^&]*/g, "")
    .replace(/[&?]pgbouncer=[^&]*/g, "")
    .replace(/\?&/, "?")
    .replace(/[?&]$/, "");
}

async function createPostgres(url: string): Promise<AnyDb> {
  const postgres = (await import("postgres")).default;
  const { drizzle } = await import("drizzle-orm/postgres-js");

  const cleanUrl = cleanDatabaseUrl(url);
  const isNeon = cleanUrl.includes("neon.tech");

  console.info("[db] Connecting to PostgreSQL...", cleanUrl.replace(/:[^:@]*@/, ":***@").split("?")[0]);

  const client = postgres(cleanUrl, {
    max: 3,
    idle_timeout: 30,
    connect_timeout: 15,
    prepare: false,
    ssl: isNeon ? "require" : undefined,
    onnotice: () => {}, // suppress notices
  });

  // Test connection
  try {
    await client`SELECT 1 as ok`;
  } catch (err) {
    await client.end({ timeout: 1 }).catch(() => {});
    throw new Error(`[db] Connection test failed: ${(err as Error).message}`);
  }

  console.info("[db] PostgreSQL connected ✓");
  return drizzle(client, { schema }) as unknown as AnyDb;
}

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
    console.info("[db] Migrations applied");
  } catch (err: unknown) {
    const msg = String((err as Error)?.message ?? "");
    if (!msg.includes("already exists") && !msg.includes("duplicate")) {
      console.error("[db] Migration error:", msg);
    }
  }

  return db as unknown as AnyDb;
}

/**
 * Transparent proxy — delegates every call to the resolved db instance.
 */
export const db: AnyDb = new Proxy({} as AnyDb, {
  get(_t, prop: string | symbol) {
    const instance = globalThis.__sahayakDb;
    if (!instance) {
      throw new Error(
        `[db] db.${String(prop)} called before dbReady() resolved. ` +
        "Ensure 'await dbReady()' is called at the top of the route handler."
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
