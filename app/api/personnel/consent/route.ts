import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, dbReady } from "@/db";
import { consentRecords } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getSession } from "@/lib/auth/session";
import { validateCsrf } from "@/lib/auth/csrf";
import { recordAuditEvent } from "@/lib/audit";
import { computeAndStoreAssessment } from "@/lib/assessment-service";
import { getClientIp } from "@/lib/utils";

const consentSchema = z.object({
  csrfToken: z.string(),
  scope: z.enum(["wellness_checkins", "wearable", "ai_processing"]),
  granted: z.boolean(),
  policyVersion: z.string().default("1.0"),
});

export async function GET(request: NextRequest) {
  await dbReady();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "personnel")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const userId = session.user.id;
  const records = await db
    .select()
    .from(consentRecords)
    .where(eq(consentRecords.userId, userId));

  return NextResponse.json({ consents: records });
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

  const parsed = consentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  await validateCsrf(parsed.data.csrfToken);

  const userId = session.user.id;
  const { scope, granted, policyVersion } = parsed.data;
  const now = new Date();

  // Upsert consent record
  const [existing] = await db
    .select()
    .from(consentRecords)
    .where(and(eq(consentRecords.userId, userId), eq(consentRecords.scope, scope)))
    .limit(1);

  if (existing) {
    await db
      .update(consentRecords)
      .set({
        granted,
        grantedAt: granted ? now : existing.grantedAt,
        withdrawnAt: granted ? null : now,
        policyVersion,
      })
      .where(eq(consentRecords.id, existing.id));
  } else {
    await db.insert(consentRecords).values({
      userId,
      scope,
      granted,
      policyVersion,
      grantedAt: granted ? now : null,
      withdrawnAt: granted ? null : now,
      ipAddress: ip,
    });
  }

  await recordAuditEvent({
    actorId: userId,
    actorRole: "personnel",
    event: granted ? "consent_granted" : "consent_withdrawn",
    metadata: { scope, policyVersion },
    ipAddress: ip,
  });

  // When wellness consent changes, recompute the assessment immediately so the
  // new assessment correctly includes or excludes wellness factors.
  // The assessment service reads consent from the DB, so the withdrawal above
  // is already in effect before this call.
  if (scope === "wellness_checkins") {
    try {
      await computeAndStoreAssessment(userId, "consent_change", undefined, ip);
    } catch (err) {
      // Do not fail the consent change if assessment fails
      console.error("[consent] Post-withdrawal reassessment failed:", err);
    }
  }

  return NextResponse.json({ ok: true, granted });
}
