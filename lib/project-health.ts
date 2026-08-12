import type { Task, Risk } from "@/lib/types";

/* The numbers the overview leads with.
 *
 * Kept as pure functions away from the component so they can be checked
 * against real data — a dashboard that quietly miscounts is worse than no
 * dashboard, because people stop reading the board and trust the tile. */

export const DAY_MS = 86_400_000;

/** Local YYYY-MM-DD; toISOString() would shift by timezone and can land an
 *  evening edit on the wrong day. */
export function today(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00`);
  d.setDate(d.getDate() + n);
  return today(d);
}

export const isDone = (t: Task) => t.status === "done";
export const isOpen = (t: Task) => t.status !== "done";

/** Tasks this one is still waiting on. External deps are commitments from
 *  outside the plan — real, but not something the board can mark finished,
 *  so they're reported separately rather than counted as blockers. */
export function blockersOf(task: Task, all: Task[]): Task[] {
  return (task.deps ?? [])
    .filter((d) => d.type !== "external")
    .map((d) => all.find((t) => t.id === d.refId))
    .filter((t): t is Task => !!t && t.status !== "done");
}

export function externalDepCount(task: Task): number {
  return (task.deps ?? []).filter((d) => d.type === "external").length;
}

export interface Health {
  total: number;
  done: number;
  inProgress: number;
  remaining: number;
  /** Share of all tasks finished, 0–100. */
  pctDone: number;
  pctInProgress: number;
  /** Finished tasks that had a planned end to be judged against. */
  measured: number;
  onTime: number;
  /** Share of measured tasks that landed on or before the planned end, or
   *  null when nothing finished has a planned end to compare with. */
  pctOnTime: number | null;
  /** Median days late across measured tasks that slipped (0 when none did). */
  medianSlip: number;
  overdue: Task[];
  blocked: Task[];
  dueSoon: Task[];
  unassigned: Task[];
  externals: number;
}

export function computeHealth(
  tasks: Task[],
  all: Task[] = tasks,
  now: Date = new Date(),
): Health {
  const day = today(now);
  const soon = addDays(day, 7);

  const done = tasks.filter(isDone);
  const open = tasks.filter(isOpen);
  const inProgress = tasks.filter((t) => t.status === "inprogress");

  // On-time is judged only on tasks that recorded both a plan and an actual.
  // Counting undated finished work as "on time" would flatter the number.
  const measured = done.filter((t) => t.end && t.completedOn);
  const onTime = measured.filter((t) => t.completedOn <= t.end);
  const slips = measured
    .filter((t) => t.completedOn > t.end)
    .map((t) => Math.round((+new Date(t.completedOn) - +new Date(t.end)) / DAY_MS))
    .sort((a, b) => a - b);
  const medianSlip = slips.length
    ? slips.length % 2
      ? slips[(slips.length - 1) / 2]
      : Math.round((slips[slips.length / 2 - 1] + slips[slips.length / 2]) / 2)
    : 0;

  const overdue = open.filter((t) => t.end && t.end < day);
  const blocked = open.filter((t) => blockersOf(t, all).length > 0);
  // "Due soon" is forward-looking only; anything already past its date is
  // overdue and belongs in that bucket, not counted twice here.
  const dueSoon = open.filter((t) => t.end && t.end >= day && t.end <= soon);
  const unassigned = inProgress.filter((t) => (t.assignees ?? []).length === 0);

  const total = tasks.length;
  return {
    total,
    done: done.length,
    inProgress: inProgress.length,
    remaining: total - done.length - inProgress.length,
    pctDone: total ? Math.round((done.length / total) * 100) : 0,
    pctInProgress: total ? Math.round((inProgress.length / total) * 100) : 0,
    measured: measured.length,
    onTime: onTime.length,
    pctOnTime: measured.length ? Math.round((onTime.length / measured.length) * 100) : null,
    medianSlip,
    overdue,
    blocked,
    dueSoon,
    unassigned,
    externals: open.reduce((n, t) => n + externalDepCount(t), 0),
  };
}

// ── the attention list ──────────────────────────────────────────────────────

export type Severity = "critical" | "warning" | "info";

export interface AttentionItem {
  task: Task;
  severity: Severity;
  /** Written reason — status is never carried by colour alone. */
  label: string;
  detail: string;
  /** Sort weight; lower is more urgent. */
  rank: number;
}

/** One ranked list answering "what needs me today", instead of leaving the
 *  reader to assemble it from a gantt, a risk panel and a dependency grid.
 *  A task appears once, under its most severe reason. */
export function attentionList(
  tasks: Task[],
  all: Task[],
  risks: Risk[] = [],
  now: Date = new Date(),
): AttentionItem[] {
  const day = today(now);
  const soon = addDays(day, 7);
  const open = tasks.filter(isOpen);

  const riskyTaskIds = new Set(
    risks
      .filter((r) => r.status !== "closed" && (r.likelihood === "high" || r.impact === "high"))
      .flatMap((r) => r.taskIds ?? []),
  );

  const out: AttentionItem[] = [];
  for (const task of open) {
    const blockers = blockersOf(task, all);
    const daysLate = task.end && task.end < day
      ? Math.round((+new Date(day) - +new Date(task.end)) / DAY_MS)
      : 0;

    if (daysLate > 0) {
      out.push({
        task,
        severity: "critical",
        label: "Overdue",
        detail: `${daysLate} day${daysLate === 1 ? "" : "s"} past its planned end`,
        rank: 1000 - daysLate, // longest overdue first
      });
    } else if (blockers.length) {
      out.push({
        task,
        severity: "warning",
        label: "Blocked",
        detail: `Waiting on ${blockers.map((b) => b.title).join(", ")}`,
        rank: 2000 - blockers.length,
      });
    } else if (riskyTaskIds.has(task.id)) {
      out.push({
        task,
        severity: "warning",
        label: "At risk",
        detail: "Carries a high likelihood or impact risk",
        rank: 2500,
      });
    } else if (task.end && task.end <= soon) {
      const days = Math.round((+new Date(task.end) - +new Date(day)) / DAY_MS);
      out.push({
        task,
        severity: "info",
        label: days === 0 ? "Due today" : `Due in ${days}d`,
        detail: "Coming up this week",
        rank: 3000 + days,
      });
    } else if (task.status === "inprogress" && (task.assignees ?? []).length === 0) {
      out.push({
        task,
        severity: "info",
        label: "Unassigned",
        detail: "In progress with nobody on it",
        rank: 4000,
      });
    }
  }

  return out.sort((a, b) => a.rank - b.rank || a.task.title.localeCompare(b.task.title));
}
