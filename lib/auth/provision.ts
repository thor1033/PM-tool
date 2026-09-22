import "server-only";
import { eq } from "drizzle-orm";
import { getWorkOS } from "@workos-inc/authkit-nextjs";
import { db, schema } from "@/lib/db/client";

export interface WorkosUserLite {
  id: string;
  email: string;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}

export interface ProvisionResult {
  orgId: string;
  orgName: string;
  userId: string;
}

function displayName(u: WorkosUserLite): string {
  if (u.name) return u.name;
  const full = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  return full || u.email;
}

/**
 * Ensure an organization + user row exists for the authenticated WorkOS
 * identity, and return our internal ids. Idempotent (upserts). When the
 * WorkOS session carries an `organizationId` (SSO / WorkOS Organizations) we
 * map it to a tenant; otherwise we provision a personal workspace keyed to the
 * user id so single-user AuthKit accounts still get an isolated tenant.
 */
export async function provisionUserAndOrg(
  user: WorkosUserLite,
  organizationId?: string,
): Promise<ProvisionResult> {
  const workosOrgId = organizationId ?? `personal:${user.id}`;

  let orgName: string;
  if (organizationId) {
    try {
      const org = await getWorkOS().organizations.getOrganization(organizationId);
      orgName = org.name;
    } catch {
      orgName = "Organization";
    }
  } else {
    orgName = `${displayName(user)}'s workspace`;
  }

  const [org] = await db
    .insert(schema.organizations)
    .values({ workosOrgId, name: orgName })
    .onConflictDoUpdate({
      target: schema.organizations.workosOrgId,
      set: { name: orgName },
    })
    .returning();

  const [dbUser] = await db
    .insert(schema.users)
    .values({
      workosUserId: user.id,
      orgId: org.id,
      email: user.email,
      name: displayName(user),
    })
    .onConflictDoUpdate({
      target: schema.users.workosUserId,
      // Deliberately not resetting orgId. A returning user keeps whichever
      // tenant they are currently assigned to — an account moved into a shared
      // workspace must not be dragged back to its personal one on next login.
      // Only the insert above places a brand-new user in a tenant.
      set: { email: user.email, name: displayName(user) },
    })
    .returning();

  // The tenant is whatever the USER's row says — not the personal workspace
  // upserted above.
  //
  // `org` here is always `personal:<workos user id>`, because that is the key
  // we just upserted on. Returning it meant every browser session resolved to
  // the caller's personal workspace no matter which tenant they belong to: both
  // founders sat in "Teqneo" in the database and still saw an empty board,
  // while the MCP path (which resolves the org from its token instead) wrote
  // into Teqneo correctly. Writes landed in one tenant and reads came from
  // another, which reads exactly like data loss and is not.
  //
  // The upsert above still matters: it is what places a brand-new user in a
  // tenant of their own. It just does not get to decide where a returning user
  // already lives.
  if (dbUser.orgId === org.id) {
    return { orgId: org.id, orgName: org.name, userId: dbUser.id };
  }

  const [tenant] = await db
    .select({ id: schema.organizations.id, name: schema.organizations.name })
    .from(schema.organizations)
    .where(eq(schema.organizations.id, dbUser.orgId));

  // Fall back to the personal workspace rather than throwing: a user pointed at
  // a deleted org should still get a usable (if empty) session.
  if (!tenant) return { orgId: org.id, orgName: org.name, userId: dbUser.id };

  return { orgId: tenant.id, orgName: tenant.name, userId: dbUser.id };
}
