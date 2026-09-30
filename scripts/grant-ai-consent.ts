/**
 * One-time script to grant ai_processing consent to all existing personnel
 * who already have wellness_checkins consent but are missing ai_processing.
 *
 * Run: npx tsx scripts/grant-ai-consent.ts
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

import { initDb } from "../db/index.js";
import * as schema from "../db/schema.js";
import { eq, and } from "drizzle-orm";

async function main() {
  console.log("🔑 Granting ai_processing consent to existing users...");
  const db = await initDb();

  // Get all personnel users
  const personnel = await db
    .select({ id: schema.users.id, name: schema.users.name, email: schema.users.email })
    .from(schema.users)
    .where(eq(schema.users.role, "personnel"));

  console.log(`Found ${personnel.length} personnel accounts`);

  let granted = 0;
  let skipped = 0;

  for (const user of personnel) {
    // Check if ai_processing consent already exists
    const existing = await db
      .select()
      .from(schema.consentRecords)
      .where(
        and(
          eq(schema.consentRecords.userId, user.id),
          eq(schema.consentRecords.scope, "ai_processing")
        )
      )
      .limit(1);

    if (existing.length > 0) {
      // Update to granted if not already
      if (!existing[0].granted) {
        await db
          .update(schema.consentRecords)
          .set({ granted: true, grantedAt: new Date() })
          .where(
            and(
              eq(schema.consentRecords.userId, user.id),
              eq(schema.consentRecords.scope, "ai_processing")
            )
          );
        console.log(`  ✅ Updated ai_processing consent for ${user.name}`);
        granted++;
      } else {
        skipped++;
      }
    } else {
      // Insert new consent record
      await db.insert(schema.consentRecords).values({
        userId: user.id,
        scope: "ai_processing",
        granted: true,
        policyVersion: "1.0",
        grantedAt: new Date(),
      });
      console.log(`  ✅ Granted ai_processing consent for ${user.name}`);
      granted++;
    }
  }

  console.log(`\n✅ Done. Granted: ${granted}, Already had it: ${skipped}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});
