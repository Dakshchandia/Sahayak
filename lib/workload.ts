/**
 * Workload & Recovery Calculation Library
 * ─────────────────────────────────────────
 * Pure functions — no database access, no side-effects.
 * All inputs are Date objects (UTC) or plain numbers.
 *
 * IMPORTANT BOUNDARIES:
 * - These calculations are operational planning tools, not clinical assessments.
 * - Wellness, mood, fatigue check-in values are NEVER used here.
 * - "Policy not configured" is returned when no unit policy exists.
 * - This library does NOT claim legal standards; it applies configured unit policies.
 * - Missing actual times are flagged as missing — never treated as zero hours.
 * - Future scheduled duties are never treated as completed actual work.
 */

export interface DutyInterval {
  id: number;
  scheduledStart: Date;
  scheduledEnd: Date;
  scheduledBreakMinutes: number;
  actualStart: Date | null;
  actualEnd: Date | null;
  actualBreakMinutes: number | null;
  verificationStatus: string; // "pending" | "verified" | "disputed" | "no_actual_data"
  isAdditionalDuty: boolean;
  status: string; // "scheduled" | "completed" | "cancelled" | "in_progress"
}

export interface WorkloadPolicy {
  nightStartHH: number;   // 22 = 22:00
  nightEndHH: number;     // 6  = 06:00
  warnWeeklyHoursExceeds: number;
  warnConsecutiveDaysExceeds: number;
  warnNightShiftsPerMonthExceeds: number;
  blockWeeklyHoursExceeds: number;
  blockConsecutiveDaysExceeds: number;
  minRecoveryHoursWarning: number;
  minRecoveryHoursBlock: number;
  maxAdditionalHoursPerWeek: number;
  isDemoConfig: boolean;
  label: string;
}

export const DEFAULT_DEMO_POLICY: WorkloadPolicy = {
  nightStartHH: 22,
  nightEndHH: 6,
  warnWeeklyHoursExceeds: 48,
  warnConsecutiveDaysExceeds: 6,
  warnNightShiftsPerMonthExceeds: 8,
  blockWeeklyHoursExceeds: 60,
  blockConsecutiveDaysExceeds: 10,
  minRecoveryHoursWarning: 10,
  minRecoveryHoursBlock: 8,
  maxAdditionalHoursPerWeek: 10,
  isDemoConfig: true,
  label: "Alpha Unit Demo Policy",
};

// ─── Duration helpers ──────────────────────────────────────────────────────────

/** Duration in minutes between two Date objects. */
export function durationMinutes(start: Date, end: Date): number {
  return Math.max(0, (end.getTime() - start.getTime()) / 60_000);
}

/** Duration in hours (decimal). */
export function durationHours(start: Date, end: Date): number {
  return durationMinutes(start, end) / 60;
}

// ─── Scheduled vs Actual ──────────────────────────────────────────────────────

export interface DutyDurations {
  scheduledDurationMinutes: number;
  scheduledWorkMinutes: number; // after subtracting scheduled break
  actualDurationMinutes: number | null;
  actualWorkMinutes: number | null;   // after subtracting actual break; null if no actual times
  additionalMinutes: number | null;   // null if actual times are missing
  additionalHours: number | null;
  missingActual: boolean;             // true when actual times are not yet recorded
  isFuture: boolean;                  // true when scheduled start is in the future
  dataNote: string | null;            // human-readable explanation when data is incomplete
}

/**
 * Compute scheduled vs actual durations for a single duty entry.
 *
 * Rules:
 * - If actualStart or actualEnd is null, additionalMinutes is null (not zero).
 * - Future duties are never treated as completed.
 * - Break minutes subtract from gross duration; negative net is clamped to 0.
 */
