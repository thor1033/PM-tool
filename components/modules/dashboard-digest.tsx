"use client";

import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { Check, Plus, Flag, PencilLine, Trash2, RotateCcw } from "lucide-react";
import { useAudit } from "@/lib/api/hooks";
import { buildDigest, summarise, type DigestEvent } from "@/lib/digest";
import type { Task, Milestone, Category } from "@/lib/types";
import { cn } from "@/lib/utils";

/* The front-page digest — what happened today and over the rest of the week,
 * so the team can read the state of play in one place. */

const KIND_ICON = {
  done: Check,
  create: Plus,
  milestone: Flag,
  delete: Trash2,
  reopen: RotateCcw,
  edit: PencilLine,
} as const;

const KIND_TONE: Record<string, string> = {
  done: "text-[var(--hue-done)]",
  milestone: "text-[var(--accent-c)]",
  delete: "text-[var(--t-red)]",
};

function EventRow({
  ev,
  onOpen,
}: {
  ev: DigestEvent;
  onOpen: (taskId: string) => void;
}) {
  const Icon = KIND_ICON[ev.kind as keyof typeof KIND_ICON] ?? PencilLine;
  const clickable = !!ev.taskId;

  return (
    <li
      className={cn(
        "group flex items-baseline gap-2.5 rounded-[var(--radius-sm)] px-1.5 py-[5px] transition",
        clickable && "hover:bg-[var(--paper-2)] cursor-pointer",
      )}
      onClick={clickable ? () => onOpen(ev.taskId!) : undefined}
    >
      <Icon
        className={cn(
          "size-3.5 shrink-0 translate-y-[2px]",
          KIND_TONE[ev.kind] ?? "text-muted-foreground",
        )}
      />
      <span className="min-w-0 flex-1 text-[13px] leading-snug">
        {ev.text}
        {ev.track && (
          <span className="text-muted-foreground"> · {ev.track}</span>
        )}
      </span>
      {/* Reconstructed entries know the day but not the time, so they show
          nothing rather than a time that would be invented. */}
      {ev.exact && (
        <span className="text-muted-foreground/70 shrink-0 text-[11px] tabular-nums">
          {format(parseISO(ev.ts), "HH:mm")}
        </span>
      )}
    </li>
  );
}

function Group({
  label,
  events,
  empty,
  onOpen,
  limit,
}: {
  label: string;
  events: DigestEvent[];
  empty: string;
  onOpen: (taskId: string) => void;
  limit: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? events : events.slice(0, limit);
  const hidden = events.length - shown.length;

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="text-[11px] font-bold uppercase tracking-wide">{label}</span>
        {events.length > 0 && (
          <span className="text-muted-foreground text-[11.5px]">{summarise(events)}</span>
        )}
      </div>
      {events.length === 0 ? (
        <p className="text-muted-foreground py-1 text-[13px]">{empty}</p>
      ) : (
        <ul className="-mx-1.5">
          {shown.map((ev) => (
            <EventRow key={ev.id} ev={ev} onOpen={onOpen} />
          ))}
        </ul>
      )}
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="text-muted-foreground hover:text-foreground mt-1 text-[12px] font-semibold transition"
        >
          Show {hidden} more
        </button>
      )}
    </div>
  );
}

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
    () =>
      buildDigest({
        activity: activity ?? [],
        tasks,
        milestones,
        categories,
      }),
    [activity, tasks, milestones, categories],
  );

  return (
    <div className="flex flex-col gap-4">
      <Group
        label="Today"
        events={today}
        empty="Nothing yet today."
        onOpen={onOpenTask}
        limit={6}
      />
      <div className="border-t pt-3.5">
        <Group
          label="Earlier this week"
          events={week}
          empty="Nothing else this week."
          onOpen={onOpenTask}
          limit={5}
        />
      </div>
    </div>
  );
}
