/**
 * Tests for the explainable rule engine (lib/domain.ts)
 * These run without a database connection.
 */
import { describe, it, expect } from "vitest";
import { calculateAssessment, RULES_V1, type RuleInput } from "../lib/domain";

const BASE_INPUT: RuleInput = {
  weeklyHours: 40,
  nightShifts: 2,
  consecutiveDays: 4,
  deploymentDays: 10,
  daysSinceLeave: 30,
  transfersLast6Months: 0,
  trainingDays: 5,
  sleepHours: null,
  fatigue: null,
  mood: null,
  perceivedWorkload: null,
  hasActiveSupport: false,
};

describe("calculateAssessment — score correctness", () => {
  it("returns zero score for minimal workload", () => {
    const result = calculateAssessment(BASE_INPUT);
    expect(result.rawScore).toBe(0);
    expect(result.priority).toBe("routine");
  });

  it("returns elevated priority for high workload", () => {
    const result = calculateAssessment({
      ...BASE_INPUT,
      weeklyHours: 68,    // +20 pts
      nightShifts: 9,     // +20 pts
      deploymentDays: 50, // +15 pts
      daysSinceLeave: 95, // +15 pts
    });
    expect(result.rawScore).toBeGreaterThanOrEqual(RULES_V1.priorityThresholds.elevated);
    expect(result.priority).toBe("elevated");
  });

  it("returns watch priority at moderate threshold", () => {
    const result = calculateAssessment({
      ...BASE_INPUT,
      weeklyHours: 50,    // +10 pts
      nightShifts: 6,     // +10 pts
      daysSinceLeave: 65, // +7 pts
    });
    expect(result.rawScore).toBeGreaterThanOrEqual(RULES_V1.priorityThresholds.watch);
    expect(result.rawScore).toBeLessThan(RULES_V1.priorityThresholds.elevated);
    expect(result.priority).toBe("watch");
  });
});

describe("calculateAssessment — wellness data handling", () => {
  it("adds zero points for null wellness values (no penalty for missing data)", () => {
    const withNull = calculateAssessment(BASE_INPUT);
    const withWellness = calculateAssessment({
      ...BASE_INPUT,
      sleepHours: 7,   // good sleep — no points
      fatigue: 3,      // low fatigue — no points
      perceivedWorkload: 4, // low workload — no points
    });
    expect(withNull.totalScore).toBe(withWellness.totalScore);
  });

  it("adds wellness points when data is present and above threshold", () => {
    const withNull = calculateAssessment(BASE_INPUT);
    const withHighFatigue = calculateAssessment({
      ...BASE_INPUT,
      sleepHours: 3.5, // very low sleep — +15 pts
      fatigue: 9,      // high fatigue — +15 pts
    });
    expect(withHighFatigue.totalScore).toBe(withNull.totalScore + 15 + 15);
  });

  it("flags missing wellness data in missingDataFlags", () => {
    const result = calculateAssessment(BASE_INPUT);
    expect(result.missingDataFlags).toContain("Sleep data not shared");
    expect(result.missingDataFlags).toContain("Fatigue data not shared");
  });

  it("does not flag missing data when values are provided", () => {
    const result = calculateAssessment({
      ...BASE_INPUT,
      sleepHours: 7,
      fatigue: 4,
      perceivedWorkload: 5,
    });
    expect(result.missingDataFlags).toHaveLength(0);
  });
});

describe("calculateAssessment — data coverage", () => {
  it("returns 0.7 coverage when no wellness data (7/10 factors)", () => {
    const result = calculateAssessment(BASE_INPUT);
    expect(result.dataCoverage).toBeCloseTo(0.7);
  });

  it("returns 1.0 coverage when all wellness data present", () => {
    const result = calculateAssessment({
      ...BASE_INPUT,
      sleepHours: 7,
      fatigue: 4,
      perceivedWorkload: 5,
    });
    expect(result.dataCoverage).toBeCloseTo(1.0);
  });
});

describe("calculateAssessment — factor breakdown", () => {
  it("returns exactly the expected factors", () => {
    const result = calculateAssessment(BASE_INPUT);
    const factorNames = result.factors.map((f) => f.name);
    expect(factorNames).toContain("Weekly duty hours");
    expect(factorNames).toContain("Night duties this month");
    expect(factorNames).toContain("Deployment duration");
    expect(factorNames).toContain("Days since last leave");
  });

  it("assigns correct kind to each factor", () => {
    const result = calculateAssessment(BASE_INPUT);
    const kinds = new Set(result.factors.map((f) => f.kind));
    expect(kinds).toContain("Workload");
    expect(kinds).toContain("Recovery");
    expect(kinds).toContain("Deployment");
    expect(kinds).toContain("Leave");
  });

  it("does not include Wellness factors when values are null", () => {
    const result = calculateAssessment(BASE_INPUT);
    const wellnessFactor = result.factors.find((f) => f.kind === "Wellness");
    expect(wellnessFactor).toBeUndefined();
  });

  it("includes Wellness factors when values are provided", () => {
    const result = calculateAssessment({
      ...BASE_INPUT,
      sleepHours: 5,
      fatigue: 7,
    });
    const wellnessFactors = result.factors.filter((f) => f.kind === "Wellness");
    expect(wellnessFactors.length).toBeGreaterThan(0);
  });
});

describe("calculateAssessment — plain explanation", () => {
  it("generates a non-empty plain explanation", () => {
    const result = calculateAssessment(BASE_INPUT);
    expect(result.plainExplanation.length).toBeGreaterThan(50);
  });

  it("includes the score in the explanation", () => {
    const result = calculateAssessment(BASE_INPUT);
    expect(result.plainExplanation).toContain(result.rawScore.toString());
  });

  it("flags support request in explanation", () => {
    const result = calculateAssessment({ ...BASE_INPUT, hasActiveSupport: true });
    expect(result.plainExplanation.toLowerCase()).toContain("support request");
  });

  it("does not claim clinical diagnosis", () => {
    const result = calculateAssessment(BASE_INPUT);
    expect(result.plainExplanation.toLowerCase()).not.toContain("diagnosed");
    expect(result.plainExplanation.toLowerCase()).not.toContain("disorder");
    expect(result.plainExplanation.toLowerCase()).not.toContain("depression");
  });
});

describe("calculateAssessment — boundary conditions", () => {
  it("handles zero for all numeric inputs", () => {
    const result = calculateAssessment({
      ...BASE_INPUT,
      weeklyHours: 0, nightShifts: 0, consecutiveDays: 0,
      deploymentDays: 0, daysSinceLeave: 0, transfersLast6Months: 0, trainingDays: 0,
    });
    expect(result.rawScore).toBe(0);
    expect(result.priority).toBe("routine");
  });

  it("handles maximum values without throwing", () => {
    const result = calculateAssessment({
      weeklyHours: 168, nightShifts: 31, consecutiveDays: 30,
      deploymentDays: 365, daysSinceLeave: 730,
      transfersLast6Months: 10, trainingDays: 30,
      sleepHours: 0, fatigue: 10, mood: 1, perceivedWorkload: 10,
      hasActiveSupport: true,
    });
    expect(result.rawScore).toBeGreaterThan(0);
    expect(result.priority).toBe("elevated");
  });
});
