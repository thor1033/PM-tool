"use client";

import { useMemo, useState } from "react";
import type { Task, WorkingSet, Milestone } from "@/lib/types";
import { accentVar } from "@/lib/colors";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

function key(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const WD = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function CalendarView({
  ws, filtered, onEdit, onEditMilestone,
}: {
  ws: WorkingSet; filtered: Task[]; onEdit: (t: Task) => void; onEditMilestone: (m: Milestone) => void;
}) {
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d; });
  const year = cursor.getFullYear(), month = cursor.getMonth();
  const monthLabel = cursor.toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  const days = useMemo(() => {
    const first = new Date(year, month, 1);
    const startOffset = (first.getDay() + 6) % 7; // Monday-first
    const gridStart = new Date(year, month, 1 - startOffset);
    return [...Array(42)].map((_, i) => { const d = new Date(gridStart); d.setDate(gridStart.getDate() + i); return d; });
  }, [year, month]);

  const byDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    filtered.filter((t) => t.end).forEach((t) => {
      const k = t.end.slice(0, 10);
      const arr = map.get(k) ?? [];
      arr.push(t);
      map.set(k, arr);
    });
    return map;
  }, [filtered]);

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
              const inMonth = day.getMonth() === month;
              const isToday = k === todayKey;
              return (
                <div key={k} className={cn("min-h-[120px] border-r p-2 last:border-0", !inMonth && "bg-[var(--paper-2)]/50")}>
                  <div className={cn(
                    "mb-1.5 flex size-6 items-center justify-center rounded-full font-mono text-[13px] font-medium",
                    isToday ? "bg-primary text-primary-foreground" : !inMonth ? "text-muted-foreground/40" : "text-foreground",
                  )}>
                    {day.getDate()}
                  </div>
                  <div className="space-y-1">
                    {mss.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => onEditMilestone(m)}
                        className={cn(
                          "flex w-full items-center gap-1 truncate rounded px-1.5 py-1 text-left text-[11.5px] font-semibold",
                          m.type === "gate" ? "bg-[color-mix(in_oklch,var(--t-red)_14%,var(--panel))] text-[var(--t-red)]" : "bg-[var(--accent-soft)] text-[var(--accent-deep)]",
                        )}
                      >
                        {m.type === "gate" ? "▐" : "◆"} {m.title}
                      </button>
                    ))}
                    {tasks.slice(0, 3).map((t) => {
                      const cat = t.category ? catMap.get(t.category) : null;
                      const overdue = t.status !== "done" && k < todayKey;
                      return (
                        <button
                          key={t.id}
                          onClick={() => onEdit(t)}
                          className="w-full truncate rounded px-1.5 py-1 text-left text-[11.5px] leading-tight"
                          style={{
                            background: overdue ? "color-mix(in oklch, var(--t-red) 14%, var(--panel))" : cat ? `color-mix(in oklch, ${accentVar(cat.color)} 16%, var(--panel))` : "var(--paper-2)",
                            color: overdue ? "var(--t-red)" : cat ? accentVar(cat.color) : "var(--ink-soft)",
                          }}
                        >
                          {t.title}
                        </button>
                      );
                    })}
                    {tasks.length > 3 && <p className="text-muted-foreground pl-1 text-[11.5px]">+{tasks.length - 3} more</p>}
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
