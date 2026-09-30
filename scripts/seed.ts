/**
 * SAHAYAK — Database Seed Script
 * ALL DATA IS FICTIONAL. Do not use real personnel information.
 *
 * Demo credentials (local demonstration only):
 *   Admin:           admin@sahayak.local              / Admin@1234
 *   Welfare Officer: welfare.officer@sahayak.local    / Demo@1234
 *   Commander:       commander@sahayak.local          / Demo@1234
 *   Personnel:       ravi.kumar@sahayak.local         / Demo@1234
 *   (+ 35 more synthetic personnel accounts with the same password)
 */
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

// Load .env.local before any db import
const envPath = resolve(process.cwd(), ".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const m = line.match(/^([^#=\s][^=]*)=(.*)$/);
    if (m) process.env[m[1].trim()] ??= m[2].trim();
  }
}

import * as schema from "../db/schema.js";
import { hashPassword } from "../lib/auth/password.js";
import { calculateAssessment, RULES_V1, type RuleInput } from "../lib/domain.js";
import { eq } from "drizzle-orm";
import { initDb } from "../db/index.js";

const NAMES = [
  "Ravi Kumar", "Arjun Singh", "Meera Nair", "Aman Verma", "Sana Ali",
  "Vikram Rao", "Dev Patel", "Neha Das", "Karan Gill", "Isha Roy",
  "Rohit Sen", "Anjali Menon", "Kabir Shah", "Pooja Yadav", "Aditya Jain",
  "Farah Khan", "Manav Sethi", "Riya Bose", "Nikhil Paul", "Tara Joshi",
  "Varun Suri", "Asha Pillai", "Rajat Malik", "Diya Sinha", "Sameer Bhat",
  "Anu Thomas", "Yash Gupta", "Naina Kapoor", "Vivek Kumar", "Sara George",
  "Amit Rao", "Priya Singh", "Akash Das", "Leena Roy", "Rahul Jain", "Reema Ali",
];

