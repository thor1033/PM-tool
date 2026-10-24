import type { Task, Milestone } from "@/lib/types";

/* Grouping a track's tasks beneath its milestones.
 *
 * A task always sits in a track, and may sit under one of that track's
 * milestones (or gates). The milestone is a grouping only: it has no date and
 * decides nothing about the tasks under it. It is reached when someone checks
 * it off, never because its last task finished.
 *
 * Subtasks are deliberately not placed here: they belong to their parent. */

export interface MilestoneGroup {
  /** Null for the trailing group of tasks that sit directly in the track. */
  milestone: Milestone | null;
  key: string;
  tasks: Task[];
  /** The day someone checked the milestone off, or "" while it is open. */
  reachedOn: string;
}

/** Open milestones first, in the order they were created; checked-off ones
 *  after them, in the order they were reached. */
export function sortMilestones(list: Milestone[]): Milestone[] {
  return list
    .map((m, i) => ({ m, i }))
    .sort((a, b) => {
      const ar = a.m.reachedOn ?? "", br = b.m.reachedOn ?? "";
      if (!!ar !== !!br) return ar ? 1 : -1;
      if (ar && br && ar !== br) return ar.localeCompare(br);
      return a.i - b.i;
    })
    .map(({ m }) => m);
}

/** Working order within a milestone: unfinished work first, then by start
 *  date, then by the manual position the board already maintains. */
function byExecution(a: Task, b: Task): number {
  if ((a.status === "done") !== (b.status === "done")) return a.status === "done" ? 1 : -1;
  const aStart = a.start || "9999-99-99";
  const bStart = b.start || "9999-99-99";
  if (aStart !== bStart) return aStart.localeCompare(bStart);
  if (a.position !== b.position) return a.position - b.position;
  return a.title.localeCompare(b.title);
}

/**
 * Splits a track's tasks into its milestone groups, then the tasks that sit
 * directly in the track.
 *
 * @param tasks      top-level tasks already filtered to one track
 * @param milestones milestones and gates belonging to that track
 */
export function groupByMilestone(
  tasks: Task[],
  milestones: Milestone[],
): MilestoneGroup[] {
  const valid = new Set(milestones.map((m) => m.id));
  const buckets = new Map<string, Task[]>();

  for (const t of tasks) {
    // A milestone that has been deleted leaves its tasks directly in the
    // track rather than hiding them in a group nothing renders.
    const key = t.milestoneId && valid.has(t.milestoneId) ? t.milestoneId : "_none";
    const arr = buckets.get(key) ?? [];
    arr.push(t);
    buckets.set(key, arr);
  }

  const out: MilestoneGroup[] = sortMilestones(milestones).map((m) => ({
    milestone: m,
    key: m.id,
    tasks: (buckets.get(m.id) ?? []).sort(byExecution),
    reachedOn: m.reachedOn ?? "",
  }));

  const loose = (buckets.get("_none") ?? []).sort(byExecution);
  if (loose.length) out.push({ milestone: null, key: "_none", tasks: loose, reachedOn: "" });
  return out;
}

/** Milestones and gates a task can sit under — those in its own track. */
export function milestonesForTask(
  taskCategory: string | null,
  milestones: Milestone[],
): Milestone[] {
  if (!taskCategory) return [];
  return sortMilestones(milestones.filter((m) => (m.category ?? null) === taskCategory));
}
