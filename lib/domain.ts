/**
 * Explainable rule-based welfare assessment engine — v1.0.0
 *
 * SCORING CONTRACT
 * ────────────────
 * rawScore        — sum of all triggered factor point contributions.
 * maxPossibleScore — sum of the highest-tier points for every factor that has
 *                   data available in this assessment (wellness factors only
 *                   count toward the max when consent AND data are present).
 * priority        — derived from rawScore vs the rule-version's thresholds.
 *
 * Scores are NEVER shown as "out of 100".  The denominator shown in the UI is
 * always maxPossibleScore, which varies by data availability.
 *
 * Under RULES_V1 with all 10 factors at their HIGH tier:
 *   20+20+15+15+15+10+8 (org) + 15+15+10 (wellness) = 143 points maximum.
 * With no wellness data (7 org factors only): 103 points maximum.
 *
 * The 4.5-hour sleep rule is in the LOW band (< 5 h, not < 4 h) → 8 points.
 * veryLow (< 4 h) → 15 points.  This matches the stored rule thresholds below.
 *
 * Regression test anchors (RULES_V1, all other factors at zero):
 *   68 weekly hours   = 20 pts  (>60 high tier)
 *   9 night shifts    = 20 pts  (>8 high tier)
 *   4.5 h sleep       =  8 pts  (<5 low tier, NOT <4)
 *   fatigue 8/10      = 15 pts  (≥8 high tier)
 *   four-factor total = 63 pts  → elevated (≥55 threshold)
 *
 * IMPORTANT BOUNDARIES
 * ────────────────────
 * - Scores are prioritization aids for human welfare review, NOT clinical diagnoses.
 * - Scores are NOT probabilities of any mental-health condition.
 * - Missing wellness data contributes ZERO points — absence of data ≠ distress.
 * - A support request triggers human review regardless of score.
 * - Thresholds are illustrative and have NOT been clinically validated.
 * - Mood is recorded but currently contributes zero points (no mood rule).
 */

export type Priority = "routine" | "watch" | "elevated";

export interface RuleInput {
  // ── Organizational data (from authorized records) ──────────────────────
  weeklyHours: number;
  nightShifts: number;
  consecutiveDays: number;
  deploymentDays: number;
  daysSinceLeave: number;
  transfersLast6Months: number;
  trainingDaysLast30: number;
  // ── Voluntary wellness (only when consent AND data present) ────────────
  sleepHours: number | null;       // null = not shared / consent withdrawn
  fatigue: number | null;          // 1–10; null = not shared
  mood: number | null;             // 1–5; recorded but not scored
  perceivedWorkload: number | null; // 1–10; null = not shared
  // ── Context ────────────────────────────────────────────────────────────
  hasActiveSupport: boolean;
}

export interface Factor {
  name: string;
  kind: "Workload" | "Recovery" | "Deployment" | "Leave" | "Wellness" | "Transfer";
  value: string;
  points: number;         // actual contribution to rawScore
  maxPoints: number;      // maximum possible for this factor (used in denominator)
  rationale: string;
}

export interface AssessmentResult {
  rawScore: number;           // sum of factor.points — the authoritative score
  maxPossibleScore: number;   // sum of factor.maxPoints for available factors
  priority: Priority;         // derived from rawScore + rule thresholds
  factors: Factor[];
  missingDataFlags: string[]; // factors excluded due to missing/no-consent data
  dataCoverage: number;       // 0.0–1.0 fraction of possible factors that have data
  plainExplanation: string;
  // Legacy alias — equals rawScore; kept so existing DB inserts don't break
  totalScore: number;
}

// ─── Rule thresholds (v1.0.0) ─────────────────────────────────────────────────
// Loaded from rule_versions table at runtime; this object is the shipped default.
// DO NOT change thresholds here to make demo scores look better — update the DB.
export const DEFAULT_RULES_V1 = {
  version: "1.0.0",
  weeklyHours:        { high: 60,  moderate: 48, highPoints: 20, moderatePoints: 10 },
  nightShifts:        { high: 8,   moderate: 5,  highPoints: 20, moderatePoints: 10 },
  consecutiveDays:    { high: 10,  moderate: 6,  highPoints: 15, moderatePoints: 8  },
  deploymentDays:     { high: 45,  moderate: 20, highPoints: 15, moderatePoints: 8  },
  daysSinceLeave:     { high: 90,  moderate: 60, highPoints: 15, moderatePoints: 7  },
  transfers:          { high: 2,   moderate: 1,  highPoints: 10, moderatePoints: 5  },
  trainingDays:       { high: 20,  moderate: 10, highPoints: 8,  moderatePoints: 4  },
  // sleep: veryLow < 4 h (15 pts), low < 5 h (8 pts).  4.5 h → low → 8 pts.
  sleepHours:         { low: 5,    veryLow: 4,   lowPoints: 8,   veryLowPoints: 15  },
  fatigue:            { high: 8,   moderate: 6,  highPoints: 15, moderatePoints: 8  },
  workloadPerception: { high: 8,   moderate: 6,  highPoints: 10, moderatePoints: 5  },
  priorityThresholds: { elevated: 55, watch: 25 },
};

