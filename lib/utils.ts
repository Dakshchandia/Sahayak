import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format a date for display without timezone conversion issues */
export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  let d: Date;
  if (typeof date === "string") {
    // Full ISO timestamp (e.g. "2026-09-23T10:59:26.311Z") — use as-is
    // Date-only string (e.g. "2026-09-23") — append noon to avoid timezone rollback
    d = date.includes("T") ? new Date(date) : new Date(date + "T12:00:00");
  } else {
    d = date;
  }
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Clamp a number between min and max */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Extract client IP from Next.js request headers */
export function getClientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip");
}

/** Sanitize a string for safe display (strip HTML tags) */
export function sanitizeText(input: string): string {
  return input.replace(/<[^>]*>/g, "").trim();
}

/** Check if a date string is a valid YYYY-MM-DD date (strict calendar validation) */
export function isValidDateString(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (month < 1 || month > 12) return false;
  if (day < 1) return false;
  // Check against actual days in that month (handles leap years)
  const daysInMonth = new Date(year, month, 0).getDate();
  return day <= daysInMonth;
}

/** Convert a CSV row object's keys to lowercase with underscores */
export function normalizeKeys(obj: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [
      k.trim().toLowerCase().replace(/\s+/g, "_"),
      v?.trim() ?? "",
    ])
  );
}
