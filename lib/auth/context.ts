import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { db, schema } from "@/lib/db/client";
import { provisionUserAndOrg } from "./provision";
import { devAuthEnabled, DEV_COOKIE, DEV_ORG, DEV_USER } from "./dev";
import { isAllowedEmail } from "./allowlist";

export interface AuthContext {
  orgId: string;
  orgName: string;
  userId: string;
  workosUserId: string;
  email: string;
  name: string;
  role?: string;
}

// Small per-instance cache so we don't re-provision (2 writes) on every server
// request. Keyed by WorkOS user id; short TTL keeps org/name changes fresh.
const CACHE_TTL_MS = 5 * 60_000;
const cache = new Map<string, { ctx: AuthContext; expires: number }>();

/**
 * Resolve the current tenant context, provisioning the org/user on first sight.
 * Returns null when there is no authenticated session (use in route handlers to
 * return 401).
 */
async function getDevContext(): Promise<AuthContext> {
  let [org] = await db
    .select()
    .from(schema.organizations)
    .where(eq(schema.organizations.workosOrgId, DEV_ORG.workosOrgId));
  if (!org) {
    [org] = await db
      .insert(schema.organizations)
      .values(DEV_ORG)
      .onConflictDoUpdate({
        target: schema.organizations.workosOrgId,
        set: { name: DEV_ORG.name },
      })
      .returning();
  }
  let [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.workosUserId, DEV_USER.workosUserId));
  if (!user) {
    [user] = await db
      .insert(schema.users)
      .values({ ...DEV_USER, orgId: org.id })
      .onConflictDoUpdate({
        target: schema.users.workosUserId,
        set: { orgId: org.id },
      })
      .returning();
  }
  return {
    orgId: org.id,
    orgName: org.name,
    userId: user.id,
    workosUserId: DEV_USER.workosUserId,
    email: DEV_USER.email,
    name: DEV_USER.name,
    role: "admin",
  };
}

export async function getAuthContext(): Promise<AuthContext | null> {
  // Dev-only bypass fully replaces WorkOS when enabled.
  if (devAuthEnabled()) {
    const jar = await cookies();
    return jar.get(DEV_COOKIE) ? getDevContext() : null;
  }

  const { user, organizationId, role } = await withAuth();
  if (!user) return null;

  // Single-user lockdown: a valid WorkOS/Google session is not enough — the
  // email must be on the allowlist. Disallowed users are treated as having no
  // context (null); `requireAuthContext` routes them to /access-denied instead
  // of looping them back through sign-in.
  if (!isAllowedEmail(user.email)) return null;

  const cached = cache.get(user.id);
  if (cached && cached.expires > Date.now()) {
    // Keep role fresh from the live session even when other fields are cached.
    return { ...cached.ctx, role };
  }

  const prov = await provisionUserAndOrg(user, organizationId);
  const ctx: AuthContext = {
    orgId: prov.orgId,
    orgName: prov.orgName,
    userId: prov.userId,
    workosUserId: user.id,
    email: user.email,
    name: user.name ?? user.email,
    role,
  };
  cache.set(user.id, { ctx, expires: Date.now() + CACHE_TTL_MS });
  return ctx;
}

/**
 * Server-component / server-action guard: returns the context or redirects to
 * the WorkOS sign-in page.
 */
export async function requireAuthContext(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (ctx) return ctx;

  if (devAuthEnabled()) redirect("/dev-login");

  // No context can mean two things. If there's a live WorkOS session but the
  // email isn't allowlisted, sending them to /sign-in would loop (their Google
  // session re-auths straight back). Send those users to /access-denied — a
  // public terminal page — instead. Genuinely signed-out users go to /sign-in.
  const { user } = await withAuth();
  redirect(user ? "/access-denied" : "/sign-in");
}
