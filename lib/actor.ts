/* Resolving the logged-in user to the person they are on this project.
 *
 * The audit trail records who made a change. The signed-in account and the
 * project's stakeholder list are two different things — an account has an
 * email and whatever name the identity provider holds, a stakeholder is
 * someone the project decided matters. Email is the link between them, so
 * "Thor" signing in is recorded as "Thor Bøje Simonsen" if that stakeholder
 * carries his address.
 *
 * When nothing matches, the account's own name is used rather than nothing —
 * an unattributed change is worse than a loosely attributed one. */

export interface ActorCandidate {
  /** Stakeholder id, when the account resolved to one. */
  stakeholderId: string | null;
  /** Display name for the trail. */
  name: string;
  /** True when this came from a stakeholder rather than the raw account. */
  matched: boolean;
}

export interface StakeholderLike {
  id: string;
  name: string;
  /** Stakeholders keep their address in `contact`. */
  contact?: string | null;
}

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

/**
 * Picks the stakeholder that represents a signed-in account.
 *
 * Email is authoritative — it is the one field both sides own and neither
 * side retypes. A name match is accepted only when it is unambiguous, since
 * two people can share a first name but not an address.
 */
export function resolveActor(
  account: { name?: string | null; email?: string | null },
  stakeholders: StakeholderLike[],
): ActorCandidate {
  const email = norm(account.email);
  const accountName = (account.name ?? "").trim();

  if (email) {
    const byEmail = stakeholders.filter((s) => norm(s.contact) === email);
    if (byEmail.length === 1) {
      return { stakeholderId: byEmail[0].id, name: byEmail[0].name.trim(), matched: true };
    }
  }

  if (accountName) {
    const name = norm(accountName);
    const exact = stakeholders.filter((s) => norm(s.name) === name);
    if (exact.length === 1) {
      return { stakeholderId: exact[0].id, name: exact[0].name.trim(), matched: true };
    }
    // "Thor" against "Thor Bøje Simonsen": accepted only when one stakeholder
    // starts with that name, so a shared first name never picks the wrong one.
    const prefix = stakeholders.filter((s) => norm(s.name).startsWith(`${name} `));
    if (prefix.length === 1) {
      return { stakeholderId: prefix[0].id, name: prefix[0].name.trim(), matched: true };
    }
  }

  return { stakeholderId: null, name: accountName || "Unknown", matched: false };
}