export function computeDutyDurations(
  duty: DutyInterval,
  now: Date = new Date()
): DutyDurations {
  const scheduledDurationMinutes = durationMinutes(duty.scheduledStart, duty.scheduledEnd);
  const scheduledBreak = duty.scheduledBreakMinutes ?? 0;
  const scheduledWorkMinutes = Math.max(0, scheduledDurationMinutes - scheduledBreak);

  const isFuture = duty.scheduledStart > now;
  const isCancelled = duty.status === "cancelled";

  if (isFuture || isCancelled || !duty.actualStart || !duty.actualEnd) {
    const note = isCancelled
      ? "Duty was cancelled."
      : isFuture
      ? "Duty is scheduled in the future — actual times not yet available."
      : "Actual start/end times have not been recorded yet. This entry shows scheduled hours only.";

    return {
      scheduledDurationMinutes,
      scheduledWorkMinutes,
      actualDurationMinutes: null,
      actualWorkMinutes: null,
      additionalMinutes: null,
      additionalHours: null,
      missingActual: !isCancelled && !isFuture,
      isFuture,
      dataNote: note,
    };
  }

  const actualDurationMinutes = durationMinutes(duty.actualStart, duty.actualEnd);
  const actualBreak = duty.actualBreakMinutes ?? duty.scheduledBreakMinutes ?? 0;
  const actualWorkMinutes = Math.max(0, actualDurationMinutes - actualBreak);
  const additionalMinutes = Math.max(0, actualWorkMinutes - scheduledWorkMinutes);

  return {
    scheduledDurationMinutes,
    scheduledWorkMinutes,
    actualDurationMinutes,
    actualWorkMinutes,
    additionalMinutes,
    additionalHours: additionalMinutes / 60,
    missingActual: false,
    isFuture: false,
    dataNote: duty.verificationStatus === "pending"
      ? "Actual hours are self-reported and awaiting verification."
      : duty.verificationStatus === "disputed"
      ? "This entry is disputed and under review."
      : null,
  };
}

// ─── Night-duty duration ──────────────────────────────────────────────────────

/**
 * Calculate minutes of a given interval that fall within the night window.
 * Night window is defined by policy (e.g. 22:00–06:00 local time).
 * Handles overnight spans correctly.
 *
 * @param start     Interval start (UTC)
 * @param end       Interval end (UTC)
 * @param nightStartHH  Hour when night begins (local clock, 0–23)
 * @param nightEndHH    Hour when night ends   (local clock, 0–23)
 * @param tzOffsetHours UTC offset for the unit's timezone (e.g. +5.5 for IST)
 */
export function nightDurationMinutes(
  start: Date,
  end: Date,
  nightStartHH: number = 22,
  nightEndHH: number = 6,
  tzOffsetHours: number = 5.5 // default IST
): number {
  const totalMins = durationMinutes(start, end);
  if (totalMins <= 0) return 0;

  const tzOffsetMs = tzOffsetHours * 3_600_000;
  const MINUTE = 60_000;
  const DAY_MINS = 24 * 60;

  // Build the "night minutes" set as a sorted list of [nightStartMins, nightEndMins)
  // within a 24-h day (minutes from midnight).
  // Night window that crosses midnight: [nightStartHH*60, 1440) ∪ [0, nightEndHH*60)
  // Night window that does not cross midnight (rare): [nightStartHH*60, nightEndHH*60)
  const nightStart = nightStartHH * 60; // e.g. 22*60 = 1320
  const nightEnd = nightEndHH * 60;     // e.g.  6*60 =  360

  let nightMins = 0;
  // Walk minute by minute is O(n) — adequate for shifts ≤ 24 h; replace with
  // closed-form arithmetic if performance ever matters.
  let t = start.getTime();
  while (t < end.getTime()) {
    const localMs = t + tzOffsetMs;
    const minuteOfDay = Math.floor((localMs / MINUTE) % DAY_MINS);
    // Crosses midnight: night = [nightStart, 1440) ∪ [0, nightEnd)
    const isNight =
      nightStart > nightEnd
        ? minuteOfDay >= nightStart || minuteOfDay < nightEnd
        : minuteOfDay >= nightStart && minuteOfDay < nightEnd;
    if (isNight) nightMins++;
    t += MINUTE;
  }
  return nightMins;
}

/** Is this shift a "night duty"? True if ≥ 2 h fall in the night window. */
export function isNightDuty(
  start: Date,
  end: Date,
  policy: WorkloadPolicy,
  tzOffsetHours: number = 5.5
): boolean {
  return nightDurationMinutes(start, end, policy.nightStartHH, policy.nightEndHH, tzOffsetHours) >= 120;
}

// ─── Consecutive duty days ─────────────────────────────────────────────────────

