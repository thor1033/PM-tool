import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { authenticateMachine, type MachineContext } from "@/lib/api/machineAuth";
import {
  authenticateOAuthUser,
  authkitIssuer,
  protectedResourceMetadataUrl,
} from "@/lib/api/oauthAuth";
import { buildMcpServer } from "@/lib/mcp/server";

/*
 * The MCP endpoint the AI Hub connects to.
 *
 * Streamable HTTP, stateless: a fresh server + transport per request, no
 * session id. Not a style choice — on Vercel there is no process to hold a
 * session between invocations, and the hub's client calls this without session
 * resumption, so every request re-authenticates.
 *
 * Auth is always a bearer token, never the WorkOS cookie, and comes in two kinds:
 *  - a machine token (PM_TOOL_MCP_TOKENS) for callers with no user, e.g. the
 *    AI Hub — see lib/api/machineAuth.ts;
 *  - a per-user AuthKit OAuth access token, which any MCP client obtains by
 *    sending the person through the normal PM sign-in — see lib/api/oauthAuth.ts.
 * proxy.ts already exempts /api/* from the sign-in redirect, so the 401 below
 * is what an unauthenticated caller gets, and it points the client at our
 * protected-resource metadata so it can start that sign-in.
 */

// `ws` (the Neon driver's WebSocket) needs Node — this must never run on edge.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unauthorized(request: Request) {
  // Tells a spec-compliant MCP client this endpoint wants a bearer token and,
  // when OAuth is configured, where to discover how to get one.
  const challenge = authkitIssuer()
    ? `Bearer realm="atlas-pm", error="unauthorized", resource_metadata="${protectedResourceMetadataUrl(request)}"`
    : 'Bearer realm="atlas-pm"';
  return Response.json(
    { error: "Unauthorized" },
    { status: 401, headers: { "WWW-Authenticate": challenge } },
  );
}

async function authenticate(request: Request): Promise<MachineContext | null> {
  const machine = await authenticateMachine(request.headers);
  if (machine) return machine;
  const match = (request.headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i);
  return match ? authenticateOAuthUser(match[1].trim(), request) : null;
}

export async function POST(request: Request): Promise<Response> {
  const ctx = await authenticate(request);
  if (!ctx) return unauthorized(request);

  const transport = new WebStandardStreamableHTTPServerTransport({
    // Stateless: no session id in any response.
    sessionIdGenerator: undefined,
    // Plain JSON replies instead of an SSE stream — these tools return one
    // result each, and a stream would keep a serverless invocation open.
    enableJsonResponse: true,
  });

  const server = buildMcpServer(ctx);
  await server.connect(transport);

  try {
    return await transport.handleRequest(request);
  } finally {
    // Nothing survives the request: the server is bound to this token's tenant.
    await server.close().catch(() => {});
  }
}

// GET opens a server-initiated SSE stream and DELETE ends a session; a stateless
// server offers neither. Answering explicitly beats Next's generic 405 because
// the body says why.
export async function GET(): Promise<Response> {
  return Response.json(
    { error: "This MCP endpoint is stateless: use POST for JSON-RPC requests." },
    { status: 405, headers: { Allow: "POST" } },
  );
}

export const DELETE = GET;
