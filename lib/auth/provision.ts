import "server-only";
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
      set: { email: user.email, name: displayName(user), orgId: org.id },
    })
    .returning();

  return { orgId: org.id, orgName: org.name, userId: dbUser.id };
}
