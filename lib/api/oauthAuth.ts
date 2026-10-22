import "server-only";
import { eq } from "drizzle-orm";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { getWorkOS } from "@workos-inc/authkit-nextjs";
import { db, schema } from "@/lib/db/client";
import { isAllowedEmail } from "@/lib/auth/allowlist";
import { provisionUserAndOrg } from "@/lib/auth/provision";
import type { MachineContext } from "@/lib/api/machineAuth";

/*
 * Per-user OAuth for the MCP endpoint (`/api/mcp`).
 *
 * WorkOS AuthKit is the authorization server: an MCP client (Claude Code,
 * claude.ai, Claude Desktop…) discovers it from our protected-resource metadata,
 * sends the person through the same AuthKit sign-in as the web app, and calls
 * us with the access token it gets back. We are only the resource server —
 * verify the JWT, then resolve its `sub` to a tenant exactly as a browser
 * session would. So anyone who can sign in to the PM tool reaches the projects
 * of their own workspace over MCP, and nobody else's.
 *
 *   WORKOS_AUTHKIT_DOMAIN  https://<your-subdomain>.authkit.app (issuer)
 *   MCP_RESOURCE_URL       optional; the audience. Defaults to <origin>/api/mcp,
 *                          and must match a Resource Indicator in WorkOS.
 *   MCP_TRUSTED_AUDIENCES  optional; other resource indicators whose tokens are
 *                          accepted too, comma-separated. Set to the AI Hub's
 *                          (https://hub.teqneo.co/api/mcp) so a person signed in
 *                          to the hub reaches their projects THROUGH the hub, as
 *                          themselves: the hub forwards their own token instead
 *                          of its machine token, and the audit trail reads
 *                          "<name> (via MCP)" rather than "AI Hub". Every entry
 *                          is a system trusted to act for a signed-in person,
 *                          so keep the list to the hub.
 *
 * Fails closed: unset domain, bad signature, wrong issuer/audience, expired,
 * unknown or non-allowlisted user ⇒ null ⇒ 401.
 */

export function authkitIssuer(): string | null {
  const raw = process.env.WORKOS_AUTHKIT_DOMAIN?.trim();
  if (!raw) return null;
  return (/^https?:\/\//.test(raw) ? raw : `https://${raw}`).replace(/\/+$/, "");
}

/** The canonical MCP URL — the token's audience and the metadata's `resource`. */
export function mcpResourceUrl(request: Request): string {
  const configured = process.env.MCP_RESOURCE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  return `${new URL(request.url).origin}/api/mcp`;
}

export function protectedResourceMetadataUrl(request: Request): string {
  return `${new URL(mcpResourceUrl(request)).origin}/.well-known/oauth-protected-resource`;
}

/**
 * The audiences a token may carry: ours, plus the systems trusted to forward a
 * person's token (MCP_TRUSTED_AUDIENCES). A token for anything else is refused
 * exactly as before — this widens nothing about WHO is accepted, only which
 * door the same person may have come through.
 */
export function acceptedAudiences(request: Request): string[] {
  const trusted = (process.env.MCP_TRUSTED_AUDIENCES ?? "")
    .split(",")
    .map((s) => s.trim().replace(/\/+$/, ""))
    .filter(Boolean);
  return [mcpResourceUrl(request), ...trusted];
}

// One JWKS fetcher per issuer for the life of the instance; jose caches the
// keys and refetches on an unknown `kid`, which is what makes key rotation work.
const jwksByIssuer = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function jwksFor(issuer: string) {
  let jwks = jwksByIssuer.get(issuer);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${issuer}/oauth2/jwks`));
    jwksByIssuer.set(issuer, jwks);
  }
  return jwks;
}

/** Cheap shape check so machine tokens never trigger a JWKS fetch. */
export function looksLikeJwt(token: string): boolean {
  return token.split(".").length === 3;
}

async function contextForUser(
  payload: JWTPayload & { org_id?: string },
): Promise<MachineContext | null> {
  const workosUserId = payload.sub;
  if (!workosUserId) return null;

  let [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.workosUserId, workosUserId));

  // Someone who signs in through the MCP before ever opening the web app gets
  // provisioned the same way their first browser visit would have done it.
  if (!user) {
    const wUser = await getWorkOS().userManagement.getUser(workosUserId);
    if (!isAllowedEmail(wUser.email)) return null;
    await provisionUserAndOrg(wUser, payload.org_id);
    [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.workosUserId, workosUserId));
    if (!user) return null;
  }

  // Same lockdown as the browser path (`getAuthContext`).
  if (!isAllowedEmail(user.email)) return null;

  return {
    orgId: user.orgId,
    // Recorded as the actor on every write, so an agent edit made on someone's
    // behalf reads as theirs while staying recognisably an MCP edit.
    label: `${user.name || user.email} (via MCP)`,
    // A signed-in person can already read and edit their projects in the UI;
    // the MCP grants exactly that, no more.
    scopes: ["read", "write"],
  };
}

/**
 * Resolve an AuthKit access token to a tenant context, or null.
 * Never throws — an invalid token is indistinguishable from an absent one.
 */
export async function authenticateOAuthUser(
  token: string,
  request: Request,
): Promise<MachineContext | null> {
  const issuer = authkitIssuer();
  if (!issuer || !looksLikeJwt(token)) return null;

  try {
    const { payload } = await jwtVerify(token, jwksFor(issuer), {
      issuer,
      audience: acceptedAudiences(request),
    });
    return await contextForUser(payload);
  } catch (err) {
    console.warn("[mcp] rejected OAuth access token:", (err as Error).message);
    return null;
  }
}
