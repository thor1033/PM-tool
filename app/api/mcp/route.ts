import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { authenticateMachine } from "@/lib/api/machineAuth";
import { buildMcpServer } from "@/lib/mcp/server";

/*
 * The MCP endpoint the AI Hub connects to.
 *
 * Streamable HTTP, stateless: a fresh server + transport per request, no
 * session id. Not a style choice — on Vercel there is no process to hold a
 * session between invocations, and the hub's client calls this without session
 * resumption, so every request re-authenticates.
 *
 * Auth is a bearer token (PM_TOOL_MCP_TOKENS), never the WorkOS cookie: the
 * caller is a machine with no user. proxy.ts already exempts /api/* from the
 * sign-in redirect, so the 401 below is what an unauthenticated caller gets.
 */

// `ws` (the Neon driver's WebSocket) needs Node — this must never run on edge.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unauthorized() {
  return Response.json(
    { error: "Unauthorized" },
    {
      status: 401,
      // Tells a spec-compliant MCP client this endpoint wants a bearer token,
      // rather than leaving it to guess at a bare 401.
      headers: { "WWW-Authenticate": 'Bearer realm="atlas-pm"' },
    },
  );
}

export async function POST(request: Request): Promise<Response> {
  const ctx = await authenticateMachine(request.headers);
  if (!ctx) return unauthorized();

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
