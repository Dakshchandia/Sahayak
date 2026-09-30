import { NextRequest, NextResponse } from "next/server";
import { db, dbReady } from "@/db";
import {
  importJobs, importErrors, users, dutyRecords,
  deploymentRecords, leaveRecords, transferRecords, trainingRecords
} from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getSession } from "@/lib/auth/session";
import { recordAuditEvent } from "@/lib/audit";
import { normalizeKeys, isValidDateString } from "@/lib/utils";
import { getClientIp } from "@/lib/utils";
import { reassessUnit } from "@/lib/assessment-service";

type RecordType = "duty_schedule" | "deployment" | "leave" | "transfer" | "training";

// Required columns per record type
const REQUIRED_COLUMNS: Record<RecordType, string[]> = {
  duty_schedule: ["personnel_id", "period_start", "period_end", "weekly_hours", "night_shifts"],
  deployment:    ["personnel_id", "start_date"],
  leave:         ["personnel_id", "leave_type", "start_date", "end_date", "duration_days"],
  transfer:      ["personnel_id", "transfer_date"],
  training:      ["personnel_id", "name", "start_date", "end_date"],
};

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).filter((l) => l.trim()).map((line) => {
    const values = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
    return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ""]));
  });
}

function generateSourceTag(personnelId: string, recordType: string, ...keys: string[]): string {
  return `${recordType}::${personnelId}::${keys.join("::")}`;
}

