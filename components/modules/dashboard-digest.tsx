"use client";

import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { Check, Plus, Flag, PencilLine, Trash2, RotateCcw, Sparkles } from "lucide-react";
import { useAudit, useDigestSummary } from "@/lib/api/hooks";
import { buildDigest, rollupByTrack, type DigestEvent, type TrackRollup } from "@/lib/digest";
import { accentVar } from "@/lib/colors";
import type { Task, Milestone, Category } from "@/lib/types";
import { cn } from "@/lib/utils";

/* What's happened, in two deliberately different registers.
 *
 * Today is written up by track: the raw log records every field change, so a
 * single piece of work lands as "added", "renamed", "moved" and "rescheduled"
 * on four lines. A reader wants to know what moved, not how many times it was
 * saved, so the day's entries are summarised into a couple of bullets per
 * track. The raw thread is still one click away, and is what shows when the
 * summary can't be produced.
 *
 * The week is counted rather than written: over seven days the useful question
 * is which parts of the project moved and by how much. The two halves look
 * different on purpose. */

const KIND_ICON = {
  done: Check,
  create: Plus,
  milestone: Flag,
  delete: Trash2,
  reopen: RotateCcw,
  edit: PencilLine,
} as const;

const KIND_TONE: Record<string, string> = {
  done: "var(--hue-done)",
  create: "var(--t-blue)",
  milestone: "var(--accent-c)",
  delete: "var(--t-red)",
  reopen: "var(--t-amber)",
};

/** Rows shown before the day's list is collapsed. */
const TODAY_LIMIT = 6;

function toneOf(kind: string) {
  return KIND_TONE[kind] ?? "var(--ink-faint)";
}

// ── today ───────────────────────────────────────────────────────────────────

function TodayRow({
  ev,
  onOpen,
}: {
  ev: DigestEvent;
  onOpen: (taskId: string) => void;
}) {
  const Icon = KIND_ICON[ev.kind as keyof typeof KIND_ICON] ?? PencilLine;
  const tone = toneOf(ev.kind);
  const clickable = !!ev.taskId;

  return (
    <li
      className={cn(
        "group relative flex items-start gap-3 py-2 pl-6",
        clickable && "cursor-pointer",
      )}
      onClick={clickable ? () => onOpen(ev.taskId!) : undefined}
    >
      {/* Dot on the spine, tinted by what kind of thing happened. */}
      <span
        className="absolute left-0 top-[11px] flex size-[15px] items-center justify-center rounded-full ring-[3px] ring-[var(--panel)]"
        style={{ background: `color-mix(in oklch, ${tone} 16%, var(--panel))` }}
      >
        <Icon className="size-2.5" style={{ color: tone }} />
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block text-[13px] leading-snug",
            clickable && "group-hover:underline decoration-[var(--line-strong)] underline-offset-2",
          )}
        >
          {ev.text}
        </span>
        {ev.track && (
          <span className="text-muted-foreground mt-0.5 block text-[11px]">{ev.track}</span>
        )}
      </span>
      {ev.exact && (
        <span className="text-muted-foreground/60 shrink-0 pt-px text-[11px] tabular-nums">
          {format(parseISO(ev.ts), "HH:mm")}
        </span>
      )}
    </li>
  );
}

// ── today, summarised by track ───────────────────────────────────────────────

function SummaryCard({
  track,
  points,
  color,
}: {
  track: string;
  points: string[];
  color: string;
}) {
  return (
    <li
      className="min-w-0 overflow-hidden rounded-[var(--radius-md)] border p-3"
      style={{
        borderColor: `color-mix(in oklch, ${color} 26%, var(--line))`,
        background: `color-mix(in oklch, ${color} 5%, var(--panel))`,
      }}
    >
      <div className="mb-1.5 flex min-w-0 items-center gap-1.5">
        <span className="size-2 shrink-0 rounded-full" style={{ background: color }} />
        <span className="truncate text-[13px] font-semibold">{track}</span>
      </div>
      <ul className="flex flex-col gap-1">
        {points.map((p, i) => (
          <li key={i} className="flex min-w-0 gap-2 text-[12.5px] leading-snug">
            {/* A bullet drawn as a glyph rather than list-style, so the text
                wraps flush under itself instead of under the marker. */}
            <span
              className="mt-[7px] size-1 shrink-0 rounded-full"
              style={{ background: `color-mix(in oklch, ${color} 55%, var(--ink-faint))` }}
            />
            <span className="min-w-0">{p}</span>
          </li>
        ))}
      </ul>
    </li>
  );
}