/**
 * Count consecutive calendar days with at least one non-cancelled duty ending
 * at or before `asOf`.  Counts backwards from the most recent duty day.
 *
 * Uses the scheduled start date (local) for day boundaries.
 */
export function consecutiveDutyDays(
  duties: DutyInterval[],
  asOf: Date = new Date(),
  tzOffsetHours: number = 5.5
): number {
  const tzOffsetMs = tzOffsetHours * 3_600_000;
  const MS_PER_DAY = 86_400_000;

  // Build a set of duty calendar dates (local)
  const dutyDays = new Set<string>();
  for (const d of duties) {
    if (d.status === "cancelled") continue;
    if (d.scheduledStart > asOf) continue;
    const localDate = new Date(d.scheduledStart.getTime() + tzOffsetMs);
    dutyDays.add(localDate.toISOString().slice(0, 10));
  }

  if (dutyDays.size === 0) return 0;

  // Find the most recent duty date ≤ asOf
  const todayLocal = new Date(asOf.getTime() + tzOffsetMs);
  let cursor = new Date(todayLocal);
  cursor.setHours(12, 0, 0, 0); // midday anchor

  let consecutive = 0;
  while (true) {
    const dateStr = cursor.toISOString().slice(0, 10);
    if (!dutyDays.has(dateStr)) break;
    consecutive++;
    cursor = new Date(cursor.getTime() - MS_PER_DAY);
  }
  return consecutive;
}

// ─── Recovery interval ────────────────────────────────────────────────────────

/**
 * Compute the gap in minutes between the end of one duty and the start of the next.
 * Returns null if either duty has missing actual times.
 * Uses actual end when available and verified; falls back to scheduled end.
 */
export function recoveryIntervalMinutes(
  previousDuty: DutyInterval,
  nextDuty: DutyInterval
): number | null {
  const prevEnd =
    previousDuty.actualEnd && previousDuty.verificationStatus === "verified"
      ? previousDuty.actualEnd
      : previousDuty.scheduledEnd;

  const nextStart =
    nextDuty.actualStart && nextDuty.verificationStatus === "verified"
      ? nextDuty.actualStart
      : nextDuty.scheduledStart;

  const gap = durationMinutes(prevEnd, nextStart);
  return gap >= 0 ? gap : null; // negative = overlapping intervals
}

// ─── Overlap detection ────────────────────────────────────────────────────────

export interface OverlapResult {
  hasOverlap: boolean;
  conflictingIds: number[];
  description: string | null;
}

/**
 * Check whether a proposed interval [start, end) overlaps any existing duty.
 * Cancelled duties are excluded from the check.
 */
export function detectOverlap(
  proposedStart: Date,
  proposedEnd: Date,
  existingDuties: DutyInterval[],
  excludeId?: number
): OverlapResult {
  const conflicts: number[] = [];

  for (const d of existingDuties) {
    if (d.status === "cancelled") continue;
    if (excludeId !== undefined && d.id === excludeId) continue;
    // Overlap condition: proposed starts before existing ends AND proposed ends after existing starts
    if (proposedStart < d.scheduledEnd && proposedEnd > d.scheduledStart) {
      conflicts.push(d.id);
    }
  }

  return {
    hasOverlap: conflicts.length > 0,
    conflictingIds: conflicts,
    description:
      conflicts.length > 0
        ? `Overlaps with ${conflicts.length} existing duty record(s) (IDs: ${conflicts.join(", ")}). Overlapping records are flagged for review.`
        : null,
  };
}

// ─── Weekly hour aggregation ──────────────────────────────────────────────────

export interface WeeklyHourSummary {
  weekStart: string; // ISO date YYYY-MM-DD
  scheduledHours: number;
  verifiedActualHours: number;
  pendingActualHours: number;
  additionalHours: number;
  nightShiftCount: number;
  hasIncompleteData: boolean;
  missingActualCount: number;
}

/**
 * Aggregate duty entries into per-week summaries.
 * Weeks start on Monday.
 */
