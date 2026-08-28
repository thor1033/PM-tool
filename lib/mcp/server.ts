import "server-only";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { toolsFor } from "@/lib/mcp/tools";
import type { MachineContext } from "@/lib/api/machineAuth";

export const MCP_SERVER_NAME = "atlas-pm";
export const MCP_SERVER_VERSION = "0.1.0";

/**
 * Build an MCP server bound to one machine caller.
 *
 * A fresh server per request, deliberately: the tenant and scopes come from the
 * request's token, so a server instance must never outlive the request that
 * authenticated it. That also happens to be what a serverless deployment
 * requires — there is no process to hold state between invocations.
 */
export function buildMcpServer(ctx: MachineContext): McpServer {
  const server = new McpServer(
    { name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION },
    {
      instructions:
        "Project delivery data for a consultancy's client engagements. " +
        "Call pm_list_projects first to find a project id, then pm_project_status " +
        "for a summary or pm_get_project for detail. Ids are opaque strings — " +
        "never guess one.",
    },
  );

  for (const tool of toolsFor(ctx)) {
    server.registerTool(
      tool.name,
      { description: tool.description, inputSchema: tool.inputSchema },
      // The SDK validates args against inputSchema before this runs.
      async (args: Record<string, unknown>) => {
        try {
          return await tool.handler(args ?? {}, ctx);
        } catch (err) {
          // A thrown handler would surface as a transport-level failure and
          // abort the agent's turn; a tool error it can read lets it recover.
          const message = err instanceof Error ? err.message : String(err);
          console.error(`[mcp] tool ${tool.name} failed:`, err);
          return {
            content: [{ type: "text" as const, text: `Error: ${message}` }],
            isError: true,
          };
        }
      },
    );
  }

  return server;
}
