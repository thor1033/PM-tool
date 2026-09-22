import type { Task, Milestone, Category } from "@/lib/types";
import { sortMilestones } from "@/lib/milestone-grouping";

/* Splitting "Sort by" into the two questions it was answering at once.
 *
 * The old control mixed grouping with ordering: picking "Track" bucketed rows
 * under headings, while picking "Upcoming deadlines" reordered a flat list.
 * They are not alternatives — every list is grouped somehow and ordered
 * somehow — so one control could only ever express half the combinations.
 * "Track, but deadline-first inside each track" had no way to be said.
 *
 * Grouping decides the buckets; sorting decides the order within one. */

export type GroupMode = "track" | "milestone" | "owner" | "status" | "none";
export type SortMode = "sequence" | "deadline" | "start" | "title";

export const GROUP_OPTIONS: { id: GroupMode; label: string }[] = [
  { id: "track", label: "Track" },
  { id: "milestone", label: "Milestone" },
  { id: "owner", label: "Owner" },
  { id: "status", label: "Status" },
  { id: "none", label: "Nothing" },
];

export const SORT_OPTIONS: { id: SortMode; label: string }[] = [
  { id: "sequence", label: "Execution order" },
  { id: "deadline", label: "Deadline" },
  { id: "start", label: "Start date" },
  { id: "title", label: "Title" },
];

export const GROUP_STORAGE_KEY = "atlas.actions.groupBy";
export const SORT_STORAGE_KEY = "atlas.actions.sortBy";

const STATUS_RANK: Record<string, number> = { inprogress: 0, backlog: 1, done: 2 };
const STATUS_LABEL: Record<string, string> = {
  inprogress: "In progress",
  backlog: "Backlog",
  done: "Done",
};

/** The first assignee, or "" when unassigned. A task with several owners is
 *  filed under the first — splitting it across buckets would double-count the
 *  work in every total on the page. */
export function ownerOf(t: Task): string {
  const who = (t.assignees ?? []).filter(Boolean);
  return who.length ? who[0] : "";
}

/** A bucket of tasks under one heading. `key` is stable across renders so fold
 *  state can be persisted against it. */
export interface Bucket {
  key: string;
  label: string;
  /** Track colour, where the bucket corresponds to one. */
  color: string | null;
  tasks: Task[];
  /** The milestone this bucket represents, when grouping by milestone. Lets
   *  the renderer show its date and reached state in the heading. */
  milestone?: Milestone | null;
  /** True for the trailing "everything else" bucket, which sorts last. */
  leftover?: boolean;
}

// ── ordering within a bucket ────────────────────────────────────────────────

/** Execution order: scheduled work first by start date, then by the manual
 *  position the board maintains. Finished work sinks, so the next thing to do
 *  is what you read first. This is the order the list has always used. */
function byExecution(a: Task, b: Task): number {
  if ((a.status === "done") !== (b.status === "done")) return a.status === "done" ? 1 : -1;
  const aStart = a.start || "9999-99-99";
  const bStart = b.start || "9999-99-99";
  if (aStart !== bStart) return aStart.localeCompare(bStart);
  if (a.position !== b.position) return a.position - b.position;
  return a.title.localeCompare(b.title);
}

/** Undated work sorts last in every date order — an absent date is not an
 *  early one, and floating those rows to the top buries what is actually due. */
function byDate(field: "end" | "start") {
  return (a: Task, b: Task) => {
    const av = a[field] || "9999-99-99";
    const bv = b[field] || "9999-99-99";
    if (av !== bv) return av.localeCompare(bv);
    return a.title.localeCompare(b.title);
  };
}

/**
 * When a task is actually due.
 *
 * A backlog task carries no end date by rule — its deadline is the milestone's,
 * and copying that date onto the task would assert a commitment nobody made.
 * But that rule made deadline sorting nearly useless in practice: most of a
 * plan is backlog, so most rows read as "no date" and sank to the bottom
 * together, even though every one of them has a real date behind it.
 *
 * So the ordering resolves what the rule deliberately leaves unstored. The
 * task's own end date wins where it exists; otherwise its milestone's date
 * stands in. Nothing is written back — this is a question about order, not a
 * change to the data.
 */
export function effectiveDeadline(
  t: Task,
  milestoneDates: Map<string, string>,
): string {
  if (t.end) return t.end;
  const ms = t.milestoneId ? milestoneDates.get(t.milestoneId) : undefined;
  return ms || "";
}

function byEffectiveDeadline(milestoneDates: Map<string, string>) {
  return (a: Task, b: Task) => {
    const av = effectiveDeadline(a, milestoneDates) || "9999-99-99";
    const bv = effectiveDeadline(b, milestoneDates) || "9999-99-99";
    if (av !== bv) return av.localeCompare(bv);
    // A task with its own date is a firmer commitment than one inheriting the
    // milestone's, so it leads when the two land on the same day.
    if (!!a.end !== !!b.end) return a.end ? -1 : 1;
    return a.title.localeCompare(b.title);
  };
}

