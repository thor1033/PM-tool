import type { Task } from "@/lib/types";

/* Critical Path Method over the task graph, counted in working days.
 *
 * The schedule is derived, not stored: durations come from each task's real
 * start/end dates, dependencies come from its task-type deps, and `delayDays`
 * is a what-if layered on top. Nothing here writes to start/end, so the plan
 * of record stays intact while the forecast stress-tests it. */

const DAY_MS = 86_400_000;

function toDate(d: string): Date {
  return new Date(`${d}T00:00:00`);
}

function iso(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const isWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6;

/** Steps `n` working days from `date`, skipping weekends. Negative goes back. */
export function addWD(date: string, n: number): string {
  const d = toDate(date);
  const step = n >= 0 ? 1 : -1;
  let left = Math.abs(Math.round(n));
  while (left > 0) {
    d.setDate(d.getDate() + step);
    if (!isWeekend(d)) left--;
  }
  return iso(d);
}

/** Working days between two dates, signed. Excludes the end day itself, so
 *  a Monday→Tuesday span is 1 working day of elapsed time. */
export function wdBetween(a: string, b: string): number {
  if (!a || !b) return 0;
  const back = b < a;
  const from = toDate(back ? b : a);
  const to = toDate(back ? a : b);
  let n = 0;
  const cur = new Date(from);
  while (cur < to) {
    cur.setDate(cur.getDate() + 1);
    if (!isWeekend(cur)) n++;
  }
  return back ? -n : n;
}

/** Only task→task deps schedule. Deliverable and external deps are real
 *  commitments but the board cannot date them, so they never move a bar. */
function predecessorsOf(t: Task, byId: Map<string, Task>): Task[] {
  return (t.deps ?? [])
    .filter((d) => d.type === "task" && d.refId)
    .map((d) => byId.get(d.refId!))
    .filter((x): x is Task => !!x);
}

/** A task's length in working days: its own dated span plus any modelled
 *  delay. Undated tasks have no span to measure, so they carry only the
 *  delay and are marked `estimated`. */
export function durationOf(t: Task): number {
  const dated = !!(t.start && t.end);
  const base = dated ? Math.max(1, wdBetween(t.start, t.end)) : 0;
  return base + Math.max(0, t.delayDays ?? 0);
}

export interface CpmRow {
  task: Task;
  duration: number;
  /** Working-day offsets from the project start. */
  es: number;
  ef: number;
  slack: number;
  critical: boolean;
  startDate: string;
  endDate: string;
  done: boolean;
  /** True when the task has no dates, so its length is delay-only. */
  estimated: boolean;
}

export interface CpmResult {
  rows: CpmRow[];
  projStart: string;
  /** Total working days across the critical path. */
  projDur: number;
  projEnd: string;
  criticalCount: number;
  /** Latest planned end across dated tasks, for comparing against the buffer. */
  plannedEnd: string | null;
}

/** Top-level only: a subtask sits inside its parent's span, so counting both
 *  would double-count the same stretch of calendar. */
const topLevel = (t: Task) => !t.parentId;

export function computeCpm(allTasks: Task[], now: Date = new Date()): CpmResult {
  const tasks = allTasks.filter(topLevel);
  const byId = new Map(tasks.map((t) => [t.id, t]));

  const dated = tasks.filter((t) => t.start);
  const projStart = dated.length
    ? dated.map((t) => t.start).reduce((a, b) => (a < b ? a : b))
    : iso(now);

  // ---- forward pass ----
  // Memoised and cycle-guarded: a task caught in a dependency cycle
  // contributes 0 rather than recursing forever.
  const esMemo = new Map<string, number>();
  const visiting = new Set<string>();

  function earlyStart(t: Task): number {
    const hit = esMemo.get(t.id);
    if (hit !== undefined) return hit;
    if (visiting.has(t.id)) return 0; // cycle
    visiting.add(t.id);

    // Its own place in the calendar, never before the project start.
    const own = t.start ? Math.max(0, wdBetween(projStart, t.start)) : 0;
    let es = own;
    for (const p of predecessorsOf(t, byId)) {
      es = Math.max(es, earlyStart(p) + durationOf(p));
    }

    visiting.delete(t.id);
    esMemo.set(t.id, es);
    return es;
  }

  tasks.forEach(earlyStart);
  const projDur = tasks.reduce((m, t) => Math.max(m, earlyStart(t) + durationOf(t)), 0);

  // ---- backward pass ----
  const successors = new Map<string, Task[]>();
  for (const t of tasks) {
    for (const p of predecessorsOf(t, byId)) {
      const arr = successors.get(p.id) ?? [];
      arr.push(t);
      successors.set(p.id, arr);
    }
  }

  const lfMemo = new Map<string, number>();
  const visitingLf = new Set<string>();

  function lateFinish(t: Task): number {
    const hit = lfMemo.get(t.id);
    if (hit !== undefined) return hit;
    if (visitingLf.has(t.id)) return projDur; // cycle
    visitingLf.add(t.id);

    const succ = successors.get(t.id) ?? [];
    const lf = succ.length
      ? succ.reduce((m, s) => Math.min(m, lateFinish(s) - durationOf(s)), Infinity)
      : projDur;

    visitingLf.delete(t.id);
    lfMemo.set(t.id, lf);
    return lf;
  }

  const rows: CpmRow[] = tasks.map((t) => {
    const duration = durationOf(t);
    const es = earlyStart(t);
    const ef = es + duration;
    const slack = lateFinish(t) - duration - es;
    return {
      task: t,
      duration,
      es,
      ef,
      slack,
      critical: slack <= 0,
      startDate: addWD(projStart, es),
      endDate: addWD(projStart, ef),
      done: t.status === "done",
      estimated: !(t.start && t.end),
    };
  });

  rows.sort((a, b) => a.es - b.es || a.ef - b.ef || a.task.title.localeCompare(b.task.title));

  const plannedEnds = tasks.map((t) => t.end).filter(Boolean);
  return {
    rows,
    projStart,
    projDur,
    projEnd: addWD(projStart, projDur),
    criticalCount: rows.filter((r) => r.critical).length,
    plannedEnd: plannedEnds.length ? plannedEnds.reduce((a, b) => (a > b ? a : b)) : null,
  };
}

/** Working days → whole weeks, for the headline figures. */
export function toWeeks(wd: number): number {
  return Math.round((wd / 5) * 10) / 10;
}

/** Days between a finished task's planned end and when it actually landed.
 *  Positive is late. Null when there is nothing to compare. */
export function slipOf(t: Task): number | null {
  if (!t.completedOn || !t.end) return null;
  return Math.round((+toDate(t.completedOn) - +toDate(t.end)) / DAY_MS);
}