// POST /api/import?action=preview|commit
export async function POST(request: NextRequest) {
  await dbReady();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { role, unitId, id: actorId } = session.user;
  if (role !== "welfare_officer" && role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const ip = getClientIp(request);
  const action = new URL(request.url).searchParams.get("action") ?? "preview";

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  const recordType = formData.get("recordType") as RecordType | null;
  const csrfToken = formData.get("csrfToken") as string | null;

  if (!file || !recordType) {
    return NextResponse.json({ error: "file and recordType are required" }, { status: 400 });
  }

  if (!REQUIRED_COLUMNS[recordType]) {
    return NextResponse.json({ error: "Invalid record type" }, { status: 400 });
  }

  const csvText = await file.text();
  const rawRows = parseCSV(csvText);

  if (rawRows.length === 0) {
    return NextResponse.json({ error: "CSV file is empty or has no data rows" }, { status: 400 });
  }

  const rows = rawRows.map(normalizeKeys);
  const required = REQUIRED_COLUMNS[recordType];

  // Validate columns
  const firstRow = rows[0];
  const missingCols = required.filter((col) => !(col in firstRow));
  if (missingCols.length > 0) {
    return NextResponse.json(
      { error: `Missing required columns: ${missingCols.join(", ")}` },
      { status: 400 }
    );
  }

  // Create import job
  const [job] = await db
    .insert(importJobs)
    .values({
      uploadedBy: actorId,
      unitId: unitId ?? null,
      recordType,
      originalFilename: file.name,
      status: action === "commit" ? "committed" : "previewing",
      totalRows: rows.length,
    })
    .returning({ id: importJobs.id });

  const errors: Array<{ rowNumber: number; field?: string; message: string; rawValue?: string }> = [];
  const validRows: typeof rows = [];

  // Validate each row
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2; // 1-indexed + header row

    // Validate personnel_id exists
    const personnelUser = await db
      .select({ id: users.id, unitId: users.unitId })
      .from(users)
      .where(eq(users.personnelId, row.personnel_id))
      .limit(1);

    if (!personnelUser.length) {
      errors.push({ rowNumber: rowNum, field: "personnel_id", message: `Personnel ID not found: ${row.personnel_id}`, rawValue: row.personnel_id });
      continue;
    }

    // Scope check — welfare officers can only import for their unit
    if (role === "welfare_officer" && unitId && personnelUser[0].unitId !== unitId) {
      errors.push({ rowNumber: rowNum, field: "personnel_id", message: `Personnel ${row.personnel_id} is not in your unit`, rawValue: row.personnel_id });
      continue;
    }

    // Type-specific validation
    let rowValid = true;

    if (recordType === "duty_schedule") {
      if (!isValidDateString(row.period_start)) {
        errors.push({ rowNumber: rowNum, field: "period_start", message: "Invalid date (expected YYYY-MM-DD)", rawValue: row.period_start });
        rowValid = false;
      }
      if (!isValidDateString(row.period_end)) {
        errors.push({ rowNumber: rowNum, field: "period_end", message: "Invalid date (expected YYYY-MM-DD)", rawValue: row.period_end });
        rowValid = false;
      }
      const hours = parseFloat(row.weekly_hours);
      if (isNaN(hours) || hours < 0 || hours > 168) {
        errors.push({ rowNumber: rowNum, field: "weekly_hours", message: "Weekly hours must be 0–168", rawValue: row.weekly_hours });
        rowValid = false;
      }
      const nights = parseInt(row.night_shifts, 10);
      if (isNaN(nights) || nights < 0 || nights > 31) {
        errors.push({ rowNumber: rowNum, field: "night_shifts", message: "Night shifts must be 0–31", rawValue: row.night_shifts });
        rowValid = false;
      }
    }

    if (["deployment", "leave", "transfer", "training"].includes(recordType)) {
      const dateField = recordType === "transfer" ? "transfer_date" : "start_date";
      if (!isValidDateString(row[dateField])) {
        errors.push({ rowNumber: rowNum, field: dateField, message: "Invalid date", rawValue: row[dateField] });
        rowValid = false;
      }
    }

    if (rowValid) validRows.push({ ...row, _userId: personnelUser[0].id.toString() });
  }

  // Store errors
  if (errors.length > 0) {
    await db.insert(importErrors).values(
      errors.map((e) => ({
        jobId: job.id,
        rowNumber: e.rowNumber,
        field: e.field ?? null,
        message: e.message,
        rawValue: e.rawValue ?? null,
      }))
    );
  }

  // Update job stats
  await db
    .update(importJobs)
    .set({
      validRows: validRows.length,
      errorRows: errors.length,
      previewData: validRows.slice(0, 10),
    })
    .where(eq(importJobs.id, job.id));

  if (action === "preview") {
    return NextResponse.json({
      jobId: job.id,
      totalRows: rows.length,
      validRows: validRows.length,
      errorRows: errors.length,
      errors: errors.slice(0, 20),
      preview: validRows.slice(0, 10),
    });
  }

  // Commit action
  if (!csrfToken) {
    return NextResponse.json({ error: "CSRF token required for commit" }, { status: 400 });
  }

  let committedCount = 0;
  let skippedDuplicates = 0;

  for (const row of validRows) {
    const userId = parseInt(row._userId, 10);
    try {
      if (recordType === "duty_schedule") {
        const sourceTag = generateSourceTag(row.personnel_id, "duty", row.period_start, row.period_end);
        const existing = await db
          .select({ id: dutyRecords.id })
          .from(dutyRecords)
          .where(eq(dutyRecords.sourceTag, sourceTag))
          .limit(1);
        if (existing.length > 0) { skippedDuplicates++; continue; }
        await db.insert(dutyRecords).values({
          userId,
          periodStart: row.period_start,
          periodEnd: row.period_end,
          weeklyHours: parseFloat(row.weekly_hours),
          nightShifts: parseInt(row.night_shifts, 10),
          consecutiveDays: row.consecutive_days ? parseInt(row.consecutive_days, 10) : null,
          restDays: row.rest_days ? parseInt(row.rest_days, 10) : null,
          importJobId: job.id,
          sourceTag,
        });
        committedCount++;
      }

      if (recordType === "deployment") {
        const sourceTag = generateSourceTag(row.personnel_id, "deployment", row.start_date);
        const existing = await db
          .select({ id: deploymentRecords.id })
          .from(deploymentRecords)
          .where(eq(deploymentRecords.sourceTag, sourceTag))
          .limit(1);
        if (existing.length > 0) { skippedDuplicates++; continue; }
        await db.insert(deploymentRecords).values({
          userId,
          startDate: row.start_date,
          endDate: row.end_date || null,
          location: row.location || null,
          durationDays: row.duration_days ? parseInt(row.duration_days, 10) : null,
          isCurrentlyDeployed: row.is_currently_deployed === "true",
          importJobId: job.id,
          sourceTag,
        });
        committedCount++;
      }

      if (recordType === "leave") {
        const sourceTag = generateSourceTag(row.personnel_id, "leave", row.start_date, row.end_date);
        const existing = await db
          .select({ id: leaveRecords.id })
          .from(leaveRecords)
          .where(eq(leaveRecords.sourceTag, sourceTag))
          .limit(1);
        if (existing.length > 0) { skippedDuplicates++; continue; }
        await db.insert(leaveRecords).values({
          userId,
          leaveType: row.leave_type,
          startDate: row.start_date,
          endDate: row.end_date,
          durationDays: parseInt(row.duration_days, 10),
          approved: row.approved !== "false",
          importJobId: job.id,
          sourceTag,
        });
        committedCount++;
      }

      if (recordType === "transfer") {
        const sourceTag = generateSourceTag(row.personnel_id, "transfer", row.transfer_date);
        const existing = await db
          .select({ id: transferRecords.id })
          .from(transferRecords)
          .where(eq(transferRecords.sourceTag, sourceTag))
          .limit(1);
        if (existing.length > 0) { skippedDuplicates++; continue; }
        await db.insert(transferRecords).values({
          userId,
          transferDate: row.transfer_date,
          fromUnit: row.from_unit || null,
          toUnit: row.to_unit || null,
          reason: row.reason || null,
          importJobId: job.id,
          sourceTag,
        });
        committedCount++;
      }

      if (recordType === "training") {
        const sourceTag = generateSourceTag(row.personnel_id, "training", row.name, row.start_date);
        const existing = await db
          .select({ id: trainingRecords.id })
          .from(trainingRecords)
          .where(eq(trainingRecords.sourceTag, sourceTag))
          .limit(1);
        if (existing.length > 0) { skippedDuplicates++; continue; }
        await db.insert(trainingRecords).values({
          userId,
          name: row.name,
          startDate: row.start_date,
          endDate: row.end_date,
          location: row.location || null,
          mandatory: row.mandatory === "true",
          importJobId: job.id,
          sourceTag,
        });
        committedCount++;
      }
    } catch (err) {
      console.error(`[import] Row failed:`, err);
    }
  }

  await db
    .update(importJobs)
    .set({
      status: "committed",
      committedRows: committedCount,
      committedAt: new Date(),
      summary: `Committed ${committedCount} rows. Skipped ${skippedDuplicates} duplicates. ${errors.length} validation errors.`,
    })
    .where(eq(importJobs.id, job.id));

  await recordAuditEvent({
    actorId,
    actorRole: role,
    event: "import_committed",
    subjectType: "import_job",
    subjectId: job.id,
    metadata: { recordType, committedCount, skippedDuplicates, errorCount: errors.length },
    ipAddress: ip,
  });

  // Reassess all affected personnel after import (fire-and-forget, idempotent)
  if (committedCount > 0) {
    const affectedUserIds = [...new Set(validRows.map((r) => parseInt(r._userId, 10)).filter(Boolean))];
    reassessUnit(affectedUserIds, "import", ip).catch((err) =>
      console.error("[import] Post-import reassessment failed:", err)
    );
  }

  return NextResponse.json({
    ok: true,
    jobId: job.id,
    committedRows: committedCount,
    skippedDuplicates,
    errorRows: errors.length,
    summary: `Import complete: ${committedCount} records added, ${skippedDuplicates} duplicates skipped, ${errors.length} errors.`,
  });
}