// ── the week, by track ──────────────────────────────────────────────────────

function TrackRow({
  row,
  color,
}: {
  row: TrackRollup;
  color: string;
}) {
  const parts: string[] = [];
  if (row.done) parts.push(`${row.done} completed`);
  if (row.added) parts.push(`${row.added} added`);
  if (row.milestones) parts.push(`${row.milestones} milestone${row.milestones > 1 ? "s" : ""}`);
  if (row.updates) parts.push(`${row.updates} update${row.updates > 1 ? "s" : ""}`);

  return (
    <li
      className="min-w-0 overflow-hidden rounded-[var(--radius-md)] border p-3 transition"
      style={{
        borderColor: `color-mix(in oklch, ${color} 26%, var(--line))`,
        background: `color-mix(in oklch, ${color} 5%, var(--panel))`,
      }}
    >
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="size-2 shrink-0 rounded-full" style={{ background: color }} />
          <span className="truncate text-[13px] font-semibold">{row.track}</span>
        </span>
        <span
          className="shrink-0 text-[12px] font-semibold tabular-nums"
          style={{ color: `color-mix(in oklch, ${color} 70%, var(--ink))` }}
        >
          {row.total}
        </span>
      </div>
      <p className="text-muted-foreground min-w-0 truncate text-[11.5px] leading-snug">
        {parts.join(" · ")}
      </p>
      {row.highlights.length > 0 && (
        <p
          className="text-muted-foreground/80 mt-1 min-w-0 truncate text-[11.5px] italic"
          title={row.highlights.join(", ")}
        >
          {row.highlights.join(", ")}
        </p>
      )}
    </li>
  );
}

// ── shell ───────────────────────────────────────────────────────────────────

