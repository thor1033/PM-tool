"use client";

import { useMemo } from "react";
import { format, parseISO } from "date-fns";
import { Check, Plus, Flag, PencilLine, Trash2, RotateCcw } from "lucide-react";
import { useAudit } from "@/lib/api/hooks";
import { buildDigest, rollupByTrack, type DigestEvent, type TrackRollup } from "@/lib/digest";
import { accentVar } from "@/lib/colors";
import type { Task, Milestone, Category } from "@/lib/types";
import { cn } from "@/lib/utils";

/* What's happened, in two deliberately different registers.
 *
 * Today is read event by event — it's short, and the detail is the point.
 * The week is not: read the same way it's a wall of near-identical lines that
 * nobody finishes. So the week collapses to one row per track, answering
 * "which parts of the project moved" instead of "what were the last forty
 * edits". The two halves look different on purpose. */

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
      className="rounded-[var(--radius-md)] border p-3 transition"
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
      <p className="text-muted-foreground text-[11.5px] leading-snug">{parts.join(" · ")}</p>
      {row.highlights.length > 0 && (
        <p className="text-muted-foreground/80 mt-1 truncate text-[11.5px] italic">
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

  const { today, week } = useMemo(
    () => buildDigest({ activity: activity ?? [], tasks, milestones, categories }),
    [activity, tasks, milestones, categories],
  );
  const weekTracks = useMemo(() => rollupByTrack(week), [week]);

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
          {today.length > 0 && (
            <span className="text-muted-foreground text-[11.5px]">
              {today.length} {today.length === 1 ? "change" : "changes"}
            </span>
          )}
        </div>
        {today.length === 0 ? (
          <p className="text-muted-foreground py-1.5 text-[13px]">Nothing yet today.</p>
        ) : (
          // A spine down the left ties the day's events together as one thread.
          <ul className="relative max-h-[260px] overflow-y-auto before:absolute before:bottom-2 before:left-[7px] before:top-2 before:w-px before:bg-[var(--line)]">
            {today.map((ev) => (
              <TodayRow key={ev.id} ev={ev} onOpen={onOpenTask} />
            ))}
          </ul>
        )}
      </section>

      <section className="border-t pt-4">
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <h3 className="text-[12px] font-bold uppercase tracking-wide">Earlier this week</h3>
          {weekDone > 0 && (
            <span className="text-muted-foreground text-[11.5px]">
              {weekDone} completed across {weekTracks.length}{" "}
              {weekTracks.length === 1 ? "track" : "tracks"}
            </span>
          )}
        </div>
        {weekTracks.length === 0 ? (
          <p className="text-muted-foreground py-1.5 text-[13px]">Nothing else this week.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {weekTracks.map((row) => (
              <TrackRow key={row.track} row={row} color={colorOf(row.categoryId)} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
