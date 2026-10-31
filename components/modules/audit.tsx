"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { format, isToday, isYesterday, parseISO, isThisWeek } from "date-fns";
import {
  Check, Plus, Trash2, RotateCcw, PencilLine, BotMessageSquare,
  Zap, Bell, History, ChevronDown, ChevronRight, Flag,
} from "lucide-react";
import { useAudit, useProject } from "@/lib/api/hooks";
import { collectEvents, localDay, type DigestEvent } from "@/lib/digest";
import { ModuleHeader } from "@/components/project/ui";
import { cn } from "@/lib/utils";

/* The audit trail, read the way a browser history is read: newest first,
 * grouped by day, every entry in place. There is no search box — you don't
 * search a history to find out what happened yesterday, you scroll to
 * yesterday. Filtering is by kind of change instead, which is the question
 * people actually arrive with ("what got deleted?").
 *
 * The entries are the same ones the front page's "Today" shows: the recorded
 * log plus what can be read off the tasks' own dates (a completion date, a
 * creation time). Those reconstructed entries know the day but not always the
 * hour, so they show no time. */

type ActivityEntry = DigestEvent;

/** How far back the trail is kept — matches the pruning in the audit route. */
const KEPT_DAYS = 35;

// ── kinds ────────────────────────────────────────────────────────────────────

/** Must stay in step with ActivityKind in lib/activity-describe.ts — the
 *  recorder emits done/create/delete/edit/reopen, and anything missing here
 *  silently renders as a generic edit. */
const KIND_META: Record<string, { label: string; icon: typeof Check; tone: string }> = {
  done: { label: "Completed", icon: Check, tone: "var(--hue-done)" },
  create: { label: "Added", icon: Plus, tone: "var(--t-blue)" },
  delete: { label: "Deleted", icon: Trash2, tone: "var(--t-red)" },
  reopen: { label: "Reopened", icon: RotateCcw, tone: "var(--t-amber)" },
  edit: { label: "Edited", icon: PencilLine, tone: "var(--ink-faint)" },
  import: { label: "Plan update", icon: BotMessageSquare, tone: "var(--accent-c)" },
  automation: { label: "Automation", icon: Zap, tone: "var(--t-amber)" },
  reminder: { label: "Reminder", icon: Bell, tone: "var(--t-blue)" },
  milestone: { label: "Milestone", icon: Flag, tone: "var(--accent-c)" },
};

function kindMeta(kind: string) {
  return KIND_META[kind] ?? KIND_META.edit;
}

/** Heading for a day, the way a browser labels history sections. */
function dayLabel(ts: string): string {
  const d = parseISO(ts);
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  if (isThisWeek(d, { weekStartsOn: 1 })) return format(d, "EEEE");
  return format(d, "EEEE, d MMMM");
}

// ── rows ─────────────────────────────────────────────────────────────────────

function EntryRow({ entry, onOpen }: { entry: ActivityEntry; onOpen: (taskId: string) => void }) {
  const meta = kindMeta(entry.kind);
  const Icon = meta.icon;
  const taskId = entry.taskId;

  return (
    <li
      className={cn(
        "group flex items-baseline gap-3 py-[7px] pl-1 pr-2 transition hover:bg-[var(--paper-2)]",
        taskId && "cursor-pointer",
      )}
      onClick={taskId ? () => onOpen(taskId) : undefined}
      title={taskId ? "Open the task" : undefined}
    >
      <span
        className="text-muted-foreground w-[42px] shrink-0 text-right font-mono text-[11px] tabular-nums"
        title={entry.exact ? undefined : "Read off the task's dates: the day is known, the time is not"}
      >
        {entry.exact ? format(parseISO(entry.ts), "HH:mm") : "—"}
      </span>
      <span
        className="flex size-[18px] shrink-0 translate-y-[3px] items-center justify-center rounded-full"
        style={{ background: `color-mix(in oklch, ${meta.tone} 15%, var(--panel))` }}
        title={meta.label}
      >
        <Icon className="size-[11px]" style={{ color: meta.tone }} />
      </span>
      <span
        className={cn(
          "min-w-0 flex-1 text-[13px] leading-snug",
          taskId && "group-hover:underline decoration-[var(--line-strong)] underline-offset-2",
        )}
      >
        {entry.text}
      </span>
      {entry.actor && (
        <span className="text-muted-foreground hidden shrink-0 text-[11.5px] sm:block">
          {entry.actor}
        </span>
      )}
    </li>
  );
}

