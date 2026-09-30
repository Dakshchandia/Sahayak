"use client";
/**
 * CheckInCalendar
 * ───────────────
 * Monthly calendar showing the authenticated user's wellness check-in history.
 * Placed at the bottom of the Personnel Dashboard.
 *
 * Behaviour:
 *  - Fetches from /api/personnel/checkin/month?year=Y&month=M
 *  - Stale-while-revalidate: each month is cached in a Map; navigating back is instant.
 *  - Race-condition guard: only the response for the currently displayed month is applied.
 *  - Selects today on mount.
 *  - Editing eligibility: only today, and only if a check-in already exists for today.
 *  - Missing past dates shown as neutral empty — no red, no distress labeling.
 *  - Future dates shown as muted, no action available.
 *  - Personal notes (concern) shown in the detail panel — only visible to the user.
 *  - Viewing history does NOT trigger a new assessment or AI call.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft, ChevronRight, CheckCircle2, Circle,
  Calendar, ArrowRight, Edit, Info, AlertCircle, Activity
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CheckInRecord {
  id: number;
  checkInDate: string;          // "YYYY-MM-DD"
  mood: number | null;          // 1-5
  sleepHours: number | null;    // 0-16
  sleepQuality: number | null;  // 1-5
  fatigue: number | null;       // 1-10
  perceivedWorkload: number | null; // 1-10
  concern: string | null;
  requestedSupport: boolean;
  editedAt: string | null;
  createdAt: string;
}

interface MonthData {
  year: number;
  month: number;
  firstDay: string;
  lastDay: string;
  checkIns: CheckInRecord[];
  consentGranted: boolean;
  consentWithdrawnAt: string | null;
}

interface Props {
  /** Called when the user wants to start or edit today's check-in */
  onCheckin: () => void;
  /** Incremented by parent after a successful check-in to trigger a calendar refresh */
  refreshTrigger?: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const WEEKDAYS_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WEEKDAYS_SHORT_HI = ["सोम", "मंगल", "बुध", "गुरु", "शुक्र", "शनि", "रवि"];
const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December"
];
const MONTH_NAMES_HI = [
  "जनवरी","फ़रवरी","मार्च","अप्रैल","मई","जून",
  "जुलाई","अगस्त","सितंबर","अक्टूबर","नवंबर","दिसंबर"
];

/** Return "YYYY-MM-DD" for a local date */
function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Local today as "YYYY-MM-DD" */
function todayStr(): string {
  return toLocalDateStr(new Date());
}

/**
 * Build a 6-row × 7-col grid for the given month.
 * Each cell is a "YYYY-MM-DD" string, or null for padding days.
 * Week starts on Monday.
 */
