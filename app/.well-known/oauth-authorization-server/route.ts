import { authorizationServerMetadata } from "@/lib/api/oauthMetadata";

export const dynamic = "force-dynamic";

export function GET(): Promise<Response> {
  return authorizationServerMetadata();
}
