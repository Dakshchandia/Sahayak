/**
 * GET  /api/personnel/checkin/conversation?checkInId=N — load conversation history
 * POST /api/personnel/checkin/conversation           — send a message, get AI reply
 *
 * - Conversation is scoped to a single check-in.
 * - User input is sanitized before being sent to AI.
 * - Prompt-injection patterns are filtered.
 * - AI cannot execute actions, access other records, or modify data.
 * - Raw message content is stored in DB but excluded from audit log bodies.
 * - AI must not diagnose, prescribe, or claim clinical authority.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, dbReady } from "@/db";
import { checkInConversations, checkIns, consentRecords, assessments } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { getSession } from "@/lib/auth/session";
import { validateCsrf } from "@/lib/auth/csrf";
import { recordAuditEvent } from "@/lib/audit";
import { getClientIp } from "@/lib/utils";
import { generateConversationReply } from "@/lib/checkin-insight";

export async function GET(request: NextRequest) {
  await dbReady();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "personnel") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const userId = session.user.id;
  const checkInId = parseInt(new URL(request.url).searchParams.get("checkInId") ?? "0", 10);
  if (!checkInId) return NextResponse.json({ error: "checkInId required" }, { status: 400 });

  // Ownership check
  const [ci] = await db.select({ id: checkIns.id })
    .from(checkIns).where(and(eq(checkIns.id, checkInId), eq(checkIns.userId, userId))).limit(1);
  if (!ci) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const messages = await db.select().from(checkInConversations)
    .where(and(eq(checkInConversations.checkInId, checkInId), eq(checkInConversations.userId, userId)))
    .orderBy(checkInConversations.createdAt).limit(50);

  return NextResponse.json({ messages });
}

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
    message: z.string().min(1).max(800),
  });

  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  await validateCsrf(parsed.data.csrfToken);

  const { checkInId, message } = parsed.data;

  // Ownership
  const [ci] = await db.select().from(checkIns)
    .where(and(eq(checkIns.id, checkInId), eq(checkIns.userId, userId))).limit(1);
  if (!ci) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // AI consent required
  const consentRows = await db.select().from(consentRecords).where(eq(consentRecords.userId, userId));
  const aiConsent = consentRows.find((c) => c.scope === "ai_processing")?.granted ?? false;

  // Fetch check-in context for the assistant
  const [latestAssessment] = await db.select({
    totalScore: assessments.totalScore, maxPossibleScore: assessments.maxPossibleScore, priority: assessments.priority,
  }).from(assessments)
    .where(and(eq(assessments.userId, userId), eq(assessments.isLatest, true)))
    .orderBy(desc(assessments.assessedAt)).limit(1);

  const checkInCtx = {
    current: {
      id: ci.id, checkInDate: ci.checkInDate, mood: ci.mood, sleepHours: ci.sleepHours,
      sleepQuality: ci.sleepQuality, fatigue: ci.fatigue, perceivedWorkload: ci.perceivedWorkload,
      concern: null, requestedSupport: ci.requestedSupport, createdAt: ci.createdAt.toISOString(),
    },
    assessment: {
      id: latestAssessment ? 0 : 0,
      rawScore: latestAssessment?.totalScore ?? 0,
      maxPossibleScore: latestAssessment?.maxPossibleScore ?? 103,
      priority: latestAssessment?.priority ?? "routine",
      factors: [], plainExplanation: "", missingDataFlags: [], dataCoverage: 0.7,
    },
    aiConsent,
  };

  // Load recent conversation history (last 10 turns)
  const history = await db.select({ role: checkInConversations.role, content: checkInConversations.content })
    .from(checkInConversations)
    .where(and(eq(checkInConversations.checkInId, checkInId), eq(checkInConversations.userId, userId)))
    .orderBy(desc(checkInConversations.createdAt)).limit(10);
  const orderedHistory = [...history].reverse().map((m) => ({
    role: m.role as "user" | "assistant", content: m.content,
  }));

  // Store user message
  await db.insert(checkInConversations).values({
    checkInId, userId, role: "user", content: message, source: null,
  });

  // Generate reply
  const { reply, source } = await generateConversationReply(orderedHistory, checkInCtx as any, message);

  // Store assistant reply
  await db.insert(checkInConversations).values({
    checkInId, userId, role: "assistant", content: reply, source,
  });

  // Audit: record that a conversation occurred, not the content
  await recordAuditEvent({
    actorId: userId, actorRole: "personnel",
    event: "ai_explanation_requested",
    subjectType: "checkin_conversation", subjectId: checkInId,
    metadata: { source, turnCount: history.length + 2 },
    ipAddress: ip,
  });

  return NextResponse.json({ reply, source });
}
