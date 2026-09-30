/**
 * GET /api/personnel/checkin/month?year=2026&month=9
 *
 * Returns the authenticated user's check-ins for a specific calendar month.
 * Month is 1-indexed (1 = January … 12 = December).
 *
 * Privacy:
 *   - Identity derived from server-side session — never from client params.
 *   - Only the authenticated user's own records are returned.
 *   - Viewing history does not trigger a new assessment or AI request.
 *   - personal notes (concern field) are included — this endpoint is for
 *     the user themselves only.
 *
 * Timezone handling:
 *   - checkInDate is stored as a calendar date string (YYYY-MM-DD) in the DB.
 *   - We filter on that date string directly, so there is no UTC-shift issue.
 *   - The client is responsible for knowing which local date "today" is.
 */
import { NextRequest, NextResponse } from "next/server";
import { db, dbReady } from "@/db";
import { checkIns, consentRecords, checkInAnalyses } from "@/db/schema";
import { eq, and, gte, lte } from "drizzle-orm";
import { getSession } from "@/lib/auth/session";

export async function GET(request: NextRequest) {
  await dbReady();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "personnel") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const userId = session.user.id;
  const url = new URL(request.url);
  const yearParam  = url.searchParams.get("year");
  const monthParam = url.searchParams.get("month"); // 1-indexed

  const year  = yearParam  ? parseInt(yearParam,  10) : new Date().getFullYear();
  const month = monthParam ? parseInt(monthParam, 10) : new Date().getMonth() + 1;

  if (
    isNaN(year) || isNaN(month) ||
    month < 1 || month > 12 ||
    year < 2000 || year > 2100
  ) {
    return NextResponse.json({ error: "Invalid year or month" }, { status: 400 });
  }

  // Build ISO date strings for the first and last day of the requested month
  const firstDay = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDayDate = new Date(year, month, 0); // day 0 of next month = last day of this month
  const lastDay = `${year}-${String(month).padStart(2, "0")}-${String(lastDayDate.getDate()).padStart(2, "0")}`;

  // Fetch check-ins in the date range (filter on calendar date string — no UTC shift)
  const records = await db
    .select()
    .from(checkIns)
    .where(
      and(
        eq(checkIns.userId, userId),
        gte(checkIns.checkInDate, firstDay),
        lte(checkIns.checkInDate, lastDay)
      )
    )
    .orderBy(checkIns.checkInDate);

  // Check current consent status so the UI can label withdrawn-consent records correctly
  const [consent] = await db
    .select({ granted: consentRecords.granted, withdrawnAt: consentRecords.withdrawnAt })
    .from(consentRecords)
    .where(and(eq(consentRecords.userId, userId), eq(consentRecords.scope, "wellness_checkins")))
    .limit(1);

  return NextResponse.json({
    year,
    month,
    firstDay,
    lastDay,
    checkIns: records,
    // Include analysis summaries for each check-in (for calendar detail view)
    // Only metadata — full details fetched on demand via /api/personnel/checkin/analysis
    analyses: await (async () => {
      if (records.length === 0) return {};
      const analysisRows = await db
        .select({
          checkInId: checkInAnalyses.checkInId,
          summary: checkInAnalyses.summary,
          summarySource: checkInAnalyses.summarySource,
          revisedSummary: checkInAnalyses.revisedSummary,
          suggestedActions: checkInAnalyses.suggestedActions,
          invalidatedAt: checkInAnalyses.invalidatedAt,
          createdAt: checkInAnalyses.createdAt,
        })
        .from(checkInAnalyses)
        .where(eq(checkInAnalyses.userId, userId));
      const byCheckIn: Record<number, typeof analysisRows[0]> = {};
      for (const a of analysisRows) {
        if (a.checkInId !== null) byCheckIn[a.checkInId] = a;
      }
      return byCheckIn;
    })(),
    consentGranted: consent?.granted ?? false,
    consentWithdrawnAt: consent?.withdrawnAt ?? null,
  });
}
