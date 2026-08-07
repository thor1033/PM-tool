"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useUpdateEntity } from "@/lib/api/hooks";
import type { Task, WorkingSet, Milestone } from "@/lib/types";
import { accentVar } from "@/lib/colors";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { UnscheduledTray, UNSCHEDULED_DRAG_TYPE } from "@/components/modules/actions/unscheduled-tray";

function key(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const WD = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function CalendarView({
  ws, projectId, filtered, onEdit, onEditMilestone,
}: {
  ws: WorkingSet; projectId: string; filtered: Task[]; onEdit: (t: Task) => void; onEditMilestone: (m: Milestone) => void;
}) {
  const updateTask = useUpdateEntity(projectId, "tasks");
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d; });
  const year = cursor.getFullYear(), month = cursor.getMonth();
  const monthLabel = cursor.toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  const days = useMemo(() => {
    const first = new Date(year, month, 1);
    const startOffset = (first.getDay() + 6) % 7; // Monday-first
    const gridStart = new Date(year, month, 1 - startOffset);
    return [...Array(42)].map((_, i) => { const d = new Date(gridStart); d.setDate(gridStart.getDate() + i); return d; });
  }, [year, month]);

  // Every task with an end date is placed on its end day. Tasks that also
  // have a distinct start date get a second, separately-labelled entry on
  // their start day so both ends of the span are visible on the grid.
  type DayEntry = { task: Task; label: "start" | "end" | null };
  const byDay = useMemo(() => {
    const map = new Map<string, DayEntry[]>();
    const push = (k: string, entry: DayEntry) => {
      const arr = map.get(k) ?? [];
      arr.push(entry);
      map.set(k, arr);
    };
    filtered.filter((t) => t.end).forEach((t) => {
      const hasDistinctStart = !!t.start && t.start !== t.end;
      push(t.end.slice(0, 10), { task: t, label: hasDistinctStart ? "end" : null });
      if (hasDistinctStart) push(t.start.slice(0, 10), { task: t, label: "start" });
    });
    return map;
  }, [filtered]);

  const undated = useMemo(() => filtered.filter((t) => !t.parentId && !t.end), [filtered]);

  function scheduleOnDay(taskId: string, dayKey: string) {
    updateTask.mutate(
      { id: taskId, data: { end: dayKey } },
      { onError: (err) => toast.error((err as Error).message) },
    );
  }

  const msByDay = useMemo(() => {
    const map = new Map<string, Milestone[]>();
    ws.milestones.filter((m) => m.date).forEach((m) => {
      const k = m.date.slice(0, 10);
      const arr = map.get(k) ?? [];
      arr.push(m);
      map.set(k, arr);
    });
    return map;
  }, [ws.milestones]);

  const todayKey = key(new Date());
  const catMap = new Map(ws.categories.map((c) => [c.id, c]));

  function step(n: number) { setCursor(new Date(year, month + n, 1)); }
  function today() { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); setCursor(d); }

  return (
    <div>
      <UnscheduledTray tasks={undated} onEdit={onEdit} needsStart={false} />

      <div className="mb-5 flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => step(-1)}>←</Button>
        <span className="font-serif-display min-w-[180px] text-center text-[18px] font-medium">{monthLabel}</span>
        <Button variant="outline" size="sm" onClick={() => step(1)}>→</Button>
        <Button variant="ghost" size="sm" onClick={today}>Today</Button>
      </div>
      <div className="overflow-hidden rounded-[var(--radius-lg)] border">
        <div className="grid grid-cols-7 border-b bg-[var(--paper-2)]">
          {WD.map((d) => <div key={d} className="text-muted-foreground py-2.5 text-center font-mono text-[11.5px] font-medium uppercase tracking-wide">{d}</div>)}
        </div>
        {[0, 1, 2, 3, 4, 5].map((week) => (
          <div key={week} className="grid grid-cols-7 border-b last:border-0">
            {days.slice(week * 7, week * 7 + 7).map((day) => {
              const k = key(day);
              const tasks = byDay.get(k) ?? [];
              const mss = msByDay.get(k) ?? [];
              const gates = mss.filter((m) => m.type === "gate");
              const milestones = mss.filter((m) => m.type !== "gate");
              const inMonth = day.getMonth() === month;
              const isToday = k === todayKey;
              return (
                <div
                  key={k}
                  className={cn(
                    "relative flex min-h-[120px] gap-1.5 border-r p-2 last:border-0",
                    !inMonth && "bg-[var(--paper-2)]/50",
                  )}
                  onDragOver={(e) => { if (e.dataTransfer.types.includes(UNSCHEDULED_DRAG_TYPE)) e.preventDefault(); }}
                  onDrop={(e) => {
                    const taskId = e.dataTransfer.getData(UNSCHEDULED_DRAG_TYPE);
                    if (!taskId) return;
                    e.preventDefault();
                    scheduleOnDay(taskId, k);
                  }}
                >
                  {gates.length > 0 && (
                    <div className="-my-2 -ml-2 flex shrink-0 gap-0.5">
                      {gates.map((g) => (
                        <button
                          key={g.id}
                          onClick={() => onEditMilestone(g)}
                          title={`${g.title} (gate)`}
                          className="w-2 shrink-0 bg-[var(--t-red)] transition hover:w-2.5"
                        />
                      ))}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className={cn(
                      "mb-1.5 flex size-6 items-center justify-center rounded-full font-mono text-[13px] font-medium",
                      isToday ? "bg-primary text-primary-foreground" : !inMonth ? "text-muted-foreground/40" : "text-foreground",
                    )}>
                      {day.getDate()}
                    </div>
                    {gates.length > 0 && (
                      <div className="mb-1 space-y-0.5">
                        {gates.map((g) => (
                          <button
                            key={g.id}
                            onClick={() => onEditMilestone(g)}
                            className="block w-full truncate text-left text-[11.5px] font-bold uppercase tracking-wide text-[var(--t-red)]"
                          >
                            {g.title}
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="space-y-1">
                      {milestones.map((m) => (
                        <button
                          key={m.id}
                          onClick={() => onEditMilestone(m)}
                          className="flex w-full items-center gap-1 truncate rounded bg-[var(--accent-soft)] px-1.5 py-1 text-left text-[11.5px] font-semibold text-[var(--accent-deep)]"
                        >
                          ◆ {m.title}
                        </button>
                      ))}
                      {tasks.slice(0, 3).map(({ task: t, label }) => {
                        const cat = t.category ? catMap.get(t.category) : null;
                        const overdue = t.status !== "done" && k < todayKey;
                        return (
                          <button
                            key={`${t.id}-${label ?? "single"}`}
                            onClick={() => onEdit(t)}
                            className="w-full truncate rounded px-1.5 py-1 text-left text-[11.5px] leading-tight"
                            style={{
                              background: overdue ? "color-mix(in oklch, var(--t-red) 14%, var(--panel))" : cat ? `color-mix(in oklch, ${accentVar(cat.color)} 16%, var(--panel))` : "var(--paper-2)",
                              color: overdue ? "var(--t-red)" : cat ? accentVar(cat.color) : "var(--ink-soft)",
                            }}
                          >
                            {label === "start" ? `(Start) ${t.title}` : label === "end" ? `(End) ${t.title}` : t.title}
                          </button>
                        );
                      })}
                      {tasks.length > 3 && <p className="text-muted-foreground pl-1 text-[11.5px]">+{tasks.length - 3} more</p>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
