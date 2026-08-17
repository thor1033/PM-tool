import type { WorkingSet } from "@/lib/types";
import { ACCENTS } from "@/lib/colors";

/* Who the people on a project are.
 *
 * There used to be two lists: `stakeholders`, which the Stakeholders page
 * writes, and `members`, which nothing could create because no page ever
 * existed for it. Assignment and filtering read the empty one, so nobody
 * could ever be filtered for. Stakeholders is now the single source, matching
 * how track owners and the org chart already work.
 *
 * `members` is still read where it holds data a stakeholder has no field for
 * (capacity hours), so older projects keep working. */

export interface Person {
  id: string;
  name: string;
  /** Job title, when one is recorded. */
  title: string;
  role: string;
  email: string;
  /** Avatar colour. Stakeholders carry no colour of their own, so it is
   *  derived from the id — stable for a given person, and spread across the
   *  palette rather than everyone sharing one shade. */
  color: string;
}

/** Everyone who can be assigned work, in a stable display order. */
export function peopleOf(ws: Pick<WorkingSet, "stakeholders">): Person[] {
  return [...ws.stakeholders]
    .filter((s) => s.name.trim())
    .map((s) => ({
      id: s.id,
      name: s.name.trim(),
      title: s.title ?? "",
      role: s.role ?? "",
      email: s.contact ?? "",
      color: ACCENTS[
        [...s.id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7) % ACCENTS.length
      ],
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Just the names, for the free-text assignee fields tasks still use. */
export function peopleNames(ws: Pick<WorkingSet, "stakeholders">): string[] {
  return peopleOf(ws).map((p) => p.name);
}

/** Assignee names on tasks that match nobody in the people list.
 *
 *  Assignees are stored as plain strings, so a task can name someone who was
 *  typed by hand, later renamed, or removed. Surfacing them is what stops
 *  that work quietly disappearing from every per-person filter. */
export function unknownAssignees(
  ws: Pick<WorkingSet, "stakeholders" | "tasks">,
): string[] {
  const known = new Set(peopleNames(ws).map((n) => n.toLowerCase()));
  const seen = new Set<string>();
  for (const t of ws.tasks) {
    for (const raw of t.assignees ?? []) {
      const name = raw.trim();
      if (name && !known.has(name.toLowerCase())) seen.add(name);
    }
  }
  return [...seen].sort((a, b) => a.localeCompare(b));
}
