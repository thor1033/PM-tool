import "./env";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import { db, pool, schema } from "@/lib/db/client";
import { importWorkspaceForOrg, type AtlasWorkspace } from "@/lib/import/atlas";

const DEMO_ORG_NAME = "Demo Consultancy";
const DEMO_WORKOS_ORG = "org_demo_seed";
const DEMO_USER_EMAIL = "demo@atlas.local";
const DEMO_WORKOS_USER = "user_demo_seed";

async function main() {
  const ws: AtlasWorkspace = JSON.parse(
    readFileSync(resolve("scripts/seed-projects.json"), "utf8"),
  );

  // Upsert a demo org + user (these tables are not under RLS).
  let [org] = await db
    .select()
    .from(schema.organizations)
    .where(eq(schema.organizations.workosOrgId, DEMO_WORKOS_ORG));
  if (!org) {
    [org] = await db
      .insert(schema.organizations)
      .values({ workosOrgId: DEMO_WORKOS_ORG, name: DEMO_ORG_NAME })
      .returning();
    console.log(`✓ Created org "${org.name}" (${org.id})`);
  } else {
    console.log(`• Org "${org.name}" already exists (${org.id})`);
  }

  const [existingUser] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.workosUserId, DEMO_WORKOS_USER));
  if (!existingUser) {
    await db.insert(schema.users).values({
      workosUserId: DEMO_WORKOS_USER,
      orgId: org.id,
      email: DEMO_USER_EMAIL,
      name: "Demo User",
    });
    console.log(`✓ Created demo user ${DEMO_USER_EMAIL}`);
  }

  // Skip if this org already has projects (idempotent-ish).
  const existing = await db
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(eq(schema.projects.orgId, org.id));
  if (existing.length) {
    console.log(
      `• Org already has ${existing.length} projects — skipping sample import.`,
    );
  } else {
    const { count } = await importWorkspaceForOrg(org.id, ws);
    console.log(`✓ Imported ${count} sample projects.`);
  }

  await pool.end();
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
