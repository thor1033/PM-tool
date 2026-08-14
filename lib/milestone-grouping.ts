import type { Task, Milestone } from "@/lib/types";

/* Grouping tasks beneath the milestone they drive at.
 *
 * A track says which part of the project a task belongs to. A milestone says
 * which outcome it is working toward. Without the second, every task in a
 * track appears to serve every milestone in it at once, which says nothing
 * about order or purpose.
 *
 * Subtasks are deliberately not placed here: they belong to their parent, and
 * the parent's milestone is the one that counts. */

export interface MilestoneGroup {
  /** Null for the trailing "not tied to a milestone" bucket. */
  milestone: Milestone | null;
  key: string;
  tasks: Task[];
  /** True once every task beneath it is done — the milestone is met. */
  complete: boolean;
  doneCount: number;
}

/** Milestones run in date order: an undated one has no place in a sequence,
 *  so it sorts to the end rather than jumping to the front. */
export function sortMilestones(list: Milestone[]): Milestone[] {
  return [...list].sort(
    (a, b) =>
      (a.date || "9999-99-99").localeCompare(b.date || "9999-99-99") ||
      a.title.localeCompare(b.title),
  );
}

/** Execution order within a milestone: scheduled work first, by start date,
 *  then by the manual position the board already maintains. Finished tasks
 *  sink so the next thing to do is what you read first. */
function byExecution(a: Task, b: Task): number {
  if ((a.status === "done") !== (b.status === "done")) return a.status === "done" ? 1 : -1;
  const aStart = a.start || "9999-99-99";
  const bStart = b.start || "9999-99-99";
  if (aStart !== bStart) return aStart.localeCompare(bStart);
  if (a.position !== b.position) return a.position - b.position;
  return a.title.localeCompare(b.title);
}

/**
 * Splits a track's tasks into milestone groups, in delivery order.
 *
 * @param tasks    top-level tasks already filtered to one track
 * @param milestones milestones belonging to that track
 */
export function groupByMilestone(
  tasks: Task[],
  milestones: Milestone[],
): MilestoneGroup[] {
  const valid = new Set(milestones.map((m) => m.id));
  const buckets = new Map<string, Task[]>();

  for (const t of tasks) {
    // A milestone that has been deleted leaves its tasks unassigned rather
    // than hiding them in a group nothing renders.
    const key = t.milestoneId && valid.has(t.milestoneId) ? t.milestoneId : "_none";
    const arr = buckets.get(key) ?? [];
    arr.push(t);
    buckets.set(key, arr);
  }

  const out: MilestoneGroup[] = [];
  for (const m of sortMilestones(milestones)) {
    const list = (buckets.get(m.id) ?? []).sort(byExecution);
    const doneCount = list.filter((t) => t.status === "done").length;
    out.push({
      milestone: m,
      key: m.id,
      tasks: list,
      complete: list.length > 0 && doneCount === list.length,
      doneCount,
    });
  }

  // Unassigned work sits last: it is the leftover, not the plan.
  const loose = (buckets.get("_none") ?? []).sort(byExecution);
  if (loose.length) {
    out.push({
      milestone: null,
      key: "_none",
      tasks: loose,
      complete: false,
      doneCount: loose.filter((t) => t.status === "done").length,
    });
  }

  return out;
}

/** Milestones a task could be tied to — those in its own track. A task with
 *  no track can only be tied to a milestone that has no track either. */
export function milestonesForTask(
  taskCategory: string | null,
  milestones: Milestone[],
): Milestone[] {
  return sortMilestones(
    milestones.filter((m) => (m.category ?? null) === (taskCategory ?? null)),
  );
}
