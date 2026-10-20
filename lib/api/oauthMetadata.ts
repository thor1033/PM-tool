import "server-only";
import { authkitIssuer, mcpResourceUrl } from "@/lib/api/oauthAuth";

/*
 * Discovery documents for MCP OAuth (RFC 9728 protected-resource metadata).
 * An MCP client that gets a 401 from /api/mcp reads this to learn that WorkOS
 * AuthKit issues our tokens, then runs the sign-in against AuthKit directly.
 */

const CORS = { "Access-Control-Allow-Origin": "*" };

function notConfigured() {
  return Response.json(
    { error: "OAuth is not configured for this MCP endpoint (WORKOS_AUTHKIT_DOMAIN unset)." },
    { status: 404, headers: CORS },
  );
}

export function protectedResourceMetadata(request: Request): Response {
  const issuer = authkitIssuer();
  if (!issuer) return notConfigured();
  return Response.json(
    {
      resource: mcpResourceUrl(request),
      authorization_servers: [issuer],
      bearer_methods_supported: ["header"],
      resource_name: "Atlas PM",
    },
    { headers: { ...CORS, "Cache-Control": "public, max-age=3600" } },
  );
}

/**
 * Older MCP clients (spec 2025-03-26) skip resource metadata and look for the
 * authorization server's metadata on our own origin. Relay AuthKit's.
 */
export async function authorizationServerMetadata(): Promise<Response> {
  const issuer = authkitIssuer();
  if (!issuer) return notConfigured();
  const upstream = await fetch(`${issuer}/.well-known/oauth-authorization-server`);
  if (!upstream.ok) {
    return Response.json({ error: "Authorization server unavailable" }, { status: 502, headers: CORS });
  }
  return Response.json(await upstream.json(), {
    headers: { ...CORS, "Cache-Control": "public, max-age=3600" },
  });
}