function buildCalendarGrid(year: number, month: number): Array<string | null> {
  const firstDate = new Date(year, month - 1, 1);
  const lastDate  = new Date(year, month, 0);
  const totalDays = lastDate.getDate();

  // Monday=0 … Sunday=6
  const startDow = (firstDate.getDay() + 6) % 7;

  const cells: Array<string | null> = [];
  for (let i = 0; i < startDow; i++) cells.push(null); // leading padding
  for (let d = 1; d <= totalDays; d++) {
    cells.push(`${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }
  // Pad to multiple of 7
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/** Format a stored ISO datetime for display */
function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function fmtDate(dateStr: string): string {
  const [y, m, day] = dateStr.split("-").map(Number);
  const d = new Date(y, m - 1, day, 12);
  return d.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

/** Mood labels 1-5 */
const MOOD_LABELS = ["", "Very low", "Low", "Okay", "Good", "Great"];
const MOOD_EMOJIS = ["", "😔", "😕", "😐", "🙂", "😊"];

/** Sleep quality labels 1-5 */
const SLEEP_QUALITY_LABELS = ["", "Very poor", "Poor", "Fair", "Good", "Excellent"];

// ─── Main component ──────────────────────────────────────────────────────────

export function CheckInCalendar({ onCheckin, refreshTrigger = 0 }: Props) {
  const router = useRouter();

  // Detect locale for Hindi weekday labels
  const [lang] = useState(() => {
    if (typeof document !== "undefined") {
      return document.cookie.match(/locale=([^;]+)/)?.[1] ?? "en";
    }
    return "en";
  });

  // Current display month
  const today = new Date();
  const [displayYear,  setDisplayYear]  = useState(today.getFullYear());
  const [displayMonth, setDisplayMonth] = useState(today.getMonth() + 1); // 1-indexed
  const [selectedDate, setSelectedDate] = useState<string>(todayStr());
  const [monthData,    setMonthData]    = useState<MonthData | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState("");

  // Cache: key = "YYYY-M", value = MonthData
  const cache = useRef<Map<string, MonthData>>(new Map());
  // Race-condition guard
  const fetchVersion = useRef(0);

  // ── Fetch month data ────────────────────────────────────────────────────────
  const fetchMonth = useCallback(async (year: number, month: number) => {
    const key = `${year}-${month}`;
    setLoading(true);
    setError("");

    const thisVersion = ++fetchVersion.current;

    // Cache hit: show immediately and re-validate in background
    if (cache.current.has(key)) {
      setMonthData(cache.current.get(key)!);
      setLoading(false);
    }

    try {
      const res = await fetch(`/api/personnel/checkin/month?year=${year}&month=${month}`);
      if (!res.ok) {
        const err = await res.json();
        if (thisVersion === fetchVersion.current) setError(err.error ?? "Could not load check-ins.");
        return;
      }
      const data: MonthData = await res.json();
      cache.current.set(key, data);
      // Only apply if this is still the requested month (guard against race conditions)
      if (thisVersion === fetchVersion.current) {
        setMonthData(data);
        setLoading(false);
        setError("");
      }
    } catch {
      if (thisVersion === fetchVersion.current) {
        setError("Network error loading check-ins.");
        setLoading(false);
      }
    }
  }, []);

  // Fetch on mount and on month change
  useEffect(() => {
    fetchMonth(displayYear, displayMonth);
  }, [fetchMonth, displayYear, displayMonth]);

  // Refresh when parent signals a new check-in was saved
  useEffect(() => {
    if (refreshTrigger > 0) {
      const key = `${displayYear}-${displayMonth}`;
      cache.current.delete(key); // invalidate cache for current month
      fetchMonth(displayYear, displayMonth);
    }
  }, [refreshTrigger, displayYear, displayMonth, fetchMonth]);

  // ── Navigation ─────────────────────────────────────────────────────────────
  function goToPrevMonth() {
    let m = displayMonth - 1;
    let y = displayYear;
    if (m < 1) { m = 12; y--; }
    setDisplayYear(y); setDisplayMonth(m);
  }

  function goToNextMonth() {
    let m = displayMonth + 1;
    let y = displayYear;
    if (m > 12) { m = 1; y++; }
    setDisplayYear(y); setDisplayMonth(m);
  }

  function goToToday() {
    const t = new Date();
    setDisplayYear(t.getFullYear());
    setDisplayMonth(t.getMonth() + 1);
    setSelectedDate(todayStr());
  }

  // ── Derived data ───────────────────────────────────────────────────────────
  const checkInMap = new Map<string, CheckInRecord>();
  (monthData?.checkIns ?? []).forEach((c) => checkInMap.set(c.checkInDate, c));

  const grid = buildCalendarGrid(displayYear, displayMonth);
  const tdStr = todayStr();
  const selectedRecord = selectedDate ? checkInMap.get(selectedDate) : null;
  const monthCount = checkInMap.size;

  // Is today in this displayed month?
  const todayInThisMonth = (
    today.getFullYear() === displayYear &&
    today.getMonth() + 1 === displayMonth
  );

  // Editing eligibility: only today, only if a record exists for today
  const canEditToday = todayInThisMonth && selectedDate === tdStr && !!checkInMap.get(tdStr);
  const canSubmitToday = todayInThisMonth && selectedDate === tdStr && !checkInMap.get(tdStr);

  // ── Date classification ────────────────────────────────────────────────────
  function dateClass(dateStr: string): "has-checkin" | "today-empty" | "past-empty" | "future" | "today-with" {
    const isFuture = dateStr > tdStr;
    const isToday  = dateStr === tdStr;
    const has = checkInMap.has(dateStr);

    if (isFuture)            return "future";
    if (isToday && has)      return "today-with";
    if (isToday && !has)     return "today-empty";
    if (has)                 return "has-checkin";
    return "past-empty";
  }

  const weekdays = lang === "hi" ? WEEKDAYS_SHORT_HI : WEEKDAYS_SHORT;
  const monthName = lang === "hi" ? MONTH_NAMES_HI[displayMonth - 1] : MONTH_NAMES[displayMonth - 1];

  // ── Accessible label for a date cell ──────────────────────────────────────
  function dateAriaLabel(dateStr: string): string {
    const cls = dateClass(dateStr);
    const [y, m, d] = dateStr.split("-").map(Number);
    const dn = new Date(y, m - 1, d, 12).toLocaleDateString("en-IN", { day: "numeric", month: "long" });
    const suffix =
      cls === "has-checkin"  ? ", check-in submitted" :
      cls === "today-with"   ? ", today, check-in submitted" :
      cls === "today-empty"  ? ", today, no check-in yet" :
      cls === "future"       ? ", future date" :
      ", no check-in recorded";
    return dn + suffix;
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <section className="panel" style={{ marginBottom: 32 }}>
      {/* Header */}
      <div className="panel-heading" style={{ marginBottom: 0 }}>
        <div>
          <h2>My check-in calendar</h2>
          <p>
            {loading ? "Loading…" : `${monthCount} day${monthCount !== 1 ? "s" : ""} with check-ins this month`}
          </p>
        </div>
        <Calendar size={20} />
      </div>

      {/* Consent withdrawn notice */}
      {monthData?.consentWithdrawnAt && !monthData.consentGranted && (
        <div style={{
          display: "flex", gap: 8, alignItems: "center",
          background: "#fffbea", border: "1px solid #e8d98a",
          borderRadius: 7, padding: "10px 14px", fontSize: 12,
          color: "#7a6820", margin: "12px 0"
        }}>
          <Info size={14} style={{ flexShrink: 0 }} />
          <span>
            Wellness consent was withdrawn on {fmtDateTime(monthData.consentWithdrawnAt)}.
            These records are your personal history and are no longer used in assessments.
          </span>
        </div>
      )}

      {error && (
        <div style={{
          display: "flex", gap: 8, alignItems: "center",
          background: "#fdf2f2", border: "1px solid #e8c2c0",
          borderRadius: 7, padding: "10px 14px", fontSize: 13,
          color: "#9b3a36", margin: "12px 0"
        }}>
          <AlertCircle size={14} style={{ flexShrink: 0 }} />
          <span>{error}</span>
          <button onClick={() => fetchMonth(displayYear, displayMonth)}
            style={{ marginLeft: "auto", fontSize: 12, color: "#9b3a36", fontWeight: 600 }}>
            Retry
          </button>
        </div>
      )}

      {/* Calendar + Detail: two-column on desktop, stacked on mobile */}
      <div className="cal-two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginTop: 18 }}>

        {/* Left: Calendar grid */}
        <div>
          {/* Month navigation */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <button
              className="icon-button"
              aria-label="Previous month"
              onClick={goToPrevMonth}
              style={{ width: 34, height: 34 }}
            >
              <ChevronLeft size={18} />
            </button>

            <div style={{ textAlign: "center" }}>
              <b style={{ fontSize: 15 }}>{monthName} {displayYear}</b>
            </div>

            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {(!todayInThisMonth) && (
                <button
                  onClick={goToToday}
                  style={{ fontSize: 12, color: "#147d6e", fontWeight: 600,
                    padding: "4px 10px", border: "1px solid #b3d4cc",
                    borderRadius: 5, background: "#edf7f1" }}
                >
                  Today
                </button>
              )}
              <button
                className="icon-button"
                aria-label="Next month"
                onClick={goToNextMonth}
                style={{ width: 34, height: 34 }}
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>

          {/* Weekday headers */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 4 }}>
            {weekdays.map((w) => (
              <div key={w} style={{
                textAlign: "center", fontSize: 11, color: "#8b9ba3",
                fontWeight: 600, padding: "4px 0", letterSpacing: "0.5px"
              }}>
                {w}
              </div>
            ))}
          </div>

          {/* Date grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3 }}>
            {grid.map((dateStr, idx) => {
              if (!dateStr) {
                return <div key={`pad-${idx}`} style={{ height: 40 }} aria-hidden="true" />;
              }
              const cls = dateClass(dateStr);
              const isSelected = dateStr === selectedDate;
              const isFuture = cls === "future";
              const hasCheckin = cls === "has-checkin" || cls === "today-with";
              const isToday = dateStr === tdStr;
              const dayNum = parseInt(dateStr.split("-")[2], 10);

              return (
                <button
                  key={dateStr}
                  aria-label={dateAriaLabel(dateStr)}
                  aria-pressed={isSelected}
                  disabled={false}
                  onClick={() => setSelectedDate(dateStr)}
                  style={{
                    height: 40,
                    borderRadius: 8,
                    border: isToday
                      ? "2px solid #147d6e"
                      : isSelected
                      ? "2px solid #219a89"
                      : "1px solid transparent",
                    background: isSelected
                      ? "#e3f5ef"
                      : isFuture
                      ? "transparent"
                      : hasCheckin
                      ? "#f0faf7"
                      : "transparent",
                    color: isFuture ? "#c8d5d9" : isSelected ? "#0e6155" : "#2e5560",
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 2,
                    padding: 0,
                    transition: "background 0.12s, border-color 0.12s",
                    position: "relative",
                    fontFamily: "inherit",
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) (e.currentTarget as HTMLElement).style.background = isFuture ? "transparent" : "#ecf6f2";
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) (e.currentTarget as HTMLElement).style.background =
                      hasCheckin ? "#f0faf7" : "transparent";
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: isToday ? 700 : 400, lineHeight: 1 }}>
                    {dayNum}
                  </span>
                  {/* Status dot */}
                  {hasCheckin && (
                    <span style={{
                      width: 5, height: 5, borderRadius: "50%",
                      background: isSelected ? "#0e6155" : "#147d6e",
                      flexShrink: 0,
                    }} aria-hidden="true" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Legend */}
          <div style={{
            display: "flex", gap: 16, marginTop: 14, flexWrap: "wrap",
            fontSize: 11, color: "#8b9ba3"
          }}>
            <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#147d6e", display: "inline-block" }} />
              Check-in submitted
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 14, height: 14, borderRadius: 3, border: "2px solid #147d6e", display: "inline-block" }} />
              Today
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 14, height: 14, borderRadius: 3, border: "2px solid #219a89", background: "#e3f5ef", display: "inline-block" }} />
              Selected
            </span>
          </div>
        </div>

        {/* Right: Day detail */}
        <DayDetail
          dateStr={selectedDate}
          record={selectedRecord ?? null}
          today={tdStr}
          canEditToday={canEditToday}
          canSubmitToday={canSubmitToday}
          onCheckin={onCheckin}
          consentGranted={monthData?.consentGranted ?? true}
          loading={loading && !monthData}
        />
      </div>

    </section>
  );
}

// ─── Day detail panel ─────────────────────────────────────────────────────────

interface DayDetailProps {
  dateStr: string | null;
  record: CheckInRecord | null;
  today: string;
  canEditToday: boolean;
  canSubmitToday: boolean;
  onCheckin: () => void;
  consentGranted: boolean;
  loading: boolean;
}

function DayDetail({ dateStr, record, today, canEditToday, canSubmitToday, onCheckin, consentGranted, loading }: DayDetailProps) {
  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center",
        minHeight: 200, color: "#8b9ba3" }}>
        <Activity size={20} className="pulse" style={{ marginRight: 8 }} />
        <span style={{ fontSize: 13 }}>Loading…</span>
      </div>
    );
  }

  if (!dateStr) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center",
        minHeight: 200, color: "#8b9ba3", fontSize: 13 }}>
        Select a date to view details
      </div>
    );
  }

  const isFuture = dateStr > today;
  const isToday  = dateStr === today;

  const formattedDate = fmtDate(dateStr);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* Date heading */}
      <div style={{ marginBottom: 14 }}>
        <b style={{ fontSize: 14, display: "block" }}>{formattedDate}</b>
        {record && (
          <small style={{ color: "#8b9ba3", fontSize: 12 }}>
            Submitted {fmtDateTime(record.createdAt)}
            {record.editedAt && ` · Edited ${fmtDateTime(record.editedAt)}`}
          </small>
        )}
      </div>

      {/* ── Future date ── */}
      {isFuture && (
        <div style={{ color: "#8b9ba3", fontSize: 13, fontStyle: "italic" }}>
          This date is in the future.
        </div>
      )}

      {/* ── No record on past day ── */}
      {!isFuture && !record && !isToday && (
        <div style={{ color: "#8b9ba3", fontSize: 13 }}>
          No check-in was recorded for this day.
        </div>
      )}

      {/* ── Today, no check-in yet ── */}
      {isToday && !record && (
        <div>
          <p style={{ fontSize: 13, color: "#637780", marginBottom: 14 }}>
            You haven't checked in today.
          </p>
          {consentGranted ? (
            <button className="primary" onClick={onCheckin} style={{ fontSize: 13 }}>
              <CheckCircle2 size={15} /> Complete today's check-in <ArrowRight size={14} />
            </button>
          ) : (
            <p style={{ fontSize: 12, color: "#8b9ba3" }}>
              Wellness consent is disabled. Enable it in Privacy &amp; access to submit check-ins.
            </p>
          )}
        </div>
      )}

      {/* ── Check-in record exists ── */}
      {record && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {/* Withdrawn consent label */}
          {!consentGranted && (
            <div style={{ fontSize: 11, background: "#fffbea", border: "1px solid #e8d98a",
              borderRadius: 5, padding: "5px 10px", color: "#7a6820" }}>
              Consent withdrawn — this record is your personal history only, not used in assessments.
            </div>
          )}

          {/* Fields grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {record.mood != null && (
              <Field label="Mood"
                value={`${MOOD_EMOJIS[record.mood]} ${MOOD_LABELS[record.mood]} (${record.mood}/5)`} />
            )}
            {record.sleepHours != null && (
              <Field label="Sleep" value={`${record.sleepHours} hours`} />
            )}
            {record.sleepQuality != null && (
              <Field label="Sleep quality"
                value={`${SLEEP_QUALITY_LABELS[record.sleepQuality]} (${record.sleepQuality}/5)`} />
            )}
            {record.fatigue != null && (
              <Field label="Fatigue" value={`${record.fatigue}/10`} />
            )}
            {record.perceivedWorkload != null && (
              <Field label="Perceived workload" value={`${record.perceivedWorkload}/10`} />
            )}
            {record.requestedSupport && (
              <Field label="Support" value="Support requested this day" highlight />
            )}
          </div>

          {/* Personal note */}
          {record.concern && (
            <div style={{ background: "#f4f7f8", borderRadius: 7, padding: "10px 12px", marginTop: 4 }}>
              <small style={{ fontSize: 11, fontWeight: 600, color: "#637780",
                display: "block", marginBottom: 4, letterSpacing: "0.5px" }}>
                PERSONAL NOTE
              </small>
              <p style={{ fontSize: 13, color: "#2e5560", lineHeight: 1.6, margin: 0 }}>
                {record.concern}
              </p>
            </div>
          )}

          {/* Edit button — today only */}
          {canEditToday && (
            <button
              className="secondary"
              onClick={onCheckin}
              style={{ fontSize: 13, marginTop: 6, alignSelf: "flex-start" }}
            >
              <Edit size={14} /> Edit today's check-in
            </button>
          )}

          {/* Past record — read-only label */}
          {!isToday && (
            <p style={{ fontSize: 11, color: "#a0adb4", marginTop: 2, fontStyle: "italic" }}>
              Earlier check-ins are read-only.
            </p>
          )}
          {/* View full analysis link */}
          <a href="/personnel/checkin" style={{ fontSize: 12, color: "#147d6e",
            display: "inline-flex", alignItems: "center", gap: 5, marginTop: 8 }}>
            View full analysis <ArrowRight size={12} />
          </a>
        </div>
      )}
    </div>
  );
}

// ─── Small helper component ───────────────────────────────────────────────────

function Field({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{
      background: highlight ? "#e9f4ee" : "#f4f7f8",
      borderRadius: 7, padding: "8px 10px",
    }}>
      <small style={{ fontSize: 10, fontWeight: 600, color: "#8b9ba3",
        display: "block", letterSpacing: "0.5px", marginBottom: 2 }}>
        {label.toUpperCase()}
      </small>
      <span style={{ fontSize: 13, fontWeight: 500, color: highlight ? "#278c72" : "#2e5560" }}>
        {value}
      </span>
    </div>
  );
}
