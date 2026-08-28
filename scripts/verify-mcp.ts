/* eslint-disable @typescript-eslint/no-explicit-any --
   A verification harness reads whatever JSON the tools return; typing those
   payloads would mean duplicating every tool's response shape here, which
   would then need updating in two places whenever a tool changes. */
import "./env";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { eq } from "drizzle-orm";
import { db, pool, schema } from "@/lib/db/client";

/*
 * End-to-end verification of /api/mcp — the endpoint the AI Hub connects to.
 *
 * Drives the running dev server through the *same* MCP client and transport the
 * hub uses, so a pass here means the hub's path works, not that a hand-rolled
 * HTTP call works.
 *
 *   npm run dev                 # in one terminal (port 3000)
 *   npm run verify:mcp          # in another
 *
 * Writes are exercised against a throwaway project in the seeded demo org,
 * created and deleted by this script. It never touches a real workspace.
 */

const BASE = process.env.MCP_VERIFY_URL ?? "http://127.0.0.1:3000";
const URL_MCP = `${BASE}/api/mcp`;
const DEMO_ORG = "org_demo_seed";

const checks: { label: string; ok: boolean }[] = [];
function check(label: string, ok: boolean, detail = "") {
  checks.push({ label, ok });
  console.log(`${ok ? "ok  " : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
}

/** Exact match: asking for ["read"] must not hand back a read+write token. */
function tokenFor(scopes: string[]): string | null {
  const raw = process.env.PM_TOOL_MCP_TOKENS;
  if (!raw) return null;
  const parsed = JSON.parse(raw) as Record<string, { org?: string; scopes?: string[] }>;
  const want = [...scopes].sort().join(",");
  for (const [token, entry] of Object.entries(parsed)) {
    const has = [...new Set(entry.scopes ?? ["read"])].sort().join(",");
    if (has === want) return token;
  }
  return null;
}

async function connect(token: string): Promise<Client> {
  const transport = new StreamableHTTPClientTransport(new URL(URL_MCP), {
    requestInit: { headers: { authorization: `Bearer ${token}` } },
  });
  const client = new Client({ name: "verify-mcp", version: "0.1.0" });
  await client.connect(transport);
  return client;
}

/** Tool results come back as content blocks; every tool here returns JSON text. */
function payload(result: unknown): any {
  const blocks = ((result as { content?: unknown })?.content ?? []) as {
    type: string;
    text?: string;
  }[];
  const text = blocks.find((b) => b.type === "text")?.text ?? "";
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function main() {
  const token = tokenFor(["read", "write"]);
  if (!token) {
    console.error(
      "No read+write token in PM_TOOL_MCP_TOKENS — add one to .env.local (see .env.example).",
    );
    process.exit(1);
  }

  // ── the endpoint must refuse anything without a valid token ───────────────
  const anon = await fetch(URL_MCP, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
  check("no token ⇒ 401", anon.status === 401, `got ${anon.status}`);
  check(
    "401 advertises bearer auth",
    (anon.headers.get("www-authenticate") ?? "").toLowerCase().includes("bearer"),
  );

  const badToken = await fetch(URL_MCP, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer not-a-real-token" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
  check("unknown token ⇒ 401", badToken.status === 401, `got ${badToken.status}`);

  // ── protocol handshake + tool discovery ───────────────────────────────────
  const client = await connect(token);
  const tools = (await client.listTools()).tools;
  const names = tools.map((t) => t.name).sort();
  check("initialize + tools/list over Streamable HTTP", names.length > 0, names.join(", "));
  check(
    "read tools present",
    ["pm_list_projects", "pm_get_project", "pm_list_tasks", "pm_list_risks", "pm_project_status"]
      .every((n) => names.includes(n)),
  );
  check(
    "tool schemas survive the transport",
    (tools.find((t) => t.name === "pm_list_tasks")?.inputSchema as any)?.properties?.projectId
      ?.type === "string",
  );

  // ── set up a throwaway project in the demo org ────────────────────────────
  const [org] = await db
    .select()
    .from(schema.organizations)
    .where(eq(schema.organizations.workosOrgId, DEMO_ORG));
  if (!org) {
    console.error(`No "${DEMO_ORG}" organization — run npm run db:seed first.`);
    process.exit(1);
  }
  // Inserted directly rather than through lib/db/queries.ts: that module is
  // marked "server-only", which throws outside the Next runtime. The endpoint
  // under test still goes through it — this is only fixture setup.
  const [temp] = await db
    .insert(schema.projects)
    .values({ orgId: org.id, name: "MCP verification (temporary)", code: "MCPV" })
    .returning();
  console.log(`\n  … using throwaway project ${temp.id} in the demo org\n`);

  try {
    // ── reads ───────────────────────────────────────────────────────────────
    const projects = payload(await client.callTool({ name: "pm_list_projects", arguments: {} }));
    check(
      "pm_list_projects returns the demo org's projects",
      Array.isArray(projects) && projects.some((p: any) => p.id === temp.id),
    );
    check(
      "tenant scoping holds — no other org's projects leak",
      Array.isArray(projects) && projects.every((p: any) => p.name !== "AI Consultancy"),
      `${projects.length} project(s) visible`,
    );

    const unknown = payload(
      await client.callTool({
        name: "pm_get_project",
        arguments: { projectId: "00000000-0000-0000-0000-000000000000" },
      }),
    );
    check(
      "unknown project id is a readable tool error, not a crash",
      typeof unknown === "string" && unknown.startsWith("Error:"),
      String(unknown).slice(0, 60),
    );

    // ── writes ──────────────────────────────────────────────────────────────
    const created = payload(
      await client.callTool({
        name: "pm_create_task",
        arguments: {
          projectId: temp.id,
          title: "Verify the MCP write path",
          status: "backlog",
          end: "2020-01-01",
        },
      }),
    );
    check("pm_create_task creates a task", typeof created?.id === "string", created?.id);

    const listed = payload(
      await client.callTool({ name: "pm_list_tasks", arguments: { projectId: temp.id } }),
    );
    check("the new task reads back", listed?.tasks?.[0]?.id === created?.id);
    check(
      "overdue is computed from the planned end date",
      listed?.tasks?.[0]?.overdue === true,
    );

    const updated = payload(
      await client.callTool({
        name: "pm_update_task",
        arguments: { projectId: temp.id, taskId: created.id, status: "done" },
      }),
    );
    check("pm_update_task moves the task", updated?.status === "done");
    check(
      "completing a task stamps completedOn, as the board does",
      typeof updated?.completedOn === "string" && updated.completedOn.length === 10,
      updated?.completedOn,
    );

    // ── the audit trail must show the agent's edits ──────────────────────────
    const status = payload(
      await client.callTool({ name: "pm_project_status", arguments: { projectId: temp.id } }),
    );
    const trail = status?.recentActivity ?? [];
    check(
      "writes are recorded in the audit trail",
      trail.length >= 2,
      `${trail.length} entries`,
    );
    check(
      "the trail attributes them to the hub, not a person",
      trail.every((e: any) => e.actor === "AI Hub"),
      trail.map((e: any) => e.actor).join(", "),
    );
    check(
      "completing a task is recorded as a completion",
      trail.some((e: any) => e.kind === "done"),
    );
    check(
      "pm_project_status counts progress",
      status?.progress?.done === 1 && status?.progress?.percentComplete === 100,
      JSON.stringify(status?.progress),
    );

    await client.close();

    // ── scope enforcement: a read-only token must not see write tools ────────
    const readOnly = tokenFor(["read"]);
    if (readOnly) {
      const roClient = await connect(readOnly);
      const roNames = (await roClient.listTools()).tools.map((t) => t.name);
      check(
        "a read-only token is offered no write tools",
        !roNames.some((n) => ["pm_create_task", "pm_update_task", "pm_add_note"].includes(n)),
        roNames.join(", "),
      );

      // Not just hidden — a hidden-but-callable write tool is not a scope.
      let refused = false;
      try {
        const attempt = payload(
          await roClient.callTool({
            name: "pm_create_task",
            arguments: { projectId: temp.id, title: "should never be created" },
          }),
        );
        refused = typeof attempt === "string" && /error|unknown|not found/i.test(attempt);
      } catch {
        refused = true; // the SDK rejects an unregistered tool outright
      }
      check("a read-only token cannot call a write tool anyway", refused);
      await roClient.close();
    } else {
      console.log("skip  read-only scope check — no read-only token configured");
    }
  } finally {
    await db.delete(schema.projects).where(eq(schema.projects.id, temp.id));
    console.log(`\n  … throwaway project ${temp.id} deleted\n`);
  }

  const failed = checks.filter((c) => !c.ok);
  console.log(
    failed.length === 0
      ? `MCP endpoint OK (${checks.length} checks)`
      : `MCP endpoint FAILED (${failed.length}/${checks.length})`,
  );
  await pool.end();
  process.exit(failed.length === 0 ? 0 : 1);
}

main();
