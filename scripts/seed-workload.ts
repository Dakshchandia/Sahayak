/**
 * SAHAYAK — Workload Module Seed Script
 * ALL DATA IS FICTIONAL. Do not use real personnel information.
 *
 * Demonstration scenarios:
 *   A. Extra hours: Ravi Kumar scheduled 8h, recorded 11h actual
 *   B. Overloaded assignment: conflicts with existing duty
 *   C. Recovery conflict: insufficient recovery between shifts
 *   D. Staffing shortage: planner returns infeasibility
 *   E. Personnel concern: workload review request lifecycle
 *   F. Privacy: commander cannot see wellness data
 *
 * Run after seed.ts: npx tsx scripts/seed-workload.ts
 */
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const envPath = resolve(process.cwd(), ".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const m = line.match(/^([^#=\s][^=]*)=(.*)$/);
    if (m) process.env[m[1].trim()] ??= m[2].trim();
  }
}

import * as schema from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import { initDb } from "../db/index.js";

async function main() {
  console.log("🌱 Seeding SAHAYAK workload demonstration data...");
  const db = await initDb();

  // Check if already seeded
  const existing = await db.select({ id: schema.unitWorkloadPolicies.id })
    .from(schema.unitWorkloadPolicies).limit(1);
  if (existing.length > 0) {
    console.log("✅ Workload data already seeded. Skipping.");
    return;
  }

  // ── Fetch Ravi Kumar and Alpha unit ──────────────────────────────────────
  const [raviUser] = await db.select()
    .from(schema.users).where(eq(schema.users.personnelId, "S-1042")).limit(1);
  const [arjunUser] = await db.select()
    .from(schema.users).where(eq(schema.users.personnelId, "S-1043")).limit(1);
  const [commanderUser] = await db.select()
    .from(schema.users).where(eq(schema.users.email, "commander@sahayak.local")).limit(1);
  const [adminUser] = await db.select()
    .from(schema.users).where(eq(schema.users.email, "admin@sahayak.local")).limit(1);
  const [alphaUnit] = await db.select()
    .from(schema.units).where(eq(schema.units.code, "ALPHA")).limit(1);

  if (!raviUser || !alphaUnit || !adminUser || !commanderUser) {
    console.error("Required base seed data missing. Run seed.ts first.");
    process.exit(1);
  }

  // ── Unit policy (Alpha unit — demonstration configuration) ───────────────
  console.log("Creating demonstration unit policy...");
  const [policy] = await db.insert(schema.unitWorkloadPolicies).values({
    unitId: alphaUnit.id,
    label: "Alpha Unit Demo Policy",
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
    demoConfigNote: "DEMONSTRATION CONFIGURATION ONLY — not a legal standard. Created by seed script.",
    createdBy: adminUser.id,
    isActive: true,
    effectiveFrom: new Date("2026-01-01"),
  }).returning();

  // ── Skills ───────────────────────────────────────────────────────────────
  console.log("Creating demonstration skills...");
  const [patrolSkill] = await db.insert(schema.skills).values({
    name: "Patrol Operations",
    category: "tactical",
    description: "Standard patrol and field operations",
  }).returning();
  const [firstAidSkill] = await db.insert(schema.skills).values({
    name: "First Aid Certification",
    category: "medical",
    description: "Basic first aid and emergency response",
  }).returning();
  const [techSkill] = await db.insert(schema.skills).values({
    name: "Communications Equipment",
    category: "technical",
    description: "Operation of unit communications equipment",
  }).returning();

  // Assign skills to Ravi and Arjun
  if (raviUser) {
    await db.insert(schema.personnelSkills).values([
      { userId: raviUser.id, skillId: patrolSkill.id, certifiedAt: new Date("2025-03-01") },
      { userId: raviUser.id, skillId: firstAidSkill.id, certifiedAt: new Date("2025-06-15") },
    ]).onConflictDoNothing();
  }
  if (arjunUser) {
    await db.insert(schema.personnelSkills).values([
      { userId: arjunUser.id, skillId: patrolSkill.id, certifiedAt: new Date("2025-04-01") },
      { userId: arjunUser.id, skillId: techSkill.id, certifiedAt: new Date("2025-09-01") },
    ]).onConflictDoNothing();
  }

  // ── Grant commander duty-manager access to Alpha unit ────────────────────
  console.log("Granting commander duty manager access to Alpha unit...");
  await db.insert(schema.dutyManagerAccess).values({
    userId: commanderUser.id,
    unitId: alphaUnit.id,
    canViewIndividualDuty: true,
    canEditRoster: false,
    canApproveAssignments: true,
    canApplyScenarios: false,
    grantedBy: adminUser.id,
    isActive: true,
  }).onConflictDoNothing();

  // Grant admin full access
  await db.insert(schema.dutyManagerAccess).values({
    userId: adminUser.id,
    unitId: alphaUnit.id,
    canViewIndividualDuty: true,
    canEditRoster: true,
    canApproveAssignments: true,
    canApplyScenarios: true,
    grantedBy: adminUser.id,
    isActive: true,
  }).onConflictDoNothing();

  // ── Duty ledger entries ───────────────────────────────────────────────────
  console.log("Creating duty ledger entries...");

  const today = new Date();
  const d = (daysAgo: number, hours: number, mins: number) => {
    const dt = new Date(today);
    dt.setDate(dt.getDate() - daysAgo);
    dt.setHours(hours, mins, 0, 0);
    return dt;
  };

  // ── SCENARIO A: Extra hours ──────────────────────────────────────────────
  // Ravi Kumar: scheduled 08:00–16:00 (8h), actually worked 08:00–19:00 (11h)
  // Extra 3h appear as pending verification after report
  console.log("Scenario A: Extra hours...");
  const [scenarioADuty] = await db.insert(schema.dutyLedger).values({
    userId: raviUser.id,
    unitId: alphaUnit.id,
    dutyType: "patrol",
    scheduledStart: d(3, 8, 0),
    scheduledEnd: d(3, 16, 0),
    scheduledBreakMinutes: 30,
    actualStart: d(3, 8, 0),
    actualEnd: d(3, 19, 0),     // 11h actual — 3h additional
    actualBreakMinutes: 30,
    actualSource: "self_reported",
    verificationStatus: "pending",
    isAdditionalDuty: false,
    status: "completed",
    scheduledDurationMinutes: 480,
    actualDurationMinutes: 660,
    additionalMinutes: 150,     // 2.5h net additional after breaks
    nightDurationMinutes: 0,
    notes: "Scenario A: Extended patrol due to incident response. Self-reported actual times.",
    sourceTag: `demo::scenario-a::${raviUser.id}`,
  }).returning();

  // Correction request filed by Ravi for the extra hours
  await db.insert(schema.dutyCorrections).values({
    dutyLedgerId: scenarioADuty.id,
    reportedBy: raviUser.id,
    unitId: alphaUnit.id,
    reportedActualStart: d(3, 8, 0),
    reportedActualEnd: d(3, 19, 0),
    reportedBreakMinutes: 30,
    isUnrecordedDuty: false,
    explanation: "Scenario A (demo): Patrol extended by 3 hours due to incident response at checkpoint. Requesting verification of actual 11-hour duty.",
    status: "submitted",
  });

  // Also add some regular completed duties
  for (let i = 5; i <= 14; i++) {
    if (i === 3) continue; // already added above
    await db.insert(schema.dutyLedger).values({
      userId: raviUser.id,
      unitId: alphaUnit.id,
      dutyType: i % 3 === 0 ? "guard" : "patrol",
      scheduledStart: d(i, 8, 0),
      scheduledEnd: d(i, 16, 0),
      scheduledBreakMinutes: 30,
      actualStart: d(i, 8, 0),
      actualEnd: d(i, 16, 15),
      actualBreakMinutes: 30,
      actualSource: "supervisor",
      verificationStatus: "verified",
      isAdditionalDuty: false,
      status: "completed",
      scheduledDurationMinutes: 480,
      actualDurationMinutes: 495,
      additionalMinutes: 15,
      nightDurationMinutes: 0,
      sourceTag: `demo::regular::${raviUser.id}::${i}`,
    }).onConflictDoNothing();
  }

  // ── SCENARIO B: Overloaded assignment ────────────────────────────────────
  // Assignment that conflicts with existing duty — capacity check will flag it
  console.log("Scenario B: Assignment conflict...");
  const conflictDuty = await db.insert(schema.dutyLedger).values({
    userId: raviUser.id,
    unitId: alphaUnit.id,
    dutyType: "patrol",
    scheduledStart: d(1, 6, 0),
    scheduledEnd: d(1, 14, 0),
    scheduledBreakMinutes: 30,
    actualStart: null,
    actualEnd: null,
    verificationStatus: "pending",
    isAdditionalDuty: false,
    status: "scheduled",
    scheduledDurationMinutes: 480,
    nightDurationMinutes: 120,     // 06:00–06:00 night window covers first 2h
    notes: "Scenario B: Existing duty that will conflict with proposed assignment.",
    sourceTag: `demo::scenario-b-duty::${raviUser.id}`,
  }).returning();

  // The assignment that conflicts — stored as blocked (capacity check result recorded)
  await db.insert(schema.assignments).values({
    title: "Checkpoint reinforcement — Scenario B (demo)",
    description: "Demonstration scenario: This assignment overlaps an existing duty for Ravi Kumar. The capacity check blocked it.",
    unitId: alphaUnit.id,
    assigneeId: raviUser.id,
    requiredSkillId: patrolSkill.id,
    estimatedEffortHours: 6,
    plannedStart: d(1, 8, 0),   // Overlaps the 06:00–14:00 duty above
    plannedEnd: d(1, 14, 0),
    deadline: d(1, 15, 0),
    priority: "high",
    effortType: "additional",
    assignmentReason: "Scenario B demo: Proposed assignment to show conflict detection.",
    status: "rejected",
    createdBy: commanderUser.id,
    capacityCheckResult: {
      canProceed: false,
      hasWarnings: false,
      findings: [{
        severity: "blocking",
        code: "DUTY_OVERLAP",
        message: "Proposed assignment window overlaps 1 existing duty record.",
        canOverride: false,
        detail: "Overlaps with duty ID " + conflictDuty[0].id,
      }],
      summary: "1 blocking conflict(s) prevent this assignment from being confirmed. [Alpha Unit Demo Policy — demonstration configuration]",
      checkedAt: new Date().toISOString(),
      policyLabel: "Alpha Unit Demo Policy",
      assumptions: ["Capacity is estimated from duty ledger records within the proposed window."],
    },
    updatedAt: new Date(),
  });

  // ── SCENARIO C: Recovery conflict ────────────────────────────────────────
  // Night duty ending at 06:00, next duty starting at 10:00 — only 4h gap (below 8h block)
  console.log("Scenario C: Recovery conflict...");
  if (arjunUser) {
    await db.insert(schema.dutyLedger).values([
      {
        userId: arjunUser.id,
        unitId: alphaUnit.id,
        dutyType: "guard",
        scheduledStart: d(2, 22, 0),  // 22:00 last night
        scheduledEnd: d(1, 6, 0),     // 06:00 this morning (overnight)
        scheduledBreakMinutes: 0,
        verificationStatus: "verified",
        isAdditionalDuty: false,
        status: "completed",
        scheduledDurationMinutes: 480,
        nightDurationMinutes: 480,    // entirely within night window
        actualStart: d(2, 22, 0),
        actualEnd: d(1, 6, 0),
        actualBreakMinutes: 0,
        actualSource: "supervisor",
        actualDurationMinutes: 480,
        additionalMinutes: 0,
        notes: "Scenario C: Night guard duty ending 06:00.",
        sourceTag: `demo::scenario-c-night::${arjunUser.id}`,
      },
      {
        userId: arjunUser.id,
        unitId: alphaUnit.id,
        dutyType: "patrol",
        scheduledStart: d(1, 10, 0), // 10:00 same day — only 4h recovery (below 8h block)
        scheduledEnd: d(1, 18, 0),
        scheduledBreakMinutes: 30,
        verificationStatus: "pending",
        isAdditionalDuty: false,
        status: "scheduled",
        scheduledDurationMinutes: 480,
        nightDurationMinutes: 0,
        recoveryIntervalMinutes: 240, // 4 hours — below minimum block
        hasOverlapFlag: false,
        notes: "Scenario C: Next duty starts only 4h after night shift ended. Below policy minimum.",
        sourceTag: `demo::scenario-c-day::${arjunUser.id}`,
      },
    ]).onConflictDoNothing();
  }

  // ── SCENARIO D: Staffing shortage ────────────────────────────────────────
  // Planner scenario stored showing infeasibility
  console.log("Scenario D: Staffing shortage scenario...");
  await db.insert(schema.rebalancingScenarios).values({
    unitId: alphaUnit.id,
    title: "Scenario D — Staffing shortage (demo)",
    description: "Demonstration scenario: Shows honest infeasibility when required coverage cannot be met with available personnel.",
    periodStart: new Date(today.getFullYear(), today.getMonth() + 1, 1),
    periodEnd: new Date(today.getFullYear(), today.getMonth() + 1, 7),
    status: "draft",
    createdBy: commanderUser.id,
    feasibilityResult: {
      feasible: false,
      infeasibilityReason: "Required coverage: 84 duty slots over 7 days (12 per day). Available capacity (within policy limits): 56 slots. Shortfall: 28 slots. Consider requesting additional staffing or adjusting the required coverage level.",
      uncoveredDutyCount: 28,
      proposals: [{
        type: "insufficient_staffing",
        description: "Additional 4 personnel needed to meet the required coverage of 12 per day.",
        affectedUserIds: [],
        estimatedImpact: "Shortfall cannot be resolved without additional staffing or reduced coverage requirements.",
      }],
      policyWarnings: ["Staffing shortfall of 28.0 duty slots."],
      operationalSummary: "Insufficient staffing to meet required coverage under current policy constraints.",
      disclaimer: "SCENARIO ESTIMATES ONLY. Based on current duty records and stated assumptions. Does not predict mental-health outcomes. Wellness indicators excluded. No real schedules changed until explicitly applied after approval.",
      assumptions: [
        "Period: next week.",
        "Required staffing: 12 persons per duty day.",
        "Availability is based on scheduled duty records and approved leave.",
        "Wellness, mood, fatigue and psychological data excluded from all calculations.",
        "Unit policy: Alpha Unit Demo Policy (demonstration configuration).",
      ],
    },
    proposedChanges: [{
      type: "insufficient_staffing",
      description: "Additional 4 personnel needed to meet the required coverage of 12 per day.",
      affectedUserIds: [],
      estimatedImpact: "Shortfall cannot be resolved without additional staffing or reduced coverage requirements.",
    }],
    disclaimer: "SCENARIO ESTIMATES ONLY. Demonstration data.",
  });

  // ── SCENARIO E: Personnel concern — workload review lifecycle ─────────────
  console.log("Scenario E: Workload review lifecycle...");
  const [reviewE] = await db.insert(schema.workloadReviewRequests).values({
    requestedBy: raviUser.id,
    unitId: alphaUnit.id,
    reason: "hours_exceed_roster",
    explanation: "Scenario E (demo): I have been working 3+ hours beyond my scheduled 8-hour shifts for the past two weeks due to recurring incident responses. I would like the additional hours reviewed and rest time arranged.",
    preferredAdjustment: "A day off in lieu or reduced duties next week.",
    visibilityAcknowledged: true,
    visibilityNote: "This request is visible to your operational manager and unit administrator. It is NOT routed to the confidential welfare officer unless you separately request welfare support.",
    status: "adjustment_proposed",
    acknowledgedBy: commanderUser.id,
    acknowledgedAt: new Date(Date.now() - 2 * 86400000),
    reviewedBy: commanderUser.id,
    proposedAdjustment: "Confirmed additional hours. Scheduling one compensatory rest day on the upcoming off-week. Night shift rotation adjusted for next month.",
    proposedAt: new Date(Date.now() - 86400000),
  }).returning();

  // ── SCENARIO F: Privacy — operational APIs never return wellness data ─────
  // This is enforced at the API layer; the seed creates an audit event documenting
  // that the commander accessed the distribution view
  console.log("Scenario F: Privacy audit record...");
  await db.insert(schema.auditEvents).values({
    actorId: commanderUser.id,
    actorRole: "commander",
    event: "export_generated",
    subjectType: "workload_distribution",
    subjectId: alphaUnit.id.toString(),
    metadata: {
      scenario: "F",
      description: "Commander accessed workload distribution. Wellness data was excluded. Only duty records returned.",
      privacyGuarantee: "Individual check-ins, counselling notes and psychological scores excluded.",
    },
    occurredAt: new Date(),
  });

  // ── Future scheduled duties (for display in duty ledger) ─────────────────
  console.log("Creating upcoming scheduled duties...");
  for (let i = 1; i <= 5; i++) {
    await db.insert(schema.dutyLedger).values({
      userId: raviUser.id,
      unitId: alphaUnit.id,
      dutyType: i % 2 === 0 ? "guard" : "patrol",
      scheduledStart: d(-i, 8, 0),   // future (negative = future)
      scheduledEnd: d(-i, 16, 0),
      scheduledBreakMinutes: 30,
      verificationStatus: "pending",
      isAdditionalDuty: false,
      status: "scheduled",
      scheduledDurationMinutes: 480,
      nightDurationMinutes: 0,
      notes: `Upcoming scheduled duty ${i}`,
      sourceTag: `demo::upcoming::${raviUser.id}::${i}`,
    }).onConflictDoNothing();
  }

  console.log("✅ Workload seed complete!");
  console.log("\nDemonstration scenarios:");
  console.log("  A. Extra hours: Ravi Kumar has a pending correction for 3 extra hours");
  console.log("  B. Assignment conflict: Blocked assignment stored with capacity check result");
  console.log("  C. Recovery conflict: Arjun Singh has consecutive duties with 4h gap (below 8h block)");
  console.log("  D. Staffing shortage: Rebalancing scenario shows honest infeasibility");
  console.log("  E. Personnel concern: Workload review request in 'adjustment_proposed' status");
  console.log("  F. Privacy: Audit record confirms commander saw duty data only (no wellness)");
  console.log("\nAll data is fictional. DEMO POLICY is not a legal standard.");
}

main().catch((err) => {
  console.error("Workload seed failed:", err);
  process.exit(1);
});
