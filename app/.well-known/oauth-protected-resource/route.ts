import { protectedResourceMetadata } from "@/lib/api/oauthMetadata";

export const dynamic = "force-dynamic";

export function GET(request: Request): Response {
  return protectedResourceMetadata(request);
}
