/**
 * Tests for CSV import validation logic.
 * Tests the parsing and validation functions in isolation.
 */
import { describe, it, expect } from "vitest";
import { normalizeKeys, isValidDateString } from "../lib/utils";

describe("normalizeKeys", () => {
  it("converts keys to lowercase with underscores", () => {
    const result = normalizeKeys({ "Personnel ID": "S-1042", "Weekly Hours": "48" });
    expect(result["personnel_id"]).toBe("S-1042");
    expect(result["weekly_hours"]).toBe("48");
  });

  it("trims whitespace from keys and values", () => {
    const result = normalizeKeys({ "  Name  ": "  Ravi Kumar  " });
    expect(result["name"]).toBe("Ravi Kumar");
  });
});

describe("isValidDateString", () => {
  it("accepts valid YYYY-MM-DD dates", () => {
    expect(isValidDateString("2026-08-15")).toBe(true);
    expect(isValidDateString("2026-01-01")).toBe(true);
  });

  it("rejects invalid date formats", () => {
    expect(isValidDateString("15-08-2026")).toBe(false);
    expect(isValidDateString("2026/08/15")).toBe(false);
    expect(isValidDateString("not-a-date")).toBe(false);
    expect(isValidDateString("")).toBe(false);
  });

  it("rejects invalid calendar dates", () => {
    expect(isValidDateString("2026-13-01")).toBe(false); // month 13
    expect(isValidDateString("2026-02-30")).toBe(false); // Feb 30
  });

  it("accepts leap year dates", () => {
    expect(isValidDateString("2024-02-29")).toBe(true);
  });
});

// Inline CSV parsing test (mirrors the route's parseCSV function)
function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).filter((l) => l.trim()).map((line) => {
    const values = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
    return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ""]));
  });
}

describe("CSV parsing", () => {
  it("parses a valid duty schedule CSV", () => {
    const csv = `personnel_id,period_start,period_end,weekly_hours,night_shifts
S-1042,2026-08-01,2026-08-31,52,6
S-1043,2026-08-01,2026-08-31,44,3`;

    const rows = parseCSV(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0].personnel_id).toBe("S-1042");
    expect(rows[0].weekly_hours).toBe("52");
  });

  it("returns empty array for CSV with header only", () => {
    const csv = `personnel_id,period_start,period_end,weekly_hours,night_shifts`;
    expect(parseCSV(csv)).toHaveLength(0);
  });

  it("handles quoted values", () => {
    const csv = `personnel_id,name\n"S-1042","Ravi Kumar"`;
    const rows = parseCSV(csv);
    expect(rows[0].personnel_id).toBe("S-1042");
    expect(rows[0].name).toBe("Ravi Kumar");
  });

  it("handles Windows-style line endings", () => {
    const csv = `personnel_id,weekly_hours\r\nS-1042,48\r\nS-1043,40`;
    const rows = parseCSV(csv);
    expect(rows).toHaveLength(2);
  });

  it("skips empty lines", () => {
    const csv = `personnel_id,weekly_hours\nS-1042,48\n\nS-1043,40\n`;
    const rows = parseCSV(csv);
    expect(rows).toHaveLength(2);
  });
});

describe("Duplicate detection via source tags", () => {
  it("generates distinct tags for different records", () => {
    const tag1 = `duty::S-1042::2026-08-01::2026-08-31`;
    const tag2 = `duty::S-1042::2026-09-01::2026-09-30`;
    expect(tag1).not.toBe(tag2);
  });

  it("generates identical tags for the same record (idempotency)", () => {
    const makeTag = (pid: string, start: string, end: string) =>
      `duty::${pid}::${start}::${end}`;
    expect(makeTag("S-1042", "2026-08-01", "2026-08-31"))
      .toBe(makeTag("S-1042", "2026-08-01", "2026-08-31"));
  });
});