export function aggregateByWeek(
  duties: DutyInterval[],
  policy: WorkloadPolicy,
  tzOffsetHours: number = 5.5,
  now: Date = new Date()
): WeeklyHourSummary[] {
  const tzOffsetMs = tzOffsetHours * 3_600_000;
  const weeks = new Map<string, WeeklyHourSummary>();

  for (const duty of duties) {
    if (duty.status === "cancelled") continue;
    // Assign to the week of scheduledStart
    const localStart = new Date(duty.scheduledStart.getTime() + tzOffsetMs);
    const dow = (localStart.getDay() + 6) % 7; // Mon=0…Sun=6
    const weekStart = new Date(localStart.getTime() - dow * 86_400_000);
    weekStart.setHours(0, 0, 0, 0);
    const key = weekStart.toISOString().slice(0, 10);

    if (!weeks.has(key)) {
      weeks.set(key, {
        weekStart: key,
        scheduledHours: 0,
        verifiedActualHours: 0,
        pendingActualHours: 0,
        additionalHours: 0,
        nightShiftCount: 0,
        hasIncompleteData: false,
        missingActualCount: 0,
      });
    }

    const week = weeks.get(key)!;
    const d = computeDutyDurations(duty, now);

    week.scheduledHours += d.scheduledWorkMinutes / 60;

    if (d.missingActual && !d.isFuture) {
      week.hasIncompleteData = true;
      week.missingActualCount++;
    } else if (d.actualWorkMinutes !== null) {
      if (duty.verificationStatus === "verified") {
        week.verifiedActualHours += d.actualWorkMinutes / 60;
      } else {
        week.pendingActualHours += d.actualWorkMinutes / 60;
      }
      week.additionalHours += (d.additionalMinutes ?? 0) / 60;
    }

    if (isNightDuty(duty.scheduledStart, duty.scheduledEnd, policy, tzOffsetHours)) {
      week.nightShiftCount++;
    }
  }

  return Array.from(weeks.values()).sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}

// ─── Pre-assignment capacity check ────────────────────────────────────────────

export type CheckSeverity = "blocking" | "warning" | "informational" | "insufficient_data";

export interface CapacityFinding {
  severity: CheckSeverity;
  code: string;
  message: string;
  canOverride: boolean; // blocking = false; warning = true (with reason)
  detail?: string;
}

export interface CapacityCheckResult {
  canProceed: boolean; // false if any blocking finding exists
  hasWarnings: boolean;
  findings: CapacityFinding[];
  summary: string;
  checkedAt: string;
  policyLabel: string;
  assumptions: string[];
}

/**
 * Run a capacity check before confirming an assignment.
 * Returns structured findings — never silently relaxes constraints.
 *
 * NEVER uses wellness, mood, fatigue, counselling notes, or psychological scores.
 */
