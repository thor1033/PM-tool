import { Hammer, Users, Scale, Search, CheckCheck, FileText } from "lucide-react";

/* How a task gets done, as distinct from what it is about.
 *
 * "Conduct initial meeting on branding" and "Build the onboarding flow" are
 * both tasks, but they are done in completely different ways and need
 * different things recorded. The kind says which — and a meeting is the one
 * that carries extra detail. */

export interface TaskKind {
  label: string;
  Icon: typeof Hammer;
  /** Colour token, used for the chip on the board. */
  tone: string;
  hint: string;
}

export const TASK_KINDS: Record<string, TaskKind> = {
  build: {
    label: "Build",
    Icon: Hammer,
    tone: "var(--t-indigo)",
    hint: "Making or changing something",
  },
  meeting: {
    label: "Meeting",
    Icon: Users,
    tone: "var(--t-blue)",
    hint: "People together, in a room or a call",
  },
  decision: {
    label: "Decision",
    Icon: Scale,
    tone: "var(--t-amber)",
    hint: "A call that needs to be made",
  },
  research: {
    label: "Research",
    Icon: Search,
    tone: "var(--t-teal)",
    hint: "Finding something out",
  },
  review: {
    label: "Review",
    Icon: CheckCheck,
    tone: "var(--t-green)",
    hint: "Checking work someone else has done",
  },
  admin: {
    label: "Admin",
    Icon: FileText,
    tone: "var(--ink-faint)",
    hint: "Process, paperwork, coordination",
  },
};

export const DEFAULT_KIND = "build";

export function kindOf(kind: string | null | undefined): TaskKind {
  return TASK_KINDS[kind ?? ""] ?? TASK_KINDS[DEFAULT_KIND];
}

/** Only a meeting carries time, attendees and a joining link. */
export function isMeeting(kind: string | null | undefined): boolean {
  return kind === "meeting";
}

/** Formats a meeting's time range for display, e.g. "14:00 – 15:00".
 *  Returns null when there is no time set. */
export function meetingTimeRange(
  time: string | undefined,
  durationMins: number | undefined,
): string | null {
  if (!time || !/^\d{2}:\d{2}$/.test(time)) return null;
  if (!durationMins || durationMins <= 0) return time;
  const [h, m] = time.split(":").map(Number);
  const endMins = h * 60 + m + durationMins;
  const eh = Math.floor(endMins / 60) % 24;
  const em = endMins % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${time} – ${p(eh)}:${p(em)}`;
}
