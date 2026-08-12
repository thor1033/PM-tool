import type { Task } from "@/lib/types";
import { today, addDays, isDone, isOpen, DAY_MS } from "@/lib/project-health";

/* Forecasting from what is left, and from what actually happened.
 *
 * The original model spanned min-start to max-end across every task and
 * called that the duration. Two things make that wrong now. It counts
 * finished work, so a project that is 100% done still advertises weeks of
 * "remaining" effort. And it reads only the planned `end`, so a task that
 * overran by a month moves nothing — the slip that `completedOn` exists to
 * record is invisible to the forecast that most needs it.
 *
 * So: the span covers unfinished work only, and realised slip on completed
 * work becomes the evidence for whether the remaining plan is credible. */

/** Calendar days ≈ working days × 7/5. Kept as the module's single
 *  conversion so the estimate and the per-task shift never disagree. */
export const WD_TO_CAL = 7 / 5;

export function workingDays(start: string, end: string): number {
  if (!start || !end) return 0;
  const days = Math.round((+new Date(end) - +new Date(start)) / DAY_MS);
  if (days <= 0) return 1;
  return Math.max(1, Math.round(days * (5 / 7)));
}

export function shiftDate(dateStr: string, calDays: number): string {
  if (!dateStr) return dateStr;
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + calDays);
  return today(d);
}

/** Slip in days for one finished task, or null when it can't be judged. */
export function slipOf(t: Task): number | null {
  if (!t.completedOn || !t.end) return null;
  return Math.round((+new Date(t.completedOn) - +new Date(t.end)) / DAY_MS);
}

export interface Forecast {
  /** Tasks the forecast is actually about: unfinished, dated, top-level. */
  remaining: Task[];
  /** Unfinished tasks with no dates — real work the span cannot see. */
  undated: Task[];
  /** Span of the remaining work. Null when nothing is left, or nothing dated. */
  start: string | null;
  end: string | null;
  /** Working days across the remaining span. */
  baseWd: number;
  bufferWd: number;
  totalWd: number;
  /** Planned end after the buffer is applied. */
  bufferedEnd: string | null;

  // ---- evidence from completed work ----
  /** Finished tasks that had a planned end to be judged against. */
  measured: number;
  onTime: number;
  pctOnTime: number | null;
  /** Mean slip in days across measured tasks; positive means late. */
  meanSlip: number;
  /** Worst overrun observed, in days. */
  worstSlip: number;
  /** Remaining span stretched by the slip rate actually observed so far.
   *  Null when there is no evidence, or nothing left to forecast. */
  projectedEnd: string | null;
  /** Days between the planned end and the evidence-based projection. */
  projectedDrift: number;

  // ---- progress ----
  doneCount: number;
  totalCount: number;
  pctDone: number;
  /** True once every task is finished — the forecast has nothing to say. */
  complete: boolean;
}

/** Top-level tasks only: a subtask's dates sit inside its parent's, so
 *  counting both would double-count the same stretch of calendar. */
const topLevel = (t: Task) => !t.parentId;

export function computeForecast(
  tasks: Task[],
  bufferPct: number,
  now: Date = new Date(),
): Forecast {
  const day = today(now);

  const open = tasks.filter(isOpen).filter(topLevel);
  const remaining = open.filter((t) => t.start && t.end);
  const undated = open.filter((t) => !t.start || !t.end);

  // The span starts no earlier than today: calendar already spent is not
  // remaining work, so a task that began last month contributes only the
  // part still ahead of it.
  const starts = remaining.map((t) => (t.start < day ? day : t.start));
  const ends = remaining.map((t) => t.end);
  const start = starts.length ? starts.reduce((a, b) => (a < b ? a : b)) : null;
  const rawEnd = ends.length ? ends.reduce((a, b) => (a > b ? a : b)) : null;
  // An end already in the past means overdue work, not a finished project;
  // the span has to reach at least today or the duration reads as zero.
  const end = rawEnd ? (rawEnd < day ? day : rawEnd) : null;

  const baseWd = start && end ? workingDays(start, end) : 0;
  const bufferWd = Math.round(baseWd * (bufferPct / 100));
  const bufferedEnd = end ? shiftDate(end, Math.round(bufferWd * WD_TO_CAL)) : null;

  // ---- evidence ----
  const measuredTasks = tasks.filter(isDone).filter((t) => t.end && t.completedOn);
  const slips = measuredTasks.map(slipOf).filter((n): n is number => n !== null);
  const onTime = slips.filter((n) => n <= 0).length;
  const meanSlip = slips.length
    ? Math.round((slips.reduce((a, b) => a + b, 0) / slips.length) * 10) / 10
    : 0;
  const worstSlip = slips.length ? Math.max(0, ...slips) : 0;

  // Apply the observed slip rate to what is left. Only overruns extend the
  // projection — finishing early is not evidence that the rest will too.
  let projectedEnd: string | null = null;
  let projectedDrift = 0;
  if (end && slips.length && meanSlip > 0) {
    // Each remaining task is assumed to slip by the average observed so far,
    // but they overlap, so the span stretches by the mean rather than the sum.
    const stretch = Math.round(meanSlip);
    projectedEnd = shiftDate(end, stretch);
    projectedDrift = stretch;
  }

  const doneCount = tasks.filter(isDone).length;
  const totalCount = tasks.length;

  return {
    remaining, undated, start, end,
    baseWd, bufferWd, totalWd: baseWd + bufferWd, bufferedEnd,
    measured: measuredTasks.length,
    onTime,
    pctOnTime: measuredTasks.length
      ? Math.round((onTime / measuredTasks.length) * 100)
      : null,
    meanSlip, worstSlip, projectedEnd, projectedDrift,
    doneCount, totalCount,
    pctDone: totalCount ? Math.round((doneCount / totalCount) * 100) : 0,
    complete: totalCount > 0 && doneCount === totalCount,
  };
}

/** All tasks downstream of `taskId` through real scheduling dependencies.
 *  Follow-ups are a narrative link, not a schedule one, so they never drag. */
export function downstreamOf(taskId: string, tasks: Task[]): string[] {
  const visited = new Set<string>();
  const queue = [taskId];
  while (queue.length) {
    const id = queue.shift()!;
    for (const t of tasks) {
      if (visited.has(t.id)) continue;
      if ((t.deps ?? []).some((d) => d.type === "task" && d.refId === id)) {
        visited.add(t.id);
        queue.push(t.id);
      }
    }
  }
  visited.delete(taskId);
  return [...visited];
}

export { addDays };