export function DigestFeed({
  projectId,
  tasks,
  milestones,
  categories,
  onOpenTask,
}: {
  projectId: string;
  tasks: Task[];
  milestones: Milestone[];
  categories: Category[];
  onOpenTask: (taskId: string) => void;
}) {
  const { data: activity } = useAudit(projectId);
  const [allToday, setAllToday] = useState(false);
  const [showThread, setShowThread] = useState(false);

  const { today, week } = useMemo(
    () => buildDigest({ activity: activity ?? [], tasks, milestones, categories }),
    [activity, tasks, milestones, categories],
  );
  const weekTracks = useMemo(() => rollupByTrack(week), [week]);

  // Today's entries grouped by the track the digest already resolved them to,
  // which is what the summariser is asked to write up. Order is stable so the
  // request signature doesn't change when nothing has.
  const todayByTrack = useMemo(() => {
    const map = new Map<string, { categoryId: string | null; lines: string[] }>();
    for (const ev of today) {
      const track = ev.track ?? "No track";
      const entry = map.get(track) ?? { categoryId: ev.categoryId, lines: [] };
      entry.lines.push(ev.text);
      map.set(track, entry);
    }
    return [...map.entries()].map(([track, v]) => ({ track, ...v }));
  }, [today]);

  const summaryInput = useMemo(
    () => todayByTrack.map(({ track, lines }) => ({ track, lines })),
    [todayByTrack],
  );
  const { data: summary, isPending: summaryPending } = useDigestSummary(projectId, summaryInput);

  const catIdFor = (track: string) =>
    todayByTrack.find((t) => t.track === track)?.categoryId ?? null;

  // Falling back to the raw thread when the summary can't be produced: a day
  // that had activity must never render as though it were quiet.
  const showRaw = showThread || (!summaryPending && (summary?.unavailable ?? true));

  const shownToday = allToday ? today : today.slice(0, TODAY_LIMIT);

  const colorOf = (categoryId: string | null) =>
    categoryId
      ? accentVar(categories.find((c) => c.id === categoryId)?.color)
      : "var(--ink-ghost)";

  const weekDone = weekTracks.reduce((n, r) => n + r.done, 0);

  return (
    <div className="flex flex-col gap-5">
      <section>
        <div className="mb-1.5 flex items-baseline justify-between gap-3">
          <h3 className="text-[12px] font-bold uppercase tracking-wide">Today</h3>
          {today.length > 0 &&
            (showRaw ? (
              <span className="text-muted-foreground text-[11.5px]">
                {today.length} {today.length === 1 ? "change" : "changes"}
              </span>
            ) : (
              // Marked as written rather than recorded: these bullets are a
              // paraphrase, and the reader is owed that distinction.
              <span className="text-muted-foreground flex items-center gap-1 text-[11.5px]">
                <Sparkles className="size-3" />
                Summarised
              </span>
            ))}
        </div>
        {today.length === 0 ? (
          <p className="text-muted-foreground py-1.5 text-[13px]">Nothing yet today.</p>
        ) : summaryPending && !showThread ? (
          // Placeholders sized like the cards they become, so the panel does
          // not jump when the summary lands.
          <ul className="flex animate-pulse flex-col gap-2" aria-label="Summarising today">
            {todayByTrack.slice(0, 2).map((t) => (
              <li key={t.track} className="h-[68px] rounded-[var(--radius-md)] border bg-[var(--paper-2)]" />
            ))}
          </ul>
        ) : showRaw ? (
          <>
            {/* A spine down the left ties the day's events into one thread.
                Capped by row count rather than height: a pixel cap sliced the
                last entry through the middle, which reads as broken. */}
            <ul className="relative before:absolute before:bottom-2 before:left-[7px] before:top-2 before:w-px before:bg-[var(--line)]">
              {shownToday.map((ev) => (
                <TodayRow key={ev.id} ev={ev} onOpen={onOpenTask} />
              ))}
            </ul>
            <div className="mt-1 flex items-center gap-3 pl-6">
              {today.length > shownToday.length && (
                <button
                  type="button"
                  onClick={() => setAllToday(true)}
                  className="text-muted-foreground hover:text-foreground text-[12px] font-semibold transition"
                >
                  Show {today.length - shownToday.length} more
                </button>
              )}
              {showThread && (
                <button
                  type="button"
                  onClick={() => setShowThread(false)}
                  className="text-muted-foreground hover:text-foreground text-[12px] font-semibold transition"
                >
                  Back to summary
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <ul className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2">
              {(summary?.summary ?? []).map((row) => (
                <SummaryCard
                  key={row.track}
                  track={row.track}
                  points={row.points}
                  color={colorOf(catIdFor(row.track))}
                />
              ))}
            </ul>
            {/* The summary is a rewrite, so the entries it was built from stay
                reachable — and they're the only place a task can be opened. */}
            <button
              type="button"
              onClick={() => setShowThread(true)}
              className="text-muted-foreground hover:text-foreground mt-2 text-[12px] font-semibold transition"
            >
              See all {today.length} {today.length === 1 ? "change" : "changes"}
            </button>
          </>
        )}
      </section>

      <section className="border-t pt-4">
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <h3 className="text-[12px] font-bold uppercase tracking-wide">Previous 7 days</h3>
          {weekDone > 0 && (
            <span className="text-muted-foreground text-[11.5px]">
              {weekDone} completed across {weekTracks.length}{" "}
              {weekTracks.length === 1 ? "track" : "tracks"}
            </span>
          )}
        </div>
        {weekTracks.length === 0 ? (
          <p className="text-muted-foreground py-1.5 text-[13px]">Nothing else in the last week.</p>
        ) : (
          <ul className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2">
            {weekTracks.map((row) => (
              <TrackRow key={row.track} row={row} color={colorOf(row.categoryId)} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
