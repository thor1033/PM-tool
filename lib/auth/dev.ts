/**
 * Dev-only login bypass. Lets you into the seeded demo workspace without a
 * WorkOS account while developing locally. HARD-GUARDED: only active when NOT
 * in production AND `DEV_AUTH=true`. Never enable in a deployed environment.
 */
export const DEV_COOKIE = "atlas_dev_session";

export function devAuthEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.DEV_AUTH === "true";
}

// Matches the org/user created by `npm run db:seed`.
export const DEV_ORG = { workosOrgId: "org_demo_seed", name: "Demo Consultancy" };
export const DEV_USER = {
  workosUserId: "user_demo_seed",
  email: "demo@atlas.local",
  name: "Demo User",
};
