import { NextResponse } from "next/server";
import { destroySession, getSession } from "@/lib/auth/session";
import { recordAuditEvent } from "@/lib/audit";
import { getClientIp } from "@/lib/utils";

export async function POST(request: Request) {
  const session = await getSession();
  const ip = getClientIp(request);

  if (session) {
    await recordAuditEvent({
      actorId: session.user.id,
      actorRole: session.user.role,
      event: "logout",
      ipAddress: ip,
    });
  }

  await destroySession();
  return NextResponse.json({ ok: true });
}
