import type { WorkingSet } from "@/lib/types";

/* The plan's containment rules, enforced on the server.
 *
 *   track → milestone → task → subtask
 *
 * Every level names its parent. A milestone belongs to a track, a task to a
 * milestone, and a subtask inherits its parent task's milestone. Anything
 * that skips a level has no place in the plan: it appears in no track view,
 * rolls up into no milestone, and drifts until someone notices it by
 * accident.
 *
 * This lives behind the API rather than in each form because a form is only
 * one of the ways rows are written — the AI planner, the importer and the
 * raw endpoints all reach the same tables. A rule enforced in the UI is a
 * suggestion; enforced here it is the shape of the data. */

export interface HierarchyIssue {
  /** Message shown to whoever attempted the write. */
  error: string;
}

type Row = Record<string, unknown>;

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/**
 * Checks a milestone write.
 *
 * @param data   the incoming payload (partial on update)
 * @param isCreate whether this creates a row, so absent fields mean "unset"
 *                 rather than "unchanged"
 */
export function checkMilestone(data: Row, isCreate: boolean): HierarchyIssue | null {
  // On update a partial patch that never mentions the track leaves it as it
  // was, which is already valid — only an explicit blank is a violation.
  if (!isCreate && !("category" in data)) return null;
  if (!str(data.category)) {
    return { error: "A milestone must belong to a track." };
  }
  return null;
}

/**
 * Checks a task write against the milestone it claims.
 *
 * Subtasks are not exempt: they take their parent's milestone, so the rule is
 * the same one applied to an inherited value rather than a second rule.
 */
export function checkTask(
  data: Row,
  isCreate: boolean,
  ws: Pick<WorkingSet, "tasks" | "milestones">,
): HierarchyIssue | null {
  const parentId = str(data.parentId);

  // A subtask's milestone is its parent's, so the parent must exist and be
  // placed itself. Checking the parent rather than the payload stops a
  // subtask being used as a side door around the rule.
  if (parentId) {
    const parent = ws.tasks.find((t) => t.id === parentId);
    if (!parent) {
      return { error: "That parent task does not exist." };
    }
    if (!str(parent.milestoneId) && !str(data.milestoneId)) {
      return {
        error: "A subtask needs a milestone — its parent task has none yet.",
      };
    }
    // Nesting deeper than one level has no representation anywhere in the
    // app, so it is refused rather than stored and rendered inconsistently.
    if (str(parent.parentId)) {
      return { error: "Subtasks cannot be nested further." };
    }
  }

  if (!isCreate && !("milestoneId" in data)) return null;

  const milestoneId = str(data.milestoneId) || (parentId ? "inherited" : "");
  if (!milestoneId) {
    return { error: "A task must belong to a milestone." };
  }
  if (milestoneId === "inherited") return null;

  const ms = ws.milestones.find((m) => m.id === milestoneId);
  if (!ms) {
    return { error: "That milestone does not exist." };
  }
  // The milestone carries the track, so a task pointing at one in a different
  // track would sit in two places at once.
  const taskTrack = "category" in data ? str(data.category) : null;
  if (taskTrack && str(ms.category) && taskTrack !== str(ms.category)) {
    return {
      error: "That milestone belongs to a different track than the task.",
    };
  }
  return null;
}

/** The track a task inherits, given the milestone it sits under. Keeps the
 *  two in step without asking the caller to set both. */
export function trackForTask(
  data: Row,
  ws: Pick<WorkingSet, "tasks" | "milestones">,
): string | null {
  const parentId = str(data.parentId);
  if (parentId) {
    const parent = ws.tasks.find((t) => t.id === parentId);
    if (parent) return str(parent.category) || null;
  }
  const ms = ws.milestones.find((m) => m.id === str(data.milestoneId));
  return ms ? str(ms.category) || null : null;
}
