import type { WorkingSet } from "@/lib/types";

/* When a task's dates are set for it, and when they are left alone.
 *
 * Status is the single thing that says whether work is happening, so status
 * is what drives every date on a task:
 *
 *   backlog     the work is known and belongs to a milestone, but nobody has
 *               started it. It has no start date and no completion date. Its
 *               planned end falls back to the milestone's date, because that
 *               is the commitment it already sits under.
 *
 *   inprogress  somebody is working on it. The day they said so is its start
 *               date, recorded once and then left alone — it is a fact about
 *               when work began, not a value the system keeps refreshing.
 *
 *   done        the work finished. The day it was marked done is its actual
 *               end, and the gap between that and the planned end is the
 *               slip the delivery stats are built from.
 *
 * All of it runs on the server, on the one path every write shares. Rules
 * living in a form are rules only that form obeys: the AI planner, the
 * importer and the raw API all reach the same tables, and each would need
 * its own copy to agree.
 *
 * Every default here yields to an explicit value in the same payload, so
 * setting a date by hand always wins over the rule that would have set it. */

type Row = Record<string, unknown>;

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Local YYYY-MM-DD. Deliberately not toISOString(), which shifts by
 *  timezone and can file an evening edit under the following day. */
export function todayLocal(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

export type TaskStatus = "backlog" | "inprogress" | "done";

/** What the task's status will be once this write lands. */
export function effectiveStatus(
  data: Row,
  isCreate: boolean,
  current?: { status?: string | null },
): TaskStatus {
  const named = "status" in data ? str(data.status) : str(current?.status);
  const s = named || (isCreate ? "backlog" : "backlog");
  return s === "inprogress" || s === "done" ? s : "backlog";
}

/**
 * Applies every date rule to one task write.
 *
 * @param data     the payload, mutated in place
 * @param isCreate absent fields mean "unset" on create, "unchanged" on update
 * @param current  the row as it stands, for updates
 * @param ws       milestones, so a backlog task can fall back to its deadline
 * @param now      injected so the rules are testable against a fixed clock
 */
export function applyDateRules(
  data: Row,
  isCreate: boolean,
  current: { status?: string | null; start?: string | null; end?: string | null; completedOn?: string | null; milestoneId?: string | null } | undefined,
  ws: Pick<WorkingSet, "milestones">,
  now: Date = new Date(),
): void {
  const today = todayLocal(now);
  const status = effectiveStatus(data, isCreate, current);
  const wasStatus = str(current?.status);
  const changingStatus = "status" in data && status !== wasStatus;

  // ── start ────────────────────────────────────────────────────────────────
  if (status === "backlog") {
    // Nothing has started, so there is nothing for a start date to record.
    // Cleared on create, and whenever work is pushed back to backlog, so a
    // task cannot keep claiming it began on a day it is no longer running.
    if (isCreate || (changingStatus && wasStatus !== "backlog") || "start" in data) {
      data.start = "";
    }
  } else if (changingStatus && status === "inprogress") {
    // Work starts the day somebody says it started. Recorded once: a task
    // that goes back to backlog and forward again is starting afresh, but a
    // start already set by hand is a deliberate statement and survives.
    if (!("start" in data) && !str(current?.start)) {
      data.start = today;
    }
  }

  // ── planned end ──────────────────────────────────────────────────────────
  // A backlog task inherits its milestone's date as its deadline: it already
  // sits under that commitment, and a task with no date at all is invisible
  // to the timeline and the forecast. Only ever a fallback — any end set on
  // the task itself, by hand or earlier, is left exactly as it is.
  if (status === "backlog") {
    const ownEnd = "end" in data ? str(data.end) : str(current?.end);
    if (!ownEnd) {
      const msId = "milestoneId" in data ? str(data.milestoneId) : str(current?.milestoneId);
      const ms = msId ? ws.milestones.find((m) => m.id === msId) : undefined;
      if (ms && str(ms.date)) data.end = str(ms.date);
    }
  }

  // ── actual end ───────────────────────────────────────────────────────────
  // The day the work was marked done. Stamped here rather than in the client
  // so it is recorded no matter which path closes the task, and cleared when
  // a task is reopened because it is then a claim about work still running.
  if ("completedOn" in data) {
    // An explicit value wins: correcting a completion date is a real need.
  } else if (status === "done") {
    if (changingStatus || !str(current?.completedOn)) data.completedOn = today;
  } else if (changingStatus || isCreate) {
    data.completedOn = "";
  }
}

/**
 * Days between a task's planned end and when it actually finished.
 *
 * Positive is late. Null when there is nothing to compare — the delta is
 * only meaningful against a deadline the task carried itself, so a backlog
 * task that merely inherited its milestone's date is not judged against it.
 */
export function slipDays(task: {
  end?: string | null;
  completedOn?: string | null;
}): number | null {
  const end = str(task.end);
  const done = str(task.completedOn);
  if (!end || !done) return null;
  return Math.round((+new Date(done) - +new Date(end)) / 86_400_000);
}
