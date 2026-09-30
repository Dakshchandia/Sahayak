import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, dbReady } from "@/db";
import { checkIns, consentRecords, supportRequests, users } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { getSession } from "@/lib/auth/session";
import { validateCsrf } from "@/lib/auth/csrf";
import { computeAndStoreAssessment } from "@/lib/assessment-service";
import { recordAuditEvent } from "@/lib/audit";
import { createNotification } from "@/lib/notifications";
import { getClientIp } from "@/lib/utils";

const checkInSchema = z.object({
  csrfToken: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  mood: z.number().int().min(1).max(5),
  sleepHours: z.number().min(0).max(16),
  sleepQuality: z.number().int().min(1).max(5),
  fatigue: z.number().int().min(1).max(10),
  perceivedWorkload: z.number().int().min(1).max(10),
  concern: z.string().max(500).optional(),
  requestedSupport: z.boolean().default(false),
});

export async function GET(request: NextRequest) {
  await dbReady();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "personnel")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const userId = session.user.id;
  const history = await db
    .select()
    .from(checkIns)
    .where(eq(checkIns.userId, userId))
    .orderBy(desc(checkIns.checkInDate))
    .limit(90);

  return NextResponse.json({ checkIns: history });
}

export async function POST(request: NextRequest) {
  await dbReady();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "personnel")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const ip = getClientIp(request);
  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }

  const parsed = checkInSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  await validateCsrf(parsed.data.csrfToken);

  const userId = session.user.id;

  // Verify wellness consent before accepting any wellness data
  const [consent] = await db
    .select()
    .from(consentRecords)
    .where(and(eq(consentRecords.userId, userId), eq(consentRecords.scope, "wellness_checkins")))
    .limit(1);

  if (!consent?.granted) {
    return NextResponse.json(
      { error: "Wellness consent must be granted before submitting a check-in." },
      { status: 403 }
    );
  }

  const today = parsed.data.date ?? new Date().toISOString().slice(0, 10);

  // Check for existing check-in today
  const [existing] = await db
    .select()
    .from(checkIns)
    .where(and(eq(checkIns.userId, userId), eq(checkIns.checkInDate, today)))
    .limit(1);

  let checkInId: number;
  let trigger: "checkin" | "checkin_edit" = "checkin";

  if (existing) {
    // Edit allowed on same calendar day only
    if (existing.checkInDate !== today) {
      return NextResponse.json({ error: "Check-ins from previous days cannot be edited." }, { status: 403 });
    }
    trigger = "checkin_edit";
    const [updated] = await db
      .update(checkIns)
      .set({
        mood: parsed.data.mood,
        sleepHours: parsed.data.sleepHours,
        sleepQuality: parsed.data.sleepQuality,
        fatigue: parsed.data.fatigue,
        perceivedWorkload: parsed.data.perceivedWorkload,
        concern: parsed.data.concern ?? null,
        requestedSupport: parsed.data.requestedSupport,
        editedAt: new Date(),
      })
      .where(eq(checkIns.id, existing.id))
      .returning({ id: checkIns.id });
    checkInId = updated.id;
  } else {
    const [inserted] = await db
      .insert(checkIns)
      .values({
        userId,
        checkInDate: today,
        mood: parsed.data.mood,
        sleepHours: parsed.data.sleepHours,
        sleepQuality: parsed.data.sleepQuality,
        fatigue: parsed.data.fatigue,
        perceivedWorkload: parsed.data.perceivedWorkload,
        concern: parsed.data.concern ?? null,
        requestedSupport: parsed.data.requestedSupport,
      })
      .returning({ id: checkIns.id });
    checkInId = inserted.id;
  }

  await recordAuditEvent({
    actorId: userId,
    actorRole: "personnel",
    event: existing ? "checkin_edited" : "checkin_submitted",
    subjectType: "checkin",
    subjectId: checkInId,
    ipAddress: ip,
  });

  // Trigger assessment using the shared service — reads real organizational data
  const assessmentResult = await computeAndStoreAssessment(
    userId,
    trigger,
    checkInId,
    ip
  );

  // Create support request if requested
  if (parsed.data.requestedSupport) {
    await createSupportRequest(userId, checkInId, session.user.unitId);
  }

  return NextResponse.json({
    ok: true,
    checkInId,
    assessment: assessmentResult
      ? {
          rawScore: assessmentResult.rawScore,
          maxPossibleScore: assessmentResult.maxPossibleScore,
          priority: assessmentResult.priority,
        }
      : null,
  });
}

async function createSupportRequest(
  userId: number,
  checkInId: number,
  unitId: number | null
) {
  try {
    const [req] = await db
      .insert(supportRequests)
      .values({ userId, checkInId })
      .returning({ id: supportRequests.id });

    await recordAuditEvent({
      actorId: userId,
      event: "support_requested",
      subjectType: "support_request",
      subjectId: req.id,
    });

    // Notify welfare officers in the unit only (not all members)
    if (unitId) {
      const officers = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.unitId, unitId), eq(users.role, "welfare_officer")));

      for (const officer of officers) {
        await createNotification({
          userId: officer.id,
          type: "support_request_received",
          title: "New support request",
          body: "A personnel member in your unit has submitted a support request.",
          link: "/welfare/cases",
        });
      }
    }
  } catch (err) {
    console.error("[checkin] Failed to create support request:", err);
  }
}