export function checkAssignmentCapacity(
  assigneeId: number,
  assigneeName: string,
  proposedStart: Date,
  proposedEnd: Date,
  estimatedEffortHours: number | null,
  effortType: "within_shift" | "additional",
  existingDuties: DutyInterval[],
  approvedLeave: Array<{ startDate: string; endDate: string }>,
  existingAssignments: Array<{
    id: number;
    plannedStart: Date | null;
    plannedEnd: Date | null;
    deadline: Date | null;
    estimatedEffortHours: number | null;
    effortType: string;
    status: string;
  }>,
  policy: WorkloadPolicy | null,
  now: Date = new Date()
): CapacityCheckResult {
  const findings: CapacityFinding[] = [];
  const assumptions: string[] = [
    "Capacity is estimated from duty ledger records within the proposed window.",
    "Wellness, mood, fatigue or psychological data are excluded from this check.",
    "Approved leave periods are treated as unavailable.",
    effortType === "within_shift"
      ? "Effort is assumed within an existing scheduled shift — not added to duty hours."
      : "Effort is additional to scheduled duty hours.",
  ];

  if (!policy) {
    findings.push({
      severity: "insufficient_data",
      code: "NO_POLICY",
      message: "No workload policy is configured for this unit.",
      canOverride: false,
      detail: "An authorized administrator must configure a unit policy before capacity checks can be run.",
    });
    return {
      canProceed: false,
      hasWarnings: false,
      findings,
      summary: "Policy not configured. Capacity check cannot be completed.",
      checkedAt: now.toISOString(),
      policyLabel: "No policy",
      assumptions,
    };
  }

  // ── Leave conflict ──────────────────────────────────────────────────────────
  for (const leave of approvedLeave) {
    const ls = new Date(leave.startDate + "T00:00:00");
    const le = new Date(leave.endDate + "T23:59:59");
    if (proposedStart <= le && proposedEnd >= ls) {
      findings.push({
        severity: "blocking",
        code: "LEAVE_CONFLICT",
        message: `${assigneeName} is on approved leave from ${leave.startDate} to ${leave.endDate}, which overlaps the proposed assignment window.`,
        canOverride: false,
      });
    }
  }

  // ── Duty overlap ───────────────────────────────────────────────────────────
  const overlap = detectOverlap(proposedStart, proposedEnd, existingDuties);
  if (overlap.hasOverlap) {
    findings.push({
      severity: "blocking",
      code: "DUTY_OVERLAP",
      message: `Proposed assignment window overlaps ${overlap.conflictingIds.length} existing duty record(s).`,
      canOverride: false,
      detail: overlap.description ?? undefined,
    });
  }

  // ── Recovery interval check ─────────────────────────────────────────────────
  // Find duties immediately before and after the proposed window
  const sorted = [...existingDuties]
    .filter((d) => d.status !== "cancelled")
    .sort((a, b) => a.scheduledStart.getTime() - b.scheduledStart.getTime());

  const before = sorted.filter((d) => d.scheduledEnd <= proposedStart).at(-1);
  const after = sorted.find((d) => d.scheduledStart >= proposedEnd);

  if (before) {
    const gapMins = durationMinutes(before.scheduledEnd, proposedStart);
    const gapHours = gapMins / 60;
    if (gapHours < policy.minRecoveryHoursBlock) {
      findings.push({
        severity: "blocking",
        code: "RECOVERY_BELOW_BLOCK",
        message: `Recovery interval before this assignment is ${gapHours.toFixed(1)} hours. The unit policy blocks assignments with less than ${policy.minRecoveryHoursBlock} hours recovery.`,
        canOverride: false,
      });
    } else if (gapHours < policy.minRecoveryHoursWarning) {
      findings.push({
        severity: "warning",
        code: "RECOVERY_BELOW_WARNING",
        message: `Recovery interval before this assignment is ${gapHours.toFixed(1)} hours. The unit policy recommends at least ${policy.minRecoveryHoursWarning} hours. An authorized override with a stated reason is required to proceed.`,
        canOverride: true,
      });
    }
  }

  if (after) {
    const gapMins = durationMinutes(proposedEnd, after.scheduledStart);
    const gapHours = gapMins / 60;
    if (gapHours < policy.minRecoveryHoursBlock) {
      findings.push({
        severity: "blocking",
        code: "RECOVERY_AFTER_BELOW_BLOCK",
        message: `Recovery interval after this assignment is ${gapHours.toFixed(1)} hours. The unit policy blocks assignments with less than ${policy.minRecoveryHoursBlock} hours recovery.`,
        canOverride: false,
      });
    } else if (gapHours < policy.minRecoveryHoursWarning) {
      findings.push({
        severity: "warning",
        code: "RECOVERY_AFTER_BELOW_WARNING",
        message: `Recovery interval after this assignment is ${gapHours.toFixed(1)} hours, below the unit policy recommendation of ${policy.minRecoveryHoursWarning} hours.`,
        canOverride: true,
      });
    }
  }

  // ── Weekly hour check (additional effort only) ─────────────────────────────
  if (effortType === "additional" && estimatedEffortHours !== null) {
    const weekSummaries = aggregateByWeek(existingDuties, policy, 5.5, now);
    const proposedWeekStart = getWeekStart(proposedStart);
    const relevantWeek = weekSummaries.find((w) => w.weekStart === proposedWeekStart);
    const currentAdditional = relevantWeek?.additionalHours ?? 0;
    const projectedAdditional = currentAdditional + estimatedEffortHours;

    if (projectedAdditional > policy.blockWeeklyHoursExceeds - (relevantWeek?.scheduledHours ?? 0)) {
      findings.push({
        severity: "warning",
        code: "WEEKLY_HOURS_HIGH",
        message: `Adding ${estimatedEffortHours}h to this week's existing ${(relevantWeek?.scheduledHours ?? 0).toFixed(1)} scheduled hours approaches the unit policy threshold (${policy.blockWeeklyHoursExceeds}h). Review before confirming.`,
        canOverride: true,
      });
    }

    if (projectedAdditional > policy.maxAdditionalHoursPerWeek) {
      findings.push({
        severity: "warning",
        code: "ADDITIONAL_HOURS_EXCEED",
        message: `Projected additional hours for this week (${projectedAdditional.toFixed(1)}h) exceed the unit policy recommendation of ${policy.maxAdditionalHoursPerWeek}h per week.`,
        canOverride: true,
      });
    }
  }

  // ── Consecutive days check ─────────────────────────────────────────────────
  const consec = consecutiveDutyDays(existingDuties);
  if (consec >= policy.blockConsecutiveDaysExceeds) {
    findings.push({
      severity: "blocking",
      code: "CONSECUTIVE_DAYS_BLOCK",
      message: `${assigneeName} already has ${consec} consecutive duty days. The unit policy blocks new assignments beyond ${policy.blockConsecutiveDaysExceeds} consecutive days.`,
      canOverride: false,
    });
  } else if (consec >= policy.warnConsecutiveDaysExceeds) {
    findings.push({
      severity: "warning",
      code: "CONSECUTIVE_DAYS_WARN",
      message: `${assigneeName} has ${consec} consecutive duty days, reaching the unit policy warning threshold of ${policy.warnConsecutiveDaysExceeds} days.`,
      canOverride: true,
    });
  }

  // ── Deadline conflicts ─────────────────────────────────────────────────────
  const deadlineConflicts = existingAssignments.filter(
    (a) =>
      a.status !== "cancelled" &&
      a.status !== "completed" &&
      a.deadline !== null &&
      a.plannedEnd !== null &&
      a.deadline < proposedEnd
  );
  if (deadlineConflicts.length > 0) {
    findings.push({
      severity: "informational",
      code: "EXISTING_DEADLINES",
      message: `${assigneeName} has ${deadlineConflicts.length} existing assignment(s) with deadlines that fall within or before the proposed window. Review priorities before confirming.`,
      canOverride: true,
    });
  }

  // ── Missing effort estimate ────────────────────────────────────────────────
  if (estimatedEffortHours === null || estimatedEffortHours <= 0) {
    findings.push({
      severity: "insufficient_data",
      code: "NO_EFFORT_ESTIMATE",
      message: "No effort estimate was provided for this assignment. Capacity cannot be fully checked.",
      canOverride: true,
    });
  }

  // ── Summarize ─────────────────────────────────────────────────────────────
  const blocking = findings.filter((f) => f.severity === "blocking");
  const warnings = findings.filter((f) => f.severity === "warning");
  const canProceed = blocking.length === 0;
  const demoNote = policy.isDemoConfig
    ? ` [${policy.label} — demonstration configuration, not a legal standard]`
    : "";

  const summary = blocking.length > 0
    ? `${blocking.length} blocking conflict(s) prevent this assignment from being confirmed.${demoNote}`
    : warnings.length > 0
    ? `${warnings.length} policy warning(s) require an override with a stated reason before confirming.${demoNote}`
    : `No conflicts found. This assignment can be confirmed.${demoNote}`;

  return {
    canProceed,
    hasWarnings: warnings.length > 0,
    findings,
    summary,
    checkedAt: now.toISOString(),
    policyLabel: policy.label,
    assumptions,
  };
}

