/**
 * Database connection — PGlite (local, zero-install) or PostgreSQL.
 *
 * Uses Node.js globalThis to share ONE PGlite instance across all
 * hot-reloaded route modules in Next.js dev mode. Without this, each
 * route worker would open a separate PGlite instance on the same file,
 * causing lock conflicts and repeated slow initializations.
 */

/* eslint-disable @typescript-eslint/no-require-imports */
// Use require() for Node built-ins — prevents Next.js webpack from
// substituting browser shims that break path.join() with URL objects.
const nodePath: typeof import("path") = require("path");

import * as schema from "./schema";

type AnyDb = ReturnType<typeof import("drizzle-orm/pglite").drizzle<typeof schema>>;

// Shared across hot-reloads via globalThis
declare global {
  // eslint-disable-next-line no-var
  var __sahayakDb: AnyDb | undefined;
  // eslint-disable-next-line no-var
  var __sahayakDbPromise: Promise<AnyDb> | undefined;
}

export async function dbReady(): Promise<void> {
  if (globalThis.__sahayakDb) return;
  if (globalThis.__sahayakDbPromise) {
    await globalThis.__sahayakDbPromise;
    return;
  }

  globalThis.__sahayakDbPromise = (async (): Promise<AnyDb> => {
    const url = process.env.DATABASE_URL ?? "";

    if (url && !url.startsWith("file:")) {
      try {
        return await createPostgres(url);
      } catch (err) {
        // On Vercel/production, do NOT fall back to PGlite — fail fast with a clear error
        if (process.env.NODE_ENV === "production") {
          throw new Error(
            `[db] PostgreSQL connection failed in production. Check DATABASE_URL env var.\nReason: ${(err as Error).message}`
          );
        }
        console.warn(
          "[db] PostgreSQL unreachable — using PGlite (local file db).\n" +
          "     Run 'docker compose up db' for a PostgreSQL server.\n" +
          `     Reason: ${(err as Error).message}`
        );
      }
    }

    return createPglite();
  })().then((db) => {
    globalThis.__sahayakDb = db;
    return db;
  });

  await globalThis.__sahayakDbPromise;
}

async function createPostgres(url: string): Promise<AnyDb> {
  const postgres = (await import("postgres")).default;
  const { drizzle } = await import("drizzle-orm/postgres-js");

  // Strip unsupported params from the URL for the postgres driver
  // (channel_binding is not supported by the postgres npm package)
  const cleanUrl = url
    .replace(/[&?]channel_binding=[^&]*/g, "")
    .replace(/\?&/, "?")
    .replace(/[?&]$/, "");

  const isNeon = cleanUrl.includes("neon.tech");

  const client = postgres(cleanUrl, {
    max: 3,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
    ssl: isNeon ? "require" : (cleanUrl.includes("sslmode=require") ? "require" : false),
  });

  await client`SELECT 1`;
  console.info("[db] PostgreSQL connected:", cleanUrl.replace(/:[^:@]*@/, ":***@").split("?")[0]);
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
  } catch (err: any) {
    const msg = String(err?.message ?? "");
    if (!msg.includes("already exists") && !msg.includes("duplicate")) {
      console.error("[db] Migration error:", msg);
    }
  }

  return db as unknown as AnyDb;
}

/**
 * Transparent proxy — every call delegates to the resolved instance.
 * Throws a clear error if used before dbReady().
 */
export const db: AnyDb = new Proxy({} as AnyDb, {
  get(_t, prop: string | symbol) {
    const instance = globalThis.__sahayakDb;
    if (!instance) {
      throw new Error(
        `[db] db.${String(prop)} called before dbReady() resolved. ` +
        "Add 'await dbReady()' at the top of the route handler."
      );
    }
    const val = (instance as unknown as Record<string | symbol, unknown>)[prop];
    return typeof val === "function" ? (val as Function).bind(instance) : val;
  },
});

/** For scripts/seed.ts */
export async function initDb(): Promise<AnyDb> {
  await dbReady();
  return globalThis.__sahayakDb!;
}

export * from "./schema";
