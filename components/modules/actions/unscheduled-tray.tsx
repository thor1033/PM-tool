"use client";

import { CircleAlert } from "lucide-react";
import type { Task } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Drag payload MIME type used to hand a task id from the tray to a
 *  Timeline/Calendar drop target that assigns it dates. */
export const UNSCHEDULED_DRAG_TYPE = "application/x-task-id";

/** Persistent panel listing tasks that can't be placed on the Timeline or
 *  Calendar because they're missing a start and/or end date — instead of
 *  silently disappearing, they stay visible here (with a red-circle flag)
 *  and can be dragged onto the grid or clicked open to fix the dates. */
export function UnscheduledTray({
  tasks, onEdit, needsStart = true,
}: {
  tasks: Task[];
  onEdit: (t: Task) => void;
  /** Calendar only needs `end`; Timeline needs both `start` and `end`. */
  needsStart?: boolean;
}) {
  if (tasks.length === 0) return null;

  return (
    <div className="mb-4 rounded-[var(--radius-lg)] border border-dashed border-[var(--t-red)]/40 bg-[color-mix(in_oklch,var(--t-red)_5%,var(--panel))] p-3">
      <div className="mb-2 flex items-center gap-1.5 text-[12.5px] font-medium text-[var(--t-red)]">
        <CircleAlert className="size-4" />
        {tasks.length} unscheduled {tasks.length === 1 ? "task" : "tasks"} — missing {needsStart ? "start/end date" : "end date"}, not shown below
      </div>
      <div className="flex flex-wrap gap-1.5">
        {tasks.map((t) => (
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
              "inline-flex cursor-grab items-center gap-1.5 rounded-full border border-[var(--t-red)]/30 bg-[var(--panel)] px-2.5 py-1 text-[12.5px] font-medium",
              "transition hover:border-[var(--t-red)]/60 active:cursor-grabbing",
            )}
          >
            <span className="size-2 shrink-0 rounded-full border-[1.5px] border-[var(--t-red)]" />
            {t.title}
          </button>
        ))}
      </div>
    </div>
  );
}
