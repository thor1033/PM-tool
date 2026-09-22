import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";

/*
 * Machine authentication for non-browser callers — today, the AI Hub's MCP
 * endpoint (`/api/mcp`).
 *
 * The browser API authenticates with a WorkOS session cookie (`requireApiAuth`).
 * A machine caller has no cookie and no user, so it presents a bearer token that
 * maps to one organization and a set of scopes. Deliberately a separate path:
 * mixing machine tokens into `getAuthContext` would put a long-lived credential
 * on every human route.
 *
 * Configured by env, mirroring the hub's own HUB_API_TOKENS:
 *
 *   PM_TOOL_MCP_TOKENS={"<secret>":{"org":"org_demo_seed","label":"AI Hub","scopes":["read"]}}
 *
 * `org` is either the internal organizations.id (a UUID) or the WorkOS org id
 * — the latter is what you can actually read off a dashboard, so both resolve.
 * `scopes` gates writes: omit "write" and the endpoint is read-only, which is
 * the recommended posture until agent writes have been reviewed in practice.
 *
 * Fails closed at every step: no env, malformed JSON, unknown token, unknown
 * org ⇒ no context ⇒ 401.
 */

export type MachineScope = "read" | "write";

export interface MachineContext {
  orgId: string;
  /** Human-readable name for the caller, used as the audit-trail actor. */
  label: string;
  scopes: MachineScope[];
}

interface TokenEntry {
  org?: string;
  label?: string;
  scopes?: string[];
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Parsed per call rather than cached: the map is tiny, and a cached parse makes
// an env change look like the config was ignored.
function loadTokens(): Record<string, TokenEntry> {
  const raw = process.env.PM_TOOL_MCP_TOKENS;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, TokenEntry>;
    const out: Record<string, TokenEntry> = {};
    for (const [token, entry] of Object.entries(parsed)) {
      if (entry && typeof entry.org === "string" && token.length > 0) {
        out[token] = entry;
      }
    }
    return out;
  } catch {
    console.warn(
      "[mcp] PM_TOOL_MCP_TOKENS is not valid JSON — no machine tokens configured.",
    );
    return {};
  }
}

/** True when at least one machine token is configured (for status reporting). */
export function machineAuthConfigured(): boolean {
  return Object.keys(loadTokens()).length > 0;
}

// Org ids are stable, so a resolved lookup is worth caching for the life of the
// serverless instance — it saves a query on every single tool call.
const orgIdCache = new Map<string, string>();

async function resolveOrgId(org: string): Promise<string | null> {
  const cached = orgIdCache.get(org);
  if (cached) return cached;
  // Both forms are checked against the database. A UUID used to be trusted on
  // shape alone, which meant a mistyped one authenticated successfully and then
  // matched no rows — every tool returned an empty result with no error, which
  // reads as "the workspace is empty" rather than "this token is misconfigured".
  // An unknown org must fail closed as a 401, whichever form it was written in.
  const [row] = await db
    .select({ id: schema.organizations.id })
    .from(schema.organizations)
    .where(
      UUID_RE.test(org)
        ? eq(schema.organizations.id, org)
        : eq(schema.organizations.workosOrgId, org),
    );
  if (!row) return null;
  orgIdCache.set(org, row.id);
  return row.id;
}

function parseScopes(scopes: string[] | undefined): MachineScope[] {
  const valid = new Set(["read", "write"]);
  // No scopes declared ⇒ read-only. Writes are opt-in, never inherited.
  const list = (scopes ?? ["read"]).filter((s) => valid.has(s)) as MachineScope[];
  return list.length > 0 ? list : ["read"];
}

/**
 * Resolve a request's bearer token to a machine context, or null.
 * Never throws — an unresolvable token is indistinguishable from an absent one.
 */
export async function authenticateMachine(
  headers: Headers,
): Promise<MachineContext | null> {
  const match = (headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  const entry = loadTokens()[match[1].trim()];
  if (!entry?.org) return null;

  try {
    const orgId = await resolveOrgId(entry.org);
    if (!orgId) {
      console.warn(`[mcp] token maps to unknown org "${entry.org}" — denying.`);
      return null;
    }
    return {
      orgId,
      label: entry.label?.trim() || "AI Hub",
      scopes: parseScopes(entry.scopes),
    };
  } catch (err) {
    // A DB outage must not turn into an auth bypass.
    console.warn("[mcp] could not resolve org for token:", err);
    return null;
  }
}

export function hasScope(ctx: MachineContext, scope: MachineScope): boolean {
  return ctx.scopes.includes(scope);
}
