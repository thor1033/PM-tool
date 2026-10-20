import { protectedResourceMetadata } from "@/lib/api/oauthMetadata";

// The path-suffixed form (RFC 9728 §3.1) that MCP clients try first for
// a resource at /api/mcp.
export const dynamic = "force-dynamic";

export function GET(request: Request): Response {
  return protectedResourceMetadata(request);
}
