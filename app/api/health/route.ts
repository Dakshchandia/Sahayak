import { NextResponse } from "next/server";

export async function GET() {
  const results: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    env: {
      NODE_ENV: process.env.NODE_ENV,
      DATABASE_URL: process.env.DATABASE_URL
        ? process.env.DATABASE_URL.replace(/:[^:@]*@/, ":***@").split("?")[0]
        : "NOT SET",
      SESSION_SECRET: process.env.SESSION_SECRET ? "SET" : "NOT SET",
      GEMINI_API_KEY: process.env.GEMINI_API_KEY ? "SET" : "NOT SET",
    },
  };

  try {
    const { dbReady, db } = await import("@/db");
    await dbReady();
    const res = await (db as any).execute("SELECT 1 as ok");
    results.database = { status: "connected", result: res };
  } catch (err) {
    results.database = { status: "error", message: (err as Error).message };
  }

  return NextResponse.json(results);
}
