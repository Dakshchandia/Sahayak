/**
 * In-app notification service.
 * All notifications are stored in the database and polled by the client.
 * Email delivery is optional and uses the configured SMTP adapter.
 * Emails contain only generic text — no sensitive clinical details.
 */
import { db, dbReady } from "@/db";
import { notifications, users } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import type { InferInsertModel } from "drizzle-orm";

type NotificationType = (typeof notifications.$inferInsert)["type"];

interface CreateNotificationOptions {
  userId: number;
  type: NotificationType;
  title: string;
  body: string;
  link?: string;
}

export async function createNotification(opts: CreateNotificationOptions): Promise<void> {
  await dbReady();
  await db.insert(notifications).values({
    userId: opts.userId,
    type: opts.type,
    title: opts.title,
    body: opts.body,
    link: opts.link ?? null,
  });

  // Attempt email delivery if configured — fire and forget
  sendEmailNotification(opts).catch((err) =>
    console.error("[notifications] Email delivery failed:", err)
  );
}

export async function getUnreadCount(userId: number): Promise<number> {
  await dbReady();
  const result = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
  return result.length;
}

async function sendEmailNotification(opts: CreateNotificationOptions): Promise<void> {
  const smtpHost = process.env.SMTP_HOST;
  if (!smtpHost) return; // Email not configured

  // Dynamic import to avoid loading nodemailer on every request
  const nodemailer = await import("nodemailer");

  const user = await db
    .select({ email: users.email, name: users.name })
    .from(users)
    .where(eq(users.id, opts.userId))
    .limit(1);

  if (!user.length) return;

  const transporter = nodemailer.default.createTransport({
    host: smtpHost,
    port: parseInt(process.env.SMTP_PORT ?? "1025", 10),
    secure: process.env.SMTP_SECURE === "true",
    auth:
      process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
  });

  // Generic message — no sensitive details
  await transporter.sendMail({
    from: process.env.SMTP_FROM ?? "noreply@sahayak.local",
    to: user[0].email,
    subject: `SAHAYAK: ${opts.title}`,
    text: [
      `Hello ${user[0].name},`,
      "",
      opts.body,
      "",
      `Please log in to SAHAYAK for details: ${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}`,
      "",
      "This is an automated message. Do not reply.",
      "SAHAYAK Personnel Welfare System",
    ].join("\n"),
  });

  // Mark email sent
  await db
    .update(notifications)
    .set({ emailSent: true, emailSentAt: new Date() })
    .where(eq(notifications.userId, opts.userId));
}
