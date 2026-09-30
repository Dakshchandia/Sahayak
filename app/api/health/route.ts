import { NextResponse } from "next/server";
import { db, dbReady } from "@/db";
import { sql } from "drizzle-orm";

export async function GET() {
  await dbReady();
  try {
    await db.execute(sql`SELECT 1`);
    return NextResponse.json({
      status: "ok",
      db: "connected",
      timestamp: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json(
      { status: "error", db: "unavailable" },
      { status: 503 }
    );
  }
}
