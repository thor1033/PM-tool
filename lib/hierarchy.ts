import type { WorkingSet } from "@/lib/types";

/* The plan's containment rules, enforced on the server.
 *
 *   track → (milestone) → task → subtask
 *
 * A task always sits in a track. Within its track it may sit under one of the
 * track's milestones, or directly in the track — a milestone is an optional
 * grouping, not a requirement, and it decides nothing about the task: not its
 * track, not its dates, not its order. A milestone belongs to one track. A
 * subtask sits under its parent task and so shares its parent's track and
 * milestone.
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
 * Checks a task write: it must sit in a track, and a milestone, when it has
 * one, must be one of that track's.
 *
 * @param current the task as stored, on update — a partial patch is judged
 *                against the track and milestone it already has
 */
export function checkTask(
  data: Row,
  isCreate: boolean,
  ws: Pick<WorkingSet, "tasks" | "milestones">,
  current?: { category?: string | null; milestoneId?: string | null },
): HierarchyIssue | null {
  const parentId = str(data.parentId);

  // A subtask's place is its parent's. The parent must exist, and the payload
  // may not try to put the subtask somewhere else.
  if (parentId) {
    const parent = ws.tasks.find((t) => t.id === parentId);
    if (!parent) {
      return { error: "That parent task does not exist." };
    }
    // Nesting deeper than one level has no representation anywhere in the
    // app, so it is refused rather than stored and rendered inconsistently.
    if (str(parent.parentId)) {
      return { error: "Subtasks cannot be nested further." };
    }
    const wantTrack = "category" in data ? str(data.category) : "";
    if (wantTrack && wantTrack !== str(parent.category)) {
      return {
        error: "A subtask belongs to the same track as its task. Move the task instead.",
      };
    }
    const wantMs = "milestoneId" in data ? str(data.milestoneId) : "";
    if (wantMs && wantMs !== str(parent.milestoneId)) {
      return {
        error: "A subtask sits under the same milestone as its task. Move the task instead.",
      };
    }
    return null;
  }

  // The track a task will have once this write lands.
  const track = "category" in data ? str(data.category) : str(current?.category);
  if ((isCreate || "category" in data) && !track) {
    return { error: "A task must sit in a track." };
  }

  const milestoneId = "milestoneId" in data ? str(data.milestoneId) : "";
  if (!milestoneId) return null;
  const ms = ws.milestones.find((m) => m.id === milestoneId);
  if (!ms) {
    return { error: "That milestone does not exist." };
  }
  if (track && str(ms.category) !== track) {
    return { error: "That milestone belongs to a different track than the task." };
  }
  return null;
}

/**
 * Whether a task moving to `nextTrack` has to leave its milestone behind.
 *
 * A milestone belongs to one track, so a task that changes track cannot keep
 * sitting under it. The milestone does not pull the task back — the task's
 * track wins and the milestone link is dropped.
 */
export function milestoneLeftBehind(
  nextTrack: string | null | undefined,
  milestoneId: string | null | undefined,
  ws: Pick<WorkingSet, "milestones">,
): boolean {
  const msId = str(milestoneId);
  if (!msId) return false;
  const ms = ws.milestones.find((m) => m.id === msId);
  return !ms || str(ms.category) !== str(nextTrack);
}

/**
 * Stamps a subtask with its parent's placement and stage.
 *
 * Applied on write rather than resolved on read: the rest of the app filters
 * and groups on a task's own milestone and track, so a subtask that stored
 * neither would vanish from every one of those views.
 *
 * Status is included on creation because a part of work already under way is
 * itself under way. Without it, only a later *change* to the parent brought
 * subtasks into line, so anything created under a running task — by the AI
 * planner, by promoting an existing task, or through the raw API — sat in
 * backlog beneath an in-progress parent until something else moved.
 *
 * A parent that is `done` is the exception: new work under a finished task
 * is work that has been remembered late, not work already completed, so it
 * starts in backlog rather than being marked done on arrival.
 */
export function inheritFromParent(
  data: Row,
  ws: Pick<WorkingSet, "tasks" | "milestones">,
  opts: { withStatus?: boolean } = {},
): void {
  const parentId = str(data.parentId);
  if (!parentId) return;
  const parent = ws.tasks.find((t) => t.id === parentId);
  if (!parent) return;
  data.milestoneId = parent.milestoneId ?? null;
  data.category = parent.category ?? null;
  if (opts.withStatus) {
    data.status = parent.status === "done" ? "backlog" : parent.status ?? "backlog";
  }
}

/**
 * The subtasks that must follow their parent, as id → patch.
 *
 * A subtask belongs to its task, so what happens to the task happens to its
 * parts. Moving the task — to another track or under another milestone —
 * takes them with it. Changing the task's status carries too: parts of a
 * piece of work that has started are themselves under way, and a task cannot
 * honestly be done while the work beneath it is not.
 *
 * Only the status is set here; the dates that follow from it are applied by
 * the shared date rules, so there is one statement of them rather than a
 * second copy in this file that can drift.
 */
export function cascadeToSubtasks(
  parentId: string,
  next: { milestoneId?: string | null; category?: string | null; status?: string },
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
    if (next.status !== undefined && child.status !== next.status) {
      // Only the status is set here. The dates that follow from it are left
      // to applyDateRules, which the route runs over each child patch — one
      // statement of the rules rather than a second copy that can drift.
      patch.status = next.status;
    }
    if (Object.keys(patch).length) out.push({ id: child.id, data: patch });
  }
  return out;
}
