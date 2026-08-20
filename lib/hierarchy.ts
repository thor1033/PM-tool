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

  // A subtask does not have a milestone of its own — it has its parent's.
  // The parent must therefore exist and be placed itself, and any milestone
  // named in the payload must agree with it. Checking the parent rather than
  // trusting the payload stops a subtask being used as a side door around
  // the rule, or drifting away from the task it belongs to.
  if (parentId) {
    const parent = ws.tasks.find((t) => t.id === parentId);
    if (!parent) {
      return { error: "That parent task does not exist." };
    }
    if (!str(parent.milestoneId)) {
      return {
        error: "A subtask needs a milestone — its parent task has none yet.",
      };
    }
    // Nesting deeper than one level has no representation anywhere in the
    // app, so it is refused rather than stored and rendered inconsistently.
    if (str(parent.parentId)) {
      return { error: "Subtasks cannot be nested further." };
    }
    const wantMs = str(data.milestoneId);
    if (wantMs && wantMs !== str(parent.milestoneId)) {
      return {
        error: "A subtask belongs to the same milestone as its task. Move the task instead.",
      };
    }
    const wantTrack = "category" in data ? str(data.category) : "";
    if (wantTrack && wantTrack !== str(parent.category)) {
      return {
        error: "A subtask belongs to the same track as its task. Move the task instead.",
      };
    }
    // Everything below concerns a task that carries its own milestone; a
    // subtask's is settled by the parent, and inheritFromParent applies it.
    return null;
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

/**
 * Stamps a subtask with its parent's placement.
 *
 * Applied on write rather than resolved on read: the rest of the app filters
 * and groups on a task's own milestone and track, so a subtask that stored
 * neither would vanish from every one of those views.
 */
export function inheritFromParent(
  data: Row,
  ws: Pick<WorkingSet, "tasks" | "milestones">,
): void {
  const parentId = str(data.parentId);
  if (!parentId) return;
  const parent = ws.tasks.find((t) => t.id === parentId);
  if (!parent) return;
  data.milestoneId = parent.milestoneId ?? null;
  data.category = parent.category ?? null;
}

/**
 * The subtasks that must move because their parent did, as id → patch.
 *
 * A subtask belongs to its task, so moving the task takes its subtasks with
 * it. Leaving them behind would strand them under a milestone their parent
 * has left — the exact orphaning the hierarchy exists to prevent, arrived at
 * one step later.
 */
export function cascadeToSubtasks(
  parentId: string,
  next: { milestoneId?: string | null; category?: string | null },
  ws: Pick<WorkingSet, "tasks">,
): { id: string; data: Record<string, unknown> }[] {
  const out: { id: string; data: Record<string, unknown> }[] = [];
  for (const child of ws.tasks) {
    if (child.parentId !== parentId) continue;
    const patch: Record<string, unknown> = {};
    if (next.milestoneId !== undefined && child.milestoneId !== next.milestoneId) {
      patch.milestoneId = next.milestoneId;
    }
    if (next.category !== undefined && child.category !== next.category) {
      patch.category = next.category;
    }
    if (Object.keys(patch).length) out.push({ id: child.id, data: patch });
  }
  return out;
}