export type RuleConfig = typeof DEFAULT_RULES_V1;

/**
 * Calculate the maximum possible score for a given rule config,
 * considering which wellness factors have data available.
 */
export function calculateMaxPossibleScore(
  rules: RuleConfig,
  hasWellnessData: { sleep: boolean; fatigue: boolean; workload: boolean }
): number {
  // Organizational factors always present
  const orgMax =
    rules.weeklyHours.highPoints +
    rules.nightShifts.highPoints +
    rules.consecutiveDays.highPoints +
    rules.deploymentDays.highPoints +
    rules.daysSinceLeave.highPoints +
    rules.transfers.highPoints +
    rules.trainingDays.highPoints;

  // Wellness factors only count toward max when data is available
  const wellnessMax =
    (hasWellnessData.sleep    ? rules.sleepHours.veryLowPoints       : 0) +
    (hasWellnessData.fatigue  ? rules.fatigue.highPoints              : 0) +
    (hasWellnessData.workload ? rules.workloadPerception.highPoints   : 0);

  return orgMax + wellnessMax;
}

export function calculateAssessment(
  input: RuleInput,
  rules: RuleConfig = DEFAULT_RULES_V1
): AssessmentResult {
  const factors: Factor[] = [];
  const missing: string[] = [];

  // ── Organizational factors (always present) ─────────────────────────────

  factors.push({
    name: "Weekly duty hours",
    kind: "Workload",
    value: `${input.weeklyHours} hours`,
    maxPoints: rules.weeklyHours.highPoints,
    points:
      input.weeklyHours > rules.weeklyHours.high
        ? rules.weeklyHours.highPoints
        : input.weeklyHours > rules.weeklyHours.moderate
        ? rules.weeklyHours.moderatePoints
        : 0,
    rationale: `High: >${rules.weeklyHours.high}h = ${rules.weeklyHours.highPoints}pts · Moderate: >${rules.weeklyHours.moderate}h = ${rules.weeklyHours.moderatePoints}pts`,
  });

  factors.push({
    name: "Night duties this month",
    kind: "Recovery",
    value: `${input.nightShifts} shifts`,
    maxPoints: rules.nightShifts.highPoints,
    points:
      input.nightShifts > rules.nightShifts.high
        ? rules.nightShifts.highPoints
        : input.nightShifts > rules.nightShifts.moderate
        ? rules.nightShifts.moderatePoints
        : 0,
    rationale: `High: >${rules.nightShifts.high} = ${rules.nightShifts.highPoints}pts · Moderate: >${rules.nightShifts.moderate} = ${rules.nightShifts.moderatePoints}pts`,
  });

  factors.push({
    name: "Consecutive duty days",
    kind: "Recovery",
    value: `${input.consecutiveDays} days`,
    maxPoints: rules.consecutiveDays.highPoints,
    points:
      input.consecutiveDays > rules.consecutiveDays.high
        ? rules.consecutiveDays.highPoints
        : input.consecutiveDays > rules.consecutiveDays.moderate
        ? rules.consecutiveDays.moderatePoints
        : 0,
    rationale: `High: >${rules.consecutiveDays.high}d = ${rules.consecutiveDays.highPoints}pts · Moderate: >${rules.consecutiveDays.moderate}d = ${rules.consecutiveDays.moderatePoints}pts`,
  });

  factors.push({
    name: "Deployment duration",
    kind: "Deployment",
    value: `${input.deploymentDays} days`,
    maxPoints: rules.deploymentDays.highPoints,
    points:
      input.deploymentDays > rules.deploymentDays.high
        ? rules.deploymentDays.highPoints
        : input.deploymentDays > rules.deploymentDays.moderate
        ? rules.deploymentDays.moderatePoints
        : 0,
    rationale: `High: >${rules.deploymentDays.high}d = ${rules.deploymentDays.highPoints}pts · Moderate: >${rules.deploymentDays.moderate}d = ${rules.deploymentDays.moderatePoints}pts`,
  });

  factors.push({
    name: "Days since last leave",
    kind: "Leave",
    value: `${input.daysSinceLeave} days`,
    maxPoints: rules.daysSinceLeave.highPoints,
    points:
      input.daysSinceLeave > rules.daysSinceLeave.high
        ? rules.daysSinceLeave.highPoints
        : input.daysSinceLeave > rules.daysSinceLeave.moderate
        ? rules.daysSinceLeave.moderatePoints
        : 0,
    rationale: `High: >${rules.daysSinceLeave.high}d = ${rules.daysSinceLeave.highPoints}pts · Moderate: >${rules.daysSinceLeave.moderate}d = ${rules.daysSinceLeave.moderatePoints}pts`,
  });

  factors.push({
    name: "Transfers (last 6 months)",
    kind: "Transfer",
    value: `${input.transfersLast6Months}`,
    maxPoints: rules.transfers.highPoints,
    points:
      input.transfersLast6Months >= rules.transfers.high
        ? rules.transfers.highPoints
        : input.transfersLast6Months >= rules.transfers.moderate
        ? rules.transfers.moderatePoints
        : 0,
    rationale: `High: >=${rules.transfers.high} = ${rules.transfers.highPoints}pts · Moderate: >=${rules.transfers.moderate} = ${rules.transfers.moderatePoints}pts`,
  });

  factors.push({
    name: "Training days (last 30 days)",
    kind: "Workload",
    value: `${input.trainingDaysLast30} days`,
    maxPoints: rules.trainingDays.highPoints,
    points:
      input.trainingDaysLast30 > rules.trainingDays.high
        ? rules.trainingDays.highPoints
        : input.trainingDaysLast30 > rules.trainingDays.moderate
        ? rules.trainingDays.moderatePoints
        : 0,
    rationale: `High: >${rules.trainingDays.high}d = ${rules.trainingDays.highPoints}pts · Moderate: >${rules.trainingDays.moderate}d = ${rules.trainingDays.moderatePoints}pts`,
  });

  // ── Voluntary wellness factors ───────────────────────────────────────────
  // Only included when consent was given AND data was actually provided.
  // Null = not shared OR consent withdrawn → 0 points, no max contribution.

  if (input.sleepHours !== null) {
    // veryLow: < 4 h → 15 pts.  low: < 5 h → 8 pts.  ≥ 5 h → 0 pts.
    // NOTE: 4.5 h is NOT < 4, so it falls in the low band → 8 pts (not 15).
    factors.push({
      name: "Self-reported sleep",
      kind: "Wellness",
      value: `${input.sleepHours} hours`,
      maxPoints: rules.sleepHours.veryLowPoints,
      points:
        input.sleepHours < rules.sleepHours.veryLow
          ? rules.sleepHours.veryLowPoints
          : input.sleepHours < rules.sleepHours.low
          ? rules.sleepHours.lowPoints
          : 0,
      rationale: `Voluntarily shared. Very low (<${rules.sleepHours.veryLow}h) = ${rules.sleepHours.veryLowPoints}pts; Low (<${rules.sleepHours.low}h) = ${rules.sleepHours.lowPoints}pts.`,
    });
  } else {
    missing.push("Sleep data not shared");
  }

  if (input.fatigue !== null) {
    factors.push({
      name: "Self-reported fatigue",
      kind: "Wellness",
      value: `${input.fatigue}/10`,
      maxPoints: rules.fatigue.highPoints,
      points:
        input.fatigue >= rules.fatigue.high
          ? rules.fatigue.highPoints
          : input.fatigue >= rules.fatigue.moderate
          ? rules.fatigue.moderatePoints
          : 0,
      rationale: `Voluntarily shared. High (≥${rules.fatigue.high}/10) = ${rules.fatigue.highPoints}pts; Moderate (≥${rules.fatigue.moderate}/10) = ${rules.fatigue.moderatePoints}pts.`,
    });
  } else {
    missing.push("Fatigue data not shared");
  }

  if (input.perceivedWorkload !== null) {
    factors.push({
      name: "Perceived workload",
      kind: "Wellness",
      value: `${input.perceivedWorkload}/10`,
      maxPoints: rules.workloadPerception.highPoints,
      points:
        input.perceivedWorkload >= rules.workloadPerception.high
          ? rules.workloadPerception.highPoints
          : input.perceivedWorkload >= rules.workloadPerception.moderate
          ? rules.workloadPerception.moderatePoints
          : 0,
      rationale: `Voluntarily shared. High (≥${rules.workloadPerception.high}/10) = ${rules.workloadPerception.highPoints}pts; Moderate (≥${rules.workloadPerception.moderate}/10) = ${rules.workloadPerception.moderatePoints}pts.`,
    });
  } else {
    missing.push("Perceived workload not shared");
  }

  const rawScore = factors.reduce((s, f) => s + f.points, 0);
  const maxPossibleScore = factors.reduce((s, f) => s + f.maxPoints, 0);

  const priority: Priority =
    rawScore >= rules.priorityThresholds.elevated
      ? "elevated"
      : rawScore >= rules.priorityThresholds.watch
      ? "watch"
      : "routine";

  // Coverage: organizational data always present (7 factors).
  // Wellness data adds up to 3 optional factors. Total possible = 10.
  const wellnessFilled = [input.sleepHours, input.fatigue, input.perceivedWorkload].filter(
    (v) => v !== null
  ).length;
  const dataCoverage = (7 + wellnessFilled) / 10;

  const plainExplanation = buildExplanation(
    factors,
    missing,
    rawScore,
    maxPossibleScore,
    priority,
    input.hasActiveSupport
  );

  return {
    rawScore,
    maxPossibleScore,
    totalScore: rawScore, // alias for backward compat with DB column name
    priority,
    factors,
    missingDataFlags: missing,
    dataCoverage,
    plainExplanation,
  };
}