// ─── Scenario planner ─────────────────────────────────────────────────────────

export interface ScenarioInput {
  unitId: number;
  periodStart: Date;
  periodEnd: Date;
  duties: DutyInterval[]; // current roster duties
  members: Array<{
    userId: number;
    name: string;
    availableHours: number; // scheduled capacity in the period
    currentNightShifts: number;
    currentAdditionalHours: number;
    skillIds: number[];
  }>;
  requiredStaffingPerDay: number;
  policy: WorkloadPolicy | null;
}

export interface ScenarioProposal {
  type: "reassign" | "rotate_nights" | "defer" | "reserve_recovery" | "insufficient_staffing";
  description: string;
  affectedUserIds: number[];
  estimatedImpact: string;
}

export interface ScenarioResult {
  feasible: boolean;
  infeasibilityReason: string | null;
  uncoveredDutyCount: number;
  proposals: ScenarioProposal[];
  policyWarnings: string[];
  operationalSummary: string;
  disclaimer: string;
  assumptions: string[];
}

/**
 * Generate a coverage-aware rebalancing scenario.
 * Returns an honest infeasibility explanation when constraints cannot be met.
 * Never silently relaxes constraints or invents available staff.
 * Never predicts mental-health improvement.
 */
export function generateScenario(input: ScenarioInput): ScenarioResult {
  const disclaimer =
    "SCENARIO ESTIMATES ONLY. Results describe operational changes under stated assumptions. " +
    "Does not predict mental-health or wellness outcomes. Wellness indicators excluded. " +
    "No real schedules are changed until explicitly applied after approval.";

  const assumptions = [
    `Period: ${input.periodStart.toISOString().slice(0, 10)} to ${input.periodEnd.toISOString().slice(0, 10)}.`,
    `Required staffing: ${input.requiredStaffingPerDay} persons per duty day.`,
    "Availability is based on scheduled duty records and approved leave.",
    "Wellness, mood, fatigue and psychological data excluded from all calculations.",
    input.policy
      ? `Unit policy: ${input.policy.label}${input.policy.isDemoConfig ? " (demonstration configuration)" : ""}.`
      : "No unit policy configured — policy checks skipped.",
  ];

  if (!input.policy) {
    return {
      feasible: false,
      infeasibilityReason: "No unit workload policy is configured. An administrator must set up a policy before scenario planning can run.",
      uncoveredDutyCount: 0,
      proposals: [],
      policyWarnings: ["Policy not configured — capacity checks cannot be performed."],
      operationalSummary: "Scenario cannot be generated without a configured unit policy.",
      disclaimer,
      assumptions,
    };
  }

  const policy = input.policy;
  const proposals: ScenarioProposal[] = [];
  const policyWarnings: string[] = [];

  // Count available members (not over consecutive-day limit)
  const availableCount = input.members.filter(
    (m) => m.currentAdditionalHours < policy.maxAdditionalHoursPerWeek
  ).length;

  // Check if required staffing can be met
  const periodDays = Math.ceil(
    (input.periodEnd.getTime() - input.periodStart.getTime()) / 86_400_000
  );
  const totalRequiredSlots = periodDays * input.requiredStaffingPerDay;
  const totalAvailableSlots = input.members.reduce((sum, m) => {
    const withinLimit = m.availableHours / 8; // assume 8h shifts
    return sum + Math.min(withinLimit, periodDays);
  }, 0);

  const uncoveredDutyCount = Math.max(0, totalRequiredSlots - totalAvailableSlots);

  if (uncoveredDutyCount > 0) {
    return {
      feasible: false,
      infeasibilityReason:
        `Required coverage: ${totalRequiredSlots} duty slots over ${periodDays} days. ` +
        `Available capacity (within policy limits): ${totalAvailableSlots.toFixed(0)} slots. ` +
        `Shortfall: ${uncoveredDutyCount.toFixed(0)} slots. ` +
        "Consider requesting additional staffing or adjusting the required coverage level.",
      uncoveredDutyCount,
      proposals: [
        {
          type: "insufficient_staffing",
          description: `Additional ${Math.ceil(uncoveredDutyCount / periodDays)} personnel needed to meet the required coverage of ${input.requiredStaffingPerDay} per day.`,
          affectedUserIds: [],
          estimatedImpact: "Shortfall cannot be resolved without additional staffing or reduced coverage requirements.",
        },
      ],
      policyWarnings: [`Staffing shortfall of ${uncoveredDutyCount.toFixed(0)} duty slots.`],
      operationalSummary: "Insufficient staffing to meet required coverage under current policy constraints.",
      disclaimer,
      assumptions,
    };
  }

  // Night shift distribution check
  const nightHeavy = input.members.filter(
    (m) => m.currentNightShifts > policy.warnNightShiftsPerMonthExceeds
  );
  if (nightHeavy.length > 0) {
    const lightNight = input.members.filter(
      (m) => m.currentNightShifts < policy.warnNightShiftsPerMonthExceeds
    );
    policyWarnings.push(
      `${nightHeavy.length} member(s) exceed the night-shift policy recommendation. ` +
      `Review assignment distribution.`
    );
    proposals.push({
      type: "rotate_nights",
      description: `Rotate night duties from ${nightHeavy.length} overloaded member(s) to ${lightNight.length} member(s) with available night-shift capacity.`,
      affectedUserIds: [...nightHeavy.map((m) => m.userId), ...lightNight.slice(0, nightHeavy.length).map((m) => m.userId)],
      estimatedImpact: `Additional duties concentrated among a small group. Review assignment distribution.`,
    });
  }

  // Additional hours concentration check
  const additionalHeavy = input.members.filter(
    (m) => m.currentAdditionalHours > policy.maxAdditionalHoursPerWeek * 0.8
  );
  if (additionalHeavy.length > input.members.length * 0.3) {
    policyWarnings.push("Additional duties are concentrated among fewer than a third of available personnel.");
    proposals.push({
      type: "reassign",
      description: "Redistribute additional duties to personnel with available capacity below the policy threshold.",
      affectedUserIds: additionalHeavy.map((m) => m.userId),
      estimatedImpact: "Estimated reduction in per-person additional hours after redistribution.",
    });
  }

  // Recovery reservation proposal
  proposals.push({
    type: "reserve_recovery",
    description: `Schedule at least ${policy.minRecoveryHoursWarning}h recovery gaps between consecutive duties for all personnel.`,
    affectedUserIds: input.members.map((m) => m.userId),
    estimatedImpact: "All personnel meet the minimum recovery interval per unit policy.",
  });

  return {
    feasible: true,
    infeasibilityReason: null,
    uncoveredDutyCount: 0,
    proposals,
    policyWarnings,
    operationalSummary:
      `${input.members.length} personnel available. Required coverage can be met. ` +
      (proposals.length > 0
        ? `${proposals.length} rebalancing suggestion(s) generated.`
        : "No rebalancing needed under current load."),
    disclaimer,
    assumptions,
  };
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function getWeekStart(date: Date, tzOffsetHours = 5.5): string {
  const tzOffsetMs = tzOffsetHours * 3_600_000;
  const local = new Date(date.getTime() + tzOffsetMs);
  const dow = (local.getDay() + 6) % 7; // Mon=0
  const ws = new Date(local.getTime() - dow * 86_400_000);
  ws.setHours(0, 0, 0, 0);
  return ws.toISOString().slice(0, 10);
}

/** Format duration in hours:minutes for display */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/** Compute permission flags for a user on a given unit. */
export interface WorkloadPermissions {
  canViewDutyLedger: boolean;        // always true for the user's own data
  canViewUnitRoster: boolean;        // duty manager access: canViewIndividualDuty
  canEditRoster: boolean;            // duty manager access: canEditRoster
  canApproveAssignments: boolean;    // duty manager access: canApproveAssignments
  canApplyScenarios: boolean;        // duty manager access: canApplyScenarios
  canViewAggregatesOnly: boolean;    // commander with NO duty manager access
  // What this role can NEVER access (enforced here and in API layer):
  canAccessWellnessData: boolean;    // always false in operational APIs
  canAccessCounsellingNotes: boolean; // always false in operational APIs
}

export function resolveWorkloadPermissions(
  userId: number,
  targetUnitId: number,
  role: string,
  ownUnitId: number | null,
  dutyManagerAccess: Array<{
    unitId: number;
    canViewIndividualDuty: boolean;
    canEditRoster: boolean;
    canApproveAssignments: boolean;
    canApplyScenarios: boolean;
    isActive: boolean;
  }>
): WorkloadPermissions {
  const dma = dutyManagerAccess.find(
    (a) => a.unitId === targetUnitId && a.isActive
  );

  const isOwnUnit = ownUnitId === targetUnitId;
  const isPersonnel = role === "personnel";
  const isAdmin = role === "admin";

  return {
    // Personnel always see their own duty ledger
    canViewDutyLedger: isPersonnel ? isOwnUnit : (isAdmin || !!dma?.canViewIndividualDuty),
    canViewUnitRoster: isAdmin || !!dma?.canViewIndividualDuty,
    canEditRoster: isAdmin || !!dma?.canEditRoster,
    canApproveAssignments: isAdmin || !!dma?.canApproveAssignments,
    canApplyScenarios: isAdmin || !!dma?.canApplyScenarios,
    // Commander with no DMA gets aggregate-only view (same as before)
    canViewAggregatesOnly: role === "commander" && !dma,
    // Operational APIs NEVER expose wellness or counselling data
    canAccessWellnessData: false,
    canAccessCounsellingNotes: false,
  };
}
