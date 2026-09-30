/**
 * POST /api/personnel/checkin/followup
 * Store follow-up question answers and optionally refine the analysis summary.
 *
 * - Stores answers against the existing check-in analysis (not a new record).
 * - Preserves original answers — new answers append rather than replace.
 * - Generates a revised summary if AI consent is active.
 * - Does not affect the assessment score or priority.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, dbReady } from "@/db";
import { checkInAnalyses, consentRecords, checkIns } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getSession } from "@/lib/auth/session";
import { validateCsrf } from "@/lib/auth/csrf";
import { recordAuditEvent } from "@/lib/audit";
import { getClientIp } from "@/lib/utils";
import {
  refineInsightWithAnswers, type InsightResult,
  type CheckInSnapshot, type AssessmentSnapshot,
} from "@/lib/checkin-insight";

export async function POST(request: NextRequest) {
  await dbReady();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "personnel") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const userId = session.user.id;
  const ip = getClientIp(request);

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const schema = z.object({
    csrfToken: z.string(),
    checkInId: z.number().int(),
    answers: z.array(z.object({
      questionId: z.string(),
      answerId: z.string(),
      answerText: z.string().max(200),
    })).min(1).max(4),
  });

  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  await validateCsrf(parsed.data.csrfToken);

  const { checkInId, answers } = parsed.data;

  // Verify ownership of check-in
  const [ci] = await db.select().from(checkIns)
    .where(and(eq(checkIns.id, checkInId), eq(checkIns.userId, userId))).limit(1);
  if (!ci) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Fetch existing analysis
  const [analysis] = await db.select().from(checkInAnalyses)
    .where(and(eq(checkInAnalyses.checkInId, checkInId), eq(checkInAnalyses.userId, userId))).limit(1);
  if (!analysis) return NextResponse.json({ error: "No analysis found for this check-in. Generate analysis first." }, { status: 404 });

  // Consent
  const consentRows = await db.select().from(consentRecords).where(eq(consentRecords.userId, userId));
  const aiConsent = consentRows.find((c) => c.scope === "ai_processing")?.granted ?? false;

  // Merge with any existing answers (preserve history)
  const existingAnswers = (analysis.followUpAnswers as any[]) ?? [];
  const newAnswers = [...existingAnswers, ...answers];

  // Build a minimal context for the revision
  const currentSnapshot: CheckInSnapshot = {
    id: ci.id, checkInDate: ci.checkInDate, mood: ci.mood, sleepHours: ci.sleepHours,
    sleepQuality: ci.sleepQuality, fatigue: ci.fatigue, perceivedWorkload: ci.perceivedWorkload,
    concern: null, requestedSupport: ci.requestedSupport, createdAt: ci.createdAt.toISOString(),
  };
  const assessmentSnapshot: AssessmentSnapshot = {
    id: analysis.assessmentId ?? 0,
    rawScore: 0, maxPossibleScore: 103, priority: "routine",
    factors: [], plainExplanation: analysis.summary,
    missingDataFlags: [], dataCoverage: 0.7,
  };

  const originalInsight = {
    summary: analysis.summary,
    summarySource: analysis.summarySource as "gemini" | "template",
    observations: (analysis.observations as any[]) ?? [],
    trendSummary: analysis.trendSummary as any,
    suggestedActions: (analysis.suggestedActions as any[]) ?? [],
    followUpQuestions: (analysis.followUpQuestions as any[]) ?? [],
    missingContext: analysis.missingContext ?? [],
  } as InsightResult;

  const revised = await refineInsightWithAnswers(originalInsight, answers, {
    current: currentSnapshot,
    assessment: assessmentSnapshot,
    aiConsent,
  } as any);

  await db.update(checkInAnalyses).set({
    followUpAnswers: newAnswers as any,
    revisedSummary: revised.revisedSummary,
    revisedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(checkInAnalyses.id, analysis.id));

  await recordAuditEvent({
    actorId: userId, actorRole: "personnel",
    event: "checkin_edited",
    subjectType: "checkin_analysis", subjectId: analysis.id,
    metadata: { action: "followup_answers", questionCount: answers.length },
    ipAddress: ip,
  });

  const [updated] = await db.select().from(checkInAnalyses)
    .where(eq(checkInAnalyses.id, analysis.id)).limit(1);
  return NextResponse.json({ analysis: updated });
}