async function main() {
  console.log("🌱 Seeding SAHAYAK database...");
  const db = await initDb();

  // Check if already seeded
  const existing = await db.select({ email: schema.users.email }).from(schema.users).limit(1);
  if (existing.length > 0) {
    console.log("✅ Database already seeded. Skipping.");
    return;
  }

  // ── Units ──────────────────────────────────────────────────────────────────
  console.log("Creating units...");
  const [alphaUnit] = await db.insert(schema.units).values({ name: "Alpha", code: "ALPHA", description: "Alpha battalion" }).returning();
  const [bravoUnit] = await db.insert(schema.units).values({ name: "Bravo", code: "BRAVO", description: "Bravo battalion" }).returning();
  const [charlieUnit] = await db.insert(schema.units).values({ name: "Charlie", code: "CHARLIE", description: "Charlie battalion" }).returning();
  const unitIds = [alphaUnit.id, bravoUnit.id, charlieUnit.id];

  // ── Staff accounts ─────────────────────────────────────────────────────────
  console.log("Creating staff accounts...");
  const adminHash = await hashPassword("Admin@1234");
  await db.insert(schema.users).values({
    name: "System Administrator", email: "admin@sahayak.local",
    passwordHash: adminHash, role: "admin", isActive: true,
  });

  const staffHash = await hashPassword("Demo@1234");
  const [welfareUser] = await db.insert(schema.users).values({
    name: "Welfare Officer Demo", email: "welfare.officer@sahayak.local",
    passwordHash: staffHash, role: "welfare_officer", unitId: alphaUnit.id, isActive: true,
  }).returning();

  await db.insert(schema.users).values({
    name: "Commander Demo", email: "commander@sahayak.local",
    passwordHash: staffHash, role: "commander", unitId: alphaUnit.id, isActive: true,
  });

  // ── Rule version ───────────────────────────────────────────────────────────
  console.log("Creating rule version...");
  const [ruleVersion] = await db.insert(schema.ruleVersions).values({
    version: "1.0.0",
    description: "Initial rule set (v1). Thresholds are illustrative and unvalidated.",
    rulesJson: RULES_V1 as any,
    isActive: true,
    activatedAt: new Date(),
  }).returning();

  // ── Personnel accounts ─────────────────────────────────────────────────────
  console.log("Creating 36 synthetic personnel accounts...");
  const personnelHash = await hashPassword("Demo@1234");

  for (let i = 0; i < NAMES.length; i++) {
    const name = NAMES[i];
    const unitId = unitIds[Math.floor(i / 12)];
    const personnelId = `S-${1042 + i}`;
    const weeklyHours = i === 0 ? 68 : 40 + (i * 7 % 35);
    const nightShifts = i === 0 ? 9 : 2 + (i * 3 % 10);
    const deploymentDays = 14 + (i * 11 % 55);
    const daysSinceLeave = 35 + (i * 13 % 100);
    const sleepHours = i === 0 ? 4.5 : 5 + (i % 4);
    const fatigue = i === 0 ? 8 : 3 + (i % 7);
    const emailParts = name.toLowerCase().split(" ");
    const email = `${emailParts[0]}.${emailParts[1]}@sahayak.local`;

    const [newUser] = await db.insert(schema.users).values({
      name, email, passwordHash: personnelHash,
      role: "personnel", unitId, personnelId, isActive: true,
    }).returning();

    await db.insert(schema.personnelProfiles).values({
      userId: newUser.id, serviceNumber: personnelId,
      rank: ["Constable", "Head Constable", "ASI", "SI", "Inspector"][i % 5],
      designation: "Field Personnel",
      homeState: ["Delhi", "UP", "Maharashtra", "Punjab", "Rajasthan"][i % 5],
    });

    const consentGranted = i === 0 || (i % 3 !== 0);
    await db.insert(schema.consentRecords).values({
      userId: newUser.id, scope: "wellness_checkins",
      granted: consentGranted, policyVersion: "1.0",
      grantedAt: consentGranted ? new Date() : null,
    });

    const periodStart = new Date();
    periodStart.setDate(periodStart.getDate() - 30);
    await db.insert(schema.dutyRecords).values({
      userId: newUser.id,
      periodStart: periodStart.toISOString().slice(0, 10),
      periodEnd: new Date().toISOString().slice(0, 10),
      weeklyHours, nightShifts, consecutiveDays: 5 + (i % 8), restDays: 2,
      sourceTag: `duty::${personnelId}::${periodStart.toISOString().slice(0, 10)}`,
    });

    const deployStart = new Date();
    deployStart.setDate(deployStart.getDate() - deploymentDays);
    await db.insert(schema.deploymentRecords).values({
      userId: newUser.id,
      startDate: deployStart.toISOString().slice(0, 10),
      location: ["Border post", "Field operation", "Base camp"][i % 3],
      isCurrentlyDeployed: deploymentDays < 45,
      durationDays: deploymentDays,
      sourceTag: `deployment::${personnelId}::${deployStart.toISOString().slice(0, 10)}`,
    });

    if (daysSinceLeave <= 90) {
      const leaveEnd = new Date();
      leaveEnd.setDate(leaveEnd.getDate() - daysSinceLeave);
      const leaveStart = new Date(leaveEnd);
      leaveStart.setDate(leaveStart.getDate() - 7);
      await db.insert(schema.leaveRecords).values({
        userId: newUser.id, leaveType: "annual",
        startDate: leaveStart.toISOString().slice(0, 10),
        endDate: leaveEnd.toISOString().slice(0, 10),
        durationDays: 7, approved: true,
        sourceTag: `leave::${personnelId}::${leaveStart.toISOString().slice(0, 10)}`,
      });
    }

    if (consentGranted) {
      const input: RuleInput = {
        weeklyHours, nightShifts, consecutiveDays: 5 + (i % 8),
        deploymentDays, daysSinceLeave, transfersLast6Months: 0,
        trainingDaysLast30: 3 + (i % 7), sleepHours, fatigue,
        mood: 3, perceivedWorkload: 5 + (i % 5), hasActiveSupport: false,
      };
      const result = calculateAssessment(input, RULES_V1);

      const [assessment] = await db.insert(schema.assessments).values({
        userId: newUser.id, ruleVersionId: ruleVersion.id,
        totalScore: result.rawScore,
        maxPossibleScore: result.maxPossibleScore,
        priority: result.priority,
        dataCoverage: result.dataCoverage,
        missingDataFlags: result.missingDataFlags,
        plainExplanation: result.plainExplanation,
        aiExplanationSource: "template", triggeredBy: "seed", inputWindowDays: 30,
        isLatest: true,
      }).returning();

      await db.insert(schema.assessmentFactors).values(
        result.factors.map((f) => ({
          assessmentId: assessment.id, name: f.name, kind: f.kind,
          value: f.value, points: f.points, maxPoints: f.maxPoints,
          rationale: f.rationale,
        }))
      );

      // Check-ins for last 5 days
      for (let d = 4; d >= 0; d--) {
        const date = new Date();
        date.setDate(date.getDate() - d);
        const checkInDate = date.toISOString().slice(0, 10);
        await db.insert(schema.checkIns).values({
          userId: newUser.id, checkInDate,
          mood: Math.max(1, Math.min(5, 3 + (d % 3) - 1)),
          sleepHours: sleepHours + (d % 2) * 0.5,
          sleepQuality: 3,
          fatigue: Math.max(1, Math.min(10, fatigue - (d % 3))),
          perceivedWorkload: 5 + (i % 5),
          requestedSupport: false,
        }).onConflictDoNothing();
      }
    }

    // Open welfare cases for some personnel
    if (i % 7 === 0 && i !== 0) {
      await db.insert(schema.welfareCases).values({
        personnelId: newUser.id, assignedOfficerId: welfareUser.id,
        status: "follow_up", priority: "watch",
        nextFollowUpDate: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
        lastActivityAt: new Date(),
      });
    }
  }

  // ── Ravi Kumar: active support request + elevated case ─────────────────────
  const [raviUser] = await db.select()
    .from(schema.users).where(eq(schema.users.personnelId, "S-1042")).limit(1);

  if (raviUser) {
    await db.insert(schema.supportRequests).values({
      userId: raviUser.id, urgency: "standard", preferredContact: "in_person",
    });
    await db.insert(schema.welfareCases).values({
      personnelId: raviUser.id, assignedOfficerId: welfareUser.id,
      status: "new", priority: "elevated", lastActivityAt: new Date(),
    });
  }

  console.log("✅ Seed complete!");
  console.log("\nDemo credentials (local demonstration only):");
  console.log("  admin@sahayak.local              / Admin@1234");
  console.log("  welfare.officer@sahayak.local    / Demo@1234");
  console.log("  commander@sahayak.local          / Demo@1234");
  console.log("  ravi.kumar@sahayak.local         / Demo@1234");
  console.log("\nAll data is fictional. Do not enter real personnel information.");
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