function buildExplanation(
  factors: Factor[],
  missing: string[],
  score: number,
  maxScore: number,
  priority: Priority,
  hasSupport: boolean
): string {
  const topFactors = factors
    .filter((f) => f.points > 0)
    .sort((a, b) => b.points - a.points)
    .slice(0, 3)
    .map((f) => f.name.toLowerCase());

  const factorText =
    topFactors.length > 0
      ? `Key contributing factors: ${topFactors.join(", ")}.`
      : "No individual factor crossed a threshold in the current period.";

  const coverageNote =
    missing.length > 0
      ? ` Some wellness information was not shared (${missing.join("; ")}), which reduces available evidence but adds no negative points.`
      : "";

  const priorityText =
    priority === "elevated"
      ? "The combination of factors suggests this person may benefit from a welfare conversation."
      : priority === "watch"
      ? "Some factors are above baseline. A welfare officer may want to monitor this case."
      : "No individual factor is significantly above baseline at this time.";

  const supportNote = hasSupport
    ? " This person has an active support request — a welfare officer should acknowledge it regardless of the indicator score."
    : "";

  // Score shown as "rawScore out of maxPossibleScore" — NOT "/100".
  return `Welfare indicator: ${score} out of ${maxScore} (${priority}). ${factorText}${coverageNote} ${priorityText}${supportNote} This indicator is a prioritization aid, not a clinical assessment or diagnosis.`;
}

/** Aggregate unit stats — never exposes individual scores to commanders */
export function aggregateUnit(
  members: Array<{ score: number; weeklyHours: number; nightShifts: number; deploymentDays: number }>
) {
  const n = members.length;
  if (n === 0) return null;
  return {
    count: n,
    elevated: members.filter((m) => m.score >= DEFAULT_RULES_V1.priorityThresholds.elevated).length,
    watch: members.filter(
      (m) =>
        m.score >= DEFAULT_RULES_V1.priorityThresholds.watch &&
        m.score < DEFAULT_RULES_V1.priorityThresholds.elevated
    ).length,
    routine: members.filter((m) => m.score < DEFAULT_RULES_V1.priorityThresholds.watch).length,
    avgWeeklyHours: Math.round(members.reduce((s, m) => s + m.weeklyHours, 0) / n),
    avgNightShifts: Math.round(members.reduce((s, m) => s + m.nightShifts, 0) / n),
    avgDeploymentDays: Math.round(members.reduce((s, m) => s + m.deploymentDays, 0) / n),
  };
}

export { DEFAULT_RULES_V1 as RULES_V1 };