function DaySection({
  label, entries, defaultOpen, onOpen,
}: {
  label: string; entries: ActivityEntry[]; defaultOpen: boolean; onOpen: (taskId: string) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="mb-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-1 py-2 text-left transition hover:bg-[var(--paper-2)]"
      >
        {open ? (
          <ChevronDown className="text-muted-foreground size-3.5 shrink-0" />
        ) : (
          <ChevronRight className="text-muted-foreground size-3.5 shrink-0" />
        )}
        <h3 className="text-[13px] font-bold tracking-tight">{label}</h3>
        <span className="text-muted-foreground font-mono text-[11px]">
          {entries.length} change{entries.length === 1 ? "" : "s"}
        </span>
        <span className="ml-1 h-px flex-1 bg-[var(--line)]" />
      </button>
      {open && <ul className="mb-2 ml-1 border-l pl-2">{entries.map((e) => <EntryRow key={e.id} entry={e} onOpen={onOpen} />)}</ul>}
    </section>
  );
}

// ── module ───────────────────────────────────────────────────────────────────

export function AuditModule({ projectId }: { projectId: string }) {
  const { data: activity, isLoading } = useAudit(projectId);
  const { data: project } = useProject(projectId);
  const router = useRouter();
  const [kinds, setKinds] = useState<string[]>([]);

  const entries = useMemo(() => {
    const from = new Date();
    from.setDate(from.getDate() - KEPT_DAYS);
    return collectEvents({
      activity: activity ?? [],
      tasks: project?.tasks ?? [],
      milestones: project?.milestones ?? [],
      categories: project?.categories ?? [],
      from: localDay(from),
    });
  }, [activity, project]);

  // The task opens where it lives, as it does from the front page.
  const openTask = (taskId: string) => router.push(`/projects/${projectId}/actions?task=${taskId}`);

  // Only offer filters for kinds actually present, so the control never
  // advertises a category this project has never produced.
  const present = useMemo(() => {
    const counts = new Map<string, number>();
    entries.forEach((e) => counts.set(e.kind, (counts.get(e.kind) ?? 0) + 1));
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [entries]);

  const shown = useMemo(
    () => (kinds.length ? entries.filter((e) => kinds.includes(e.kind)) : entries),
    [entries, kinds],
  );

  const days = useMemo(() => {
    const map = new Map<string, ActivityEntry[]>();
    // Already newest day first, timed entries above reconstructed ones.
    shown.forEach((e) => {
      const label = dayLabel(e.ts);
      const arr = map.get(label) ?? [];
      arr.push(e);
      map.set(label, arr);
    });
    return [...map.entries()];
  }, [shown]);

  function toggle(kind: string) {
    setKinds((k) => (k.includes(kind) ? k.filter((x) => x !== kind) : [...k, kind]));
  }

  return (
    <div>
      <ModuleHeader
        title="Audit trail"
        description="Every change, newest first and grouped by day. Click one to open its task. Kept for five weeks."
      />

      {present.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setKinds([])}
            className={cn(
              "rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition",
              kinds.length === 0 ? "bg-foreground text-background border-foreground" : "hover:bg-muted",
            )}
          >
            Everything
          </button>
          {present.map(([kind, n]) => {
            const meta = kindMeta(kind);
            const Icon = meta.icon;
            const on = kinds.includes(kind);
            return (
              <button
                key={kind}
                type="button"
                onClick={() => toggle(kind)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition",
                  on ? "bg-foreground text-background border-foreground" : "hover:bg-muted",
                )}
              >
                <Icon className="size-3" style={{ color: on ? undefined : meta.tone }} />
                {meta.label}
                <span className={cn("font-mono text-[11px]", !on && "text-muted-foreground")}>{n}</span>
              </button>
            );
          })}
        </div>
      )}

      {isLoading && <p className="text-muted-foreground text-[13px]">Loading…</p>}

      {!isLoading && entries.length === 0 && (
        <div className="flex flex-col items-center rounded-[var(--radius-lg)] border border-dashed p-16 text-center">
          <History className="text-muted-foreground/40 mb-3 size-8" />
          <p className="font-serif-display text-[17px]">No history yet</p>
          <p className="text-muted-foreground mt-1.5 max-w-sm text-[13px] leading-relaxed">
            Changes are recorded from the moment they happen — edits, completions, new work and
            deletions all land here. Anything done before recording started is not shown.
          </p>
        </div>
      )}

      {!isLoading && entries.length > 0 && days.length === 0 && (
        <p className="text-muted-foreground py-6 text-[13px]">
          Nothing matches that filter.
        </p>
      )}

      {days.map(([label, list], i) => (
        // Recent days open, older ones collapsed — the same shape a browser
        // history takes, so a long trail stays scannable.
        <DaySection key={label} label={label} entries={list} defaultOpen={i < 3} onOpen={openTask} />
      ))}
    </div>
  );
}
