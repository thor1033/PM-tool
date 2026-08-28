import { todayLocal } from "@/lib/task-dates";

/* How close a milestone is to its date, and whether that should worry anyone.
 *
 * A milestone's deadline is a different kind of pressure from a task's. A late
 * task is one person's problem; a late milestone means an outcome the whole
 * plan is built around will not land when it said. So it needs saying before
 * the date passes, not after — the header only turned red once a milestone
 * was already overdue, which is the one moment the warning is useless.
 *
 * The state also distinguishes two situations that look identical on a
 * calendar. A milestone past its date with work outstanding is genuinely
 * late. One past its date with everything finished is only waiting for
 * somebody to confirm the outcome — a click, not a delay — and dressing that
 * up in the same red says the plan is in worse shape than it is. */

export type MilestoneUrgency =
  /** Declared reached. Nothing to chase. */
  | "reached"
  /** Every task done, nobody has confirmed the outcome yet. */
  | "awaiting"
  /** Past its date with work still open. */
  | "overdue"
  /** Lands within a week. */
  | "due-soon"
  /** Lands within a fortnight — far enough to plan around, close enough to
   *  know about. */
  | "approaching"
  /** Far enough out to be nobody's problem today. */
  | "future"
  /** No date set, so there is nothing to be close to. */
  | "undated";

export interface MilestoneStanding {
  urgency: MilestoneUrgency;
  /** Days until the date; negative once past. Null when undated. */
  daysLeft: number | null;
  /** Short phrase for a chip or tooltip, e.g. "due in 3 days". */
  label: string;
  /** Colour token. Chosen so the state is never carried by hue alone — every
   *  caller pairs it with the label above. */
  tone: string;
}

const DAY = 86_400_000;

/** Whole days from today to an ISO date, in local time. */
export function daysUntil(date: string, now: Date = new Date()): number {
  const today = new Date(`${todayLocal(now)}T00:00:00`);
  return Math.round((+new Date(`${date}T00:00:00`) - +today) / DAY);
}

function plural(n: number): string {
  return n === 1 ? "day" : "days";
}

/**
 * Where a milestone stands relative to its date.
 *
 * @param m       the milestone's date and whether it has been reached
 * @param allDone whether every finishable task beneath it is complete
 */
export function milestoneStanding(
  m: { date?: string | null; reachedOn?: string | null },
  allDone: boolean,
  now: Date = new Date(),
): MilestoneStanding {
  const date = (m.date ?? "").trim();
  const reached = (m.reachedOn ?? "").trim();

  if (reached) {
    return { urgency: "reached", daysLeft: null, label: "reached", tone: "var(--hue-done)" };
  }
  if (!date) {
    return { urgency: "undated", daysLeft: null, label: "no date", tone: "var(--ink-faint)" };
  }

  const daysLeft = daysUntil(date, now);

  // Finished work waiting on a confirmation is not lateness, whichever side
  // of the date it falls on.
  if (allDone) {
    return {
      urgency: "awaiting",
      daysLeft,
      label: "ready to confirm",
      tone: "var(--hue-done)",
    };
  }

  if (daysLeft < 0) {
    const n = -daysLeft;
    return { urgency: "overdue", daysLeft, label: `${n} ${plural(n)} overdue`, tone: "var(--t-red)" };
  }
  if (daysLeft === 0) {
    return { urgency: "due-soon", daysLeft, label: "due today", tone: "var(--t-red)" };
  }
  if (daysLeft <= 7) {
    return { urgency: "due-soon", daysLeft, label: `due in ${daysLeft} ${plural(daysLeft)}`, tone: "var(--t-amber)" };
  }
  if (daysLeft <= 14) {
    return { urgency: "approaching", daysLeft, label: `due in ${daysLeft} days`, tone: "var(--t-amber)" };
  }
  return { urgency: "future", daysLeft, label: `due in ${daysLeft} days`, tone: "var(--ink-faint)" };
}

/** Whether this standing is worth drawing attention to at all. */
export function isPressing(s: MilestoneStanding): boolean {
  return s.urgency === "overdue" || s.urgency === "due-soon" || s.urgency === "awaiting";
}
