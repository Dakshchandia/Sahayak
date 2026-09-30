import { NextRequest, NextResponse } from "next/server";
import { db, dbReady } from "@/db";
import { notifications } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { getSession } from "@/lib/auth/session";
import { validateCsrf } from "@/lib/auth/csrf";

export async function GET(request: NextRequest) {
  await dbReady();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;
  const url = new URL(request.url);
  const unreadOnly = url.searchParams.get("unread") === "1";

  const query = unreadOnly
    ? and(eq(notifications.userId, userId), eq(notifications.isRead, false))
    : eq(notifications.userId, userId);

  const notifs = await db
    .select()
    .from(notifications)
    .where(query)
    .orderBy(desc(notifications.createdAt))
    .limit(50);

  const unreadCount = notifs.filter((n) => !n.isRead).length;

  return NextResponse.json({ notifications: notifs, unreadCount });
}

export async function POST(request: NextRequest) {
  await dbReady();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { action, notificationId, csrfToken } = body as {
    action: string; notificationId?: number; csrfToken: string;
  };

  await validateCsrf(csrfToken);
  const userId = session.user.id;

  if (action === "mark_read" && notificationId) {
    // Only mark your own notification
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)));
    return NextResponse.json({ ok: true });
  }

  if (action === "mark_all_read") {
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