/**
 * Orders tasks within a bucket.
 *
 * @param milestoneDates milestone id → date, so deadline sorting can fall back
 *   to the milestone for tasks that carry no end date of their own. Omit it and
 *   those tasks simply sort last, as they did before.
 */
export function sortTasks(
  tasks: Task[],
  mode: SortMode,
  milestoneDates?: Map<string, string>,
): Task[] {
  const cmp =
    mode === "deadline"
      ? byEffectiveDeadline(milestoneDates ?? new Map())
      : mode === "start"
        ? byDate("start")
        : mode === "title"
          ? (a: Task, b: Task) => a.title.localeCompare(b.title)
          : byExecution;
  return [...tasks].sort(cmp);
}

/** milestone id → date, for the deadline fallback. Milestones without a date
 *  are left out so they resolve to "undated" rather than to an empty string
 *  that would sort early. */
export function milestoneDateMap(milestones: Milestone[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const ms of milestones) if (ms.date) m.set(ms.id, ms.date);
  return m;
}

// ── bucketing ───────────────────────────────────────────────────────────────

export interface GroupingInput {
  tasks: Task[];
  categories: Category[];
  milestones: Milestone[];
}

/**
 * Splits tasks into buckets for the chosen grouping.
 *
 * Only top-level tasks are bucketed: a subtask belongs to its parent, and
 * lifting it into a bucket of its own would show the same work twice.
 *
 * Empty buckets are dropped except when grouping by track, where an empty
 * track still needs its heading — that is where the "add task" control lives,
 * so hiding it would make an empty track impossible to fill.
 */
export function groupTasks(
  mode: GroupMode,
  { tasks, categories, milestones }: GroupingInput,
): Bucket[] {
  const top = tasks.filter((t) => !t.parentId);

  if (mode === "none") {
    return [{ key: "_all", label: "", color: null, tasks: top }];
  }

  if (mode === "track") {
    const byId = new Map<string, Task[]>(categories.map((c) => [c.id, []]));
    const loose: Task[] = [];
    for (const t of top) {
      const arr = t.category ? byId.get(t.category) : undefined;
      // A category id matching no live track (deleted, renamed, bad import) is
      // treated as untracked rather than filed in a bucket nothing renders.
      if (arr) arr.push(t);
      else loose.push(t);
    }
    const out: Bucket[] = categories.map((c) => ({
      key: c.id,
      label: c.label,
      color: c.color ?? null,
      tasks: byId.get(c.id) ?? [],
    }));
    if (loose.length) {
      out.push({ key: "_none", label: "No track", color: null, tasks: loose, leftover: true });
    }
    return out;
  }

  if (mode === "milestone") {
    const byId = new Map<string, Task[]>();
    const loose: Task[] = [];
    for (const t of top) {
      if (!t.milestoneId) { loose.push(t); continue; }
      const arr = byId.get(t.milestoneId) ?? [];
      arr.push(t);
      byId.set(t.milestoneId, arr);
    }
    const out: Bucket[] = [];
    // Milestones run in date order; an undated one has no place in a sequence
    // so it sorts to the end rather than jumping to the front.
    for (const m of sortMilestones(milestones.filter((x) => byId.has(x.id)))) {
      out.push({
        key: m.id,
        label: m.title || "Untitled milestone",
        color: null,
        tasks: byId.get(m.id) ?? [],
        milestone: m,
      });
    }
    if (loose.length) {
      out.push({ key: "_none", label: "No milestone", color: null, tasks: loose, leftover: true });
    }
    return out;
  }

  if (mode === "owner") {
    const byOwner = new Map<string, Task[]>();
    const loose: Task[] = [];
    for (const t of top) {
      const o = ownerOf(t);
      if (!o) { loose.push(t); continue; }
      const arr = byOwner.get(o) ?? [];
      arr.push(t);
      byOwner.set(o, arr);
    }
    const out: Bucket[] = [...byOwner.keys()]
      .sort((a, b) => a.localeCompare(b))
      .map((o) => ({ key: `owner:${o}`, label: o, color: null, tasks: byOwner.get(o) ?? [] }));
    if (loose.length) {
      out.push({ key: "_none", label: "Unassigned", color: null, tasks: loose, leftover: true });
    }
    return out;
  }

  // status
  const byStatus = new Map<string, Task[]>();
  for (const t of top) {
    const arr = byStatus.get(t.status) ?? [];
    arr.push(t);
    byStatus.set(t.status, arr);
  }
  return [...byStatus.keys()]
    .sort((a, b) => (STATUS_RANK[a] ?? 99) - (STATUS_RANK[b] ?? 99))
    .map((s) => ({
      key: `status:${s}`,
      label: STATUS_LABEL[s] ?? s,
      color: null,
      tasks: byStatus.get(s) ?? [],
    }));
}

/** Whether milestone sub-headings make sense inside a bucket. Grouping by
 *  milestone already puts them at the top level, so repeating them inside
 *  would nest each bucket under a copy of its own heading. */
export function showsMilestoneHeaders(mode: GroupMode): boolean {
  return mode !== "milestone";
}
