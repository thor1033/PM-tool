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

/** Local YYYY-MM-DD, matching how the client stamps completion dates. */
function today(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Clears the dates a backlog task has no business carrying.
 *
 * Backlog work has not started, so it has no start date, and it certainly
 * has no completion date. Its deadline is the milestone's — that is what the
 * milestone is for. Stamping a start on it the moment it is created makes
 * every unstarted task look under way: it draws a bar on the timeline, feeds
 * the forecast, and can report as overdue for missing a date nobody set.
 *
 * A planned end is left alone. Committing to a date before work begins is a
 * normal thing to do, and the two are different claims: "this is when it is
 * due" is a plan, "this started on the 20th" is a statement about work that
 * has not happened.
 *
 * Applied when a write leaves the task in backlog, so moving something back
 * to backlog also drops the dates it accrued while it was running.
 */
export function clearBacklogDates(
  data: Row,
  isCreate: boolean,
  current?: { status?: string | null },
): void {
  const status = "status" in data ? str(data.status) : str(current?.status);
  // On create, a task with no status named lands in backlog by default.
  const effective = status || (isCreate ? "backlog" : "");
  if (effective !== "backlog") return;

  // A patch that only names the status still has to drop the start the task
  // accrued while it was running — otherwise moving work back to backlog
  // leaves it claiming a start date for work that is no longer under way.
  const movingToBacklog = "status" in data && str(current?.status) !== "backlog";
  if (isCreate || movingToBacklog || "start" in data) data.start = "";
  data.completedOn = "";
}

/**
 * The subtasks that must follow their parent, as id → patch.
 *
 * A subtask belongs to its task, so what happens to the task happens to its
 * parts. Moving the task takes them with it — leaving them behind would
 * strand them under a milestone their parent has left, the exact orphaning
 * the hierarchy exists to prevent, arrived at one step later. Changing the
 * task's status carries too: parts of a piece of work that has started are
 * themselves under way, and a task cannot honestly be done while the work
 * beneath it is not.
 *
 * `completedOn` is kept in step with status here rather than left to the
 * caller, so a subtask closed by a cascade records the same completion date
 * as one closed by hand.
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
      patch.status = next.status;
      patch.completedOn = next.status === "done" ? today() : "";
      // Back to backlog means back to unstarted: the start date it accrued
      // while running is no longer a true statement about it.
      if (next.status === "backlog") patch.start = "";
    }
    if (Object.keys(patch).length) out.push({ id: child.id, data: patch });
  }
  return out;
}
