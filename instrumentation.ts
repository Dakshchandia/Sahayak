/**
 * Next.js instrumentation hook — runs ONCE when the server starts,
 * before any requests are handled. We use it to pre-initialize PGlite
 * so the first login request doesn't have to wait for WASM to load.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { dbReady } = await import("./db/index");
      await dbReady();
      console.info("[startup] Database ready");
    } catch (err) {
      console.error("[startup] Database initialization failed:", err);
    }
  }
}
