import "./env";
import { migrate } from "drizzle-orm/neon-serverless/migrator";
import { db, pool } from "@/lib/db/client";

async function main() {
  console.log("Applying migrations from ./drizzle ...");
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("✓ Migrations applied.");
  await pool.end();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
