import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import * as schema from "./schema";

// The WebSocket-based Pool driver is required (over the plain HTTP `neon()`
// driver) because we run each tenant-scoped request inside a transaction that
// issues `SET LOCAL app.current_org = ...` for Row-Level Security. In Node.js
// (migrations / seed / route handlers) Neon needs the `ws` package — the global
// undici WebSocket does not work with Neon's proxy.
neonConfig.webSocketConstructor = ws;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  // Do not throw at import time — this module is imported in contexts (build,
  // type-gen) where the env may be absent. It throws lazily on first query.
  console.warn("[db] DATABASE_URL is not set; database queries will fail.");
}

declare global {
  var __pmhubPool: Pool | undefined;
}

const pool =
  globalThis.__pmhubPool ??
  new Pool({ connectionString: connectionString ?? "postgres://invalid" });

if (process.env.NODE_ENV !== "production") globalThis.__pmhubPool = pool;

export const db = drizzle(pool, { schema });
export { pool, schema };
