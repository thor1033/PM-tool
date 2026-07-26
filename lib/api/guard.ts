import "server-only";
import { NextResponse } from "next/server";
import { getAuthContext, type AuthContext } from "@/lib/auth/context";

/**
 * Resolve the tenant context for a route handler, or return a 401 Response.
 * Usage:
 *   const ctx = await requireApiAuth();
 *   if (ctx instanceof NextResponse) return ctx;
 */
export async function requireApiAuth(): Promise<AuthContext | NextResponse> {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return ctx;
}
