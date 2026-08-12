import type { Task, Milestone, Category } from "@/lib/db/schema";

/* Builds the front-page digest: what happened today, and what happened this
 * week. Two sources feed it.
 *
 * Recorded entries come from the activity log and are exact — someone did
 * that thing at that time. Derived entries are reconstructed from dates the
 * data already carries (a task's completion date, a milestone's date), which
 * is what makes the feed useful on day one instead of only after weeks of
 * use. Derived entries know the day but not the time, so they sort last
 * within their day and are never presented as precise.
 *
 * Where the two overlap — a task completed today is both recorded and
 * derivable — the recorded entry wins and the derived one is dropped, so
 * nothing is reported twice. */

export interface DigestEvent {
  id: string;
  /** ISO timestamp for recorded events; ISO date at local noon for derived. */
  ts: string;
  kind: string;
  text: string;
  actor: string;
  /** Track label, when the event belongs to one. */
  track: string | null;
  /** False for reconstructed entries, so the UI can avoid implying a time. */
  exact: boolean;
  /** Task this refers to, so the feed can open it. */
  taskId: string | null;
}

export interface ActivityRow {
  id: string;
  ts: string;
  kind: string;
  text: string;
  actor: string;
}

/** Local YYYY-MM-DD. Deliberately not toISOString(), which shifts by timezone
 *  and can put an evening edit on the wrong day. */
export function localDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Start of the week containing `d`, Monday-based. */
export function weekStart(d: Date): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (out.getDay() + 6) % 7; // Mon = 0
  out.setDate(out.getDate() - dow);
  return out;
}

/** A plain date rendered as local noon — sorts inside its own day without
 *  tipping into the next one under any timezone. */
function dayTs(day: string): string {
  return `${day}T12:00:00.000`;
}

function trackOf(task: Task | undefined, categories: Category[]): string | null {
  if (!task?.category) return null;
  return categories.find((c) => c.id === task.category)?.label ?? null;
}

/** Recorded entries mention the item by name in quotes; that's how we spot
 *  the derived duplicate of the same event. */
function mentions(text: string, title: string): boolean {
  if (!title) return false;
  return text.includes(title.length > 57 ? title.slice(0, 57) : title);
}

export function buildDigest({
  activity,
  tasks,
  milestones,
  categories,
  now = new Date(),
}: {
  activity: ActivityRow[];
  tasks: Task[];
  milestones: Milestone[];
  categories: Category[];
  now?: Date;
}): { today: DigestEvent[]; week: DigestEvent[] } {
  const today = localDay(now);
  const weekFrom = localDay(weekStart(now));

  const byId = new Map(tasks.map((t) => [t.id, t]));

  // ---- recorded ----
  const recorded: DigestEvent[] = activity.map((a) => {
    // Recorded text carries the item name; find the task it refers to so the
    // entry can show its track and stay clickable.
    const task = tasks.find((t) => t.title && mentions(a.text, t.title));
    return {
      id: a.id,
      ts: a.ts,
      kind: a.kind,
      text: a.text,
      actor: a.actor ?? "",
      track: trackOf(task, categories),
      exact: true,
      taskId: task?.id ?? null,
    };
  });

  // ---- derived ----
  const derived: DigestEvent[] = [];

  for (const t of tasks) {
    if (t.completedOn && t.completedOn >= weekFrom) {
      derived.push({
        id: `d:done:${t.id}`,
        ts: dayTs(t.completedOn),
        kind: "done",
        text: `Completed “${t.title}”`,
        actor: (t.assignees ?? [])[0] ?? "",
        track: trackOf(t, categories),
        exact: false,
        taskId: t.id,
      });
    }
    // createdAt is a real timestamp, so these are exact even though we're
    // reconstructing them from the working set rather than the log.
    const created = t.createdAt ? new Date(t.createdAt) : null;
    if (created && localDay(created) >= weekFrom) {
      derived.push({
        id: `d:new:${t.id}`,
        ts: created.toISOString(),
        kind: "create",
        text: `Added task “${t.title}”`,
        actor: "",
        track: trackOf(t, categories),
        exact: true,
        taskId: t.id,
      });
    }
  }

  for (const m of milestones) {
    if (m.date && m.date >= weekFrom && m.date <= today) {
      const track = m.category
        ? categories.find((c) => c.id === m.category)?.label ?? null
        : null;
      derived.push({
        id: `d:ms:${m.id}`,
        ts: dayTs(m.date),
        kind: "milestone",
        text: `Milestone “${m.title}” reached`,
        actor: "",
        track,
        exact: false,
        taskId: null,
      });
    }
  }

  // ---- merge, dropping derived events the log already covers ----
  const covered = new Set<string>();
  for (const r of recorded) {
    const t = r.taskId ? byId.get(r.taskId) : null;
    if (!t) continue;
    const day = localDay(new Date(r.ts));
    if (r.kind === "done") covered.add(`d:done:${t.id}`);
    if (r.kind === "create" && day === localDay(new Date(t.createdAt ?? r.ts))) {
      covered.add(`d:new:${t.id}`);
    }
  }

  const all = [...recorded, ...derived.filter((d) => !covered.has(d.id))].sort(
    (a, b) => {
      const dayA = localDay(new Date(a.ts));
      const dayB = localDay(new Date(b.ts));
      if (dayA !== dayB) return dayB.localeCompare(dayA);
      // Within a day: precise entries above reconstructed ones, then newest.
      if (a.exact !== b.exact) return a.exact ? -1 : 1;
      return +new Date(b.ts) - +new Date(a.ts);
    },
  );

  return {
    today: all.filter((e) => localDay(new Date(e.ts)) === today),
    week: all.filter((e) => {
      const day = localDay(new Date(e.ts));
      return day >= weekFrom && day < today;
    }),
  };
}

/** One-line roll-up of a set of events, e.g. "3 completed · 2 added". */
export function summarise(events: DigestEvent[]): string {
  const n = (k: string) => events.filter((e) => e.kind === k).length;
  const parts: string[] = [];
  const done = n("done");
  const created = n("create");
  const ms = n("milestone");
  const edits = events.length - done - created - ms - n("delete") - n("reopen");
  if (done) parts.push(`${done} completed`);
  if (created) parts.push(`${created} added`);
  if (ms) parts.push(`${ms} milestone${ms > 1 ? "s" : ""}`);
  if (edits > 0) parts.push(`${edits} update${edits > 1 ? "s" : ""}`);
  return parts.join(" · ");
}
