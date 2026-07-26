import { sql } from "drizzle-orm";
import { db } from "./client";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Run `fn` inside a transaction with the tenant GUC set, so Postgres RLS
 * policies (`org_id = current_setting('app.current_org')`) scope every query
 * to the given organization. This is defense-in-depth: application queries
 * also filter by org_id explicitly.
 */
export async function withTenant<T>(
  orgId: string,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    // `true` => transaction-local (SET LOCAL semantics), reset at commit.
    await tx.execute(sql`select set_config('app.current_org', ${orgId}, true)`);
    return fn(tx);
  });
}
