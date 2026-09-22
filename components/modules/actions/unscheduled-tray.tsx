"use client";

import { useState } from "react";
import { ChevronRight, CircleAlert } from "lucide-react";
import type { Task } from "@/lib/types";
import { isOngoing } from "@/lib/task-kinds";
import { cn } from "@/lib/utils";

/** Drag payload MIME type used to hand a task id from the tray to a
 *  Timeline/Calendar drop target that assigns it dates. */
export const UNSCHEDULED_DRAG_TYPE = "application/x-task-id";

/**
 * Work that is under way but has nowhere to sit on a dated view.
 *
 * Only in-progress tasks count. A backlog task without dates is not a mistake —
 * it is the date rules working: nothing has started, so there is nothing for a
 * start date to record, and its deadline is the milestone's. Flagging those
 * made the tray a list of every unstarted task in the project, which is noise
 * that trains people to ignore the one case that matters: someone said they
 * were working on this, and never said when it lands.
 *
 * Ongoing work is excluded for the same reason from the other direction — it
 * has no end by definition, so it can never be scheduled and would sit here
 * permanently.
 */
export function unscheduledTasks(
  tasks: Task[],
  /** Calendar only needs `end`; Timeline needs both `start` and `end`. */
  needsStart: boolean,
): Task[] {
  return tasks.filter((t) => {
    if (t.parentId) return false;
    if (t.status !== "inprogress") return false;
    if (isOngoing(t.kind)) return false;
    return needsStart ? !t.start || !t.end : !t.end;
  });
}

/**
 * A collapsed count that opens to name the tasks behind it.
 *
 * Folded by default: the alert is the count, and most of the time that is the
 * whole message. Unfolding is for when you want to act on it, so the list is
 * one click away rather than permanently occupying the space above the grid —
 * an earlier version rendered every task as a chip, which at twenty tasks
 * pushed the timeline itself off screen.
 */
export function UnscheduledTray({
  tasks, onEdit, needsStart = true,
}: {
  tasks: Task[];
  onEdit: (t: Task) => void;
  needsStart?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const missing = unscheduledTasks(tasks, needsStart);
  if (missing.length === 0) return null;

  const n = missing.length;

  return (
    <div className="mb-4 rounded-[var(--radius-lg)] border border-dashed border-[var(--t-amber)]/45 bg-[color-mix(in_oklch,var(--t-amber)_6%,var(--panel))]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12.5px] font-medium text-[var(--t-amber)]"
      >
        <CircleAlert className="size-4 shrink-0" />
        <span>
          You have {n} unscheduled {n === 1 ? "task" : "tasks"} in progress
          <span className="text-muted-foreground ml-1.5 font-normal">
            — missing {needsStart ? "a start or end date" : "an end date"}, so not shown below
          </span>
        </span>
        <ChevronRight
          className={cn(
            "ml-auto size-4 shrink-0 transition-transform motion-reduce:transition-none",
            open && "rotate-90",
          )}
        />
      </button>

      {open && (
        <div className="flex flex-wrap gap-1.5 border-t border-dashed border-[var(--t-amber)]/30 px-3 py-2.5">
          {missing.map((t) => (
            <button
              key={t.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(UNSCHEDULED_DRAG_TYPE, t.id);
                e.dataTransfer.effectAllowed = "move";
              }}
              onClick={() => onEdit(t)}
              title="Drag onto the grid to schedule, or click to set dates"
              className={cn(
                "inline-flex cursor-grab items-center gap-1.5 rounded-full border border-[var(--t-amber)]/35 bg-[var(--panel)] px-2.5 py-1 text-[12.5px] font-medium",
                "transition hover:border-[var(--t-amber)]/70 active:cursor-grabbing",
              )}
            >
              <span className="size-2 shrink-0 rounded-full border-[1.5px] border-[var(--t-amber)]" />
              {t.title || "Untitled"}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
