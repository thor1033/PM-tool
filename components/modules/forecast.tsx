"use client";

import { useMemo, useState } from "react";
import { addDays, parseISO, differenceInCalendarDays, format } from "date-fns";
import { toast } from "sonner";
import { ChevronsRight, AlertTriangle } from "lucide-react";
import { useProject, useUpdateProject, useUpdateEntity } from "@/lib/api/hooks";
import type { Task } from "@/lib/types";
import { ModuleHeader, SectionCard } from "@/components/project/ui";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// ── types ─────────────────────────────────────────────────────────────────────

interface ForecastDoc { bufferPct: number; weighting: string }

function blankForecast(): ForecastDoc {
  return { bufferPct: 15, weighting: "duration" };
}

// ── helpers ───────────────────────────────────────────────────────────────────

function workingDays(start: string, end: string): number {
  if (!start || !end) return 0;
  const s = parseISO(start);
  const e = parseISO(end);
  const days = differenceInCalendarDays(e, s);
  if (days <= 0) return 1;
  // rough: 5/7 of calendar days
  return Math.max(1, Math.round(days * (5 / 7)));
}

function shiftDate(dateStr: string, calDays: number): string {
  if (!dateStr) return dateStr;
  return format(addDays(parseISO(dateStr), calDays), "yyyy-MM-dd");
}

/** BFS: find all tasks that are downstream of `taskId` (have it in their dep chain). */
function downstreamOf(taskId: string, tasks: Task[]): string[] {
  const visited = new Set<string>();
  const queue = [taskId];
  while (queue.length) {
    const id = queue.shift()!;
    tasks.forEach((t) => {
      if (!visited.has(t.id) && (t.deps ?? []).some((d) => d.type === "task" && d.refId === id)) {
        visited.add(t.id);
        queue.push(t.id);
      }
    });
  }
  visited.delete(taskId);
  return [...visited];
}

// ── TaskDelayRow ──────────────────────────────────────────────────────────────

function TaskDelayRow({
  task, allTasks, projectId,
}: {
  task: Task; allTasks: Task[]; projectId: string;
}) {
  const [days, setDays] = useState(0);
  const update = useUpdateEntity(projectId, "tasks");

  const downstream = useMemo(() => downstreamOf(task.id, allTasks), [task.id, allTasks]);
  const dur = workingDays(task.start, task.end);

  function apply() {
    if (!days) return;
    const calDays = Math.round(days * 7 / 5); // working → calendar days
    const affectedIds = [task.id, ...downstream];
    const byId = new Map(allTasks.map((t) => [t.id, t]));
    affectedIds.forEach((id) => {
      const t = byId.get(id);
      if (!t) return;
      update.mutate(
        { id, data: { start: shiftDate(t.start, calDays), end: shiftDate(t.end, calDays) } },
        { onError: (e) => toast.error((e as Error).message) },
      );
    });
    toast.success(`Shifted "${task.title}" + ${downstream.length} downstream task${downstream.length !== 1 ? "s" : ""} by ${days} working days.`);
    setDays(0);
  }

  const newEnd = days && task.end ? shiftDate(task.end, Math.round(days * 7 / 5)) : null;

  return (
    <tr className="group border-b last:border-0">
      <td className="py-2 pr-4">
        <span className="text-sm">{task.title}</span>
        {downstream.length > 0 && (
          <Badge variant="secondary" className="ml-2 text-[10px]">+{downstream.length} downstream</Badge>
        )}
      </td>
      <td className="py-2 pr-4 text-center text-sm text-muted-foreground">{dur} wd</td>
      <td className="py-2 pr-4 text-sm text-muted-foreground">{task.end || "—"}</td>
      <td className="py-2 pr-3">
        <div className="flex items-center gap-2">
          <Input
            type="number"
            value={days || ""}
            onChange={(e) => setDays(parseInt(e.target.value) || 0)}
            className="h-7 w-20 text-sm"
            min={-999}
            max={999}
            placeholder="0"
          />
          <span className="text-xs text-muted-foreground shrink-0">wd</span>
        </div>
      </td>
      <td className="py-2">
        {days !== 0 ? (
          <div className="flex items-center gap-2">
            <span className={cn("text-xs font-medium", days > 0 ? "text-red-600" : "text-green-600")}>
              → {newEnd}
            </span>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={apply}>
              <ChevronsRight className="size-3.5" /> Apply
            </Button>
          </div>
        ) : null}
      </td>
    </tr>
  );
}

// ── Module ────────────────────────────────────────────────────────────────────

export function ForecastModule({ projectId }: { projectId: string }) {
  const { data: ws } = useProject(projectId);
  const updateProject = useUpdateProject(projectId);

  const forecast: ForecastDoc = useMemo(() => {
    if (!ws) return blankForecast();
    const raw = ws.project.forecast as Partial<ForecastDoc> | null;
    return { bufferPct: raw?.bufferPct ?? 15, weighting: raw?.weighting ?? "duration" };
  }, [ws]);

  if (!ws) return null;

  const { tasks } = ws;
  const datedTasks = tasks.filter((t) => !t.parentId && t.start && t.end);

  // Total project span
  const allDates = datedTasks.flatMap((t) => [t.start, t.end]).filter(Boolean);
  const projectStart = allDates.length ? allDates.reduce((a, b) => (a < b ? a : b)) : null;
  const projectEnd = allDates.length ? allDates.reduce((a, b) => (a > b ? a : b)) : null;
  const baseWd = projectStart && projectEnd ? workingDays(projectStart, projectEnd) : 0;
  const bufferWd = Math.round(baseWd * (forecast.bufferPct / 100));
  const totalWd = baseWd + bufferWd;
  const bufferedEnd = projectEnd
    ? shiftDate(projectEnd, Math.round(bufferWd * 7 / 5))
    : null;

  // Progress stats
  const done = tasks.filter((t) => t.status === "done").length;
  const total = tasks.length;
  const donePct = total ? Math.round((done / total) * 100) : 0;

  function saveBuffer(pct: number) {
    updateProject.mutate(
      { forecast: { ...forecast, bufferPct: pct } },
      { onError: (e) => toast.error((e as Error).message) },
    );
  }

  return (
    <div>
      <ModuleHeader
        title="Forecast"
        description="Working-day estimates, buffer model and downstream delay controls."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Buffer slider */}
        <SectionCard title="Risk buffer" className="lg:col-span-1">
          <div className="space-y-4">
            <div>
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Buffer</span>
                <span className="text-xl font-bold">{forecast.bufferPct}%</span>
              </div>
              <Slider
                value={[forecast.bufferPct]}
                onValueChange={([v]) => saveBuffer(v)}
                min={0} max={50} step={1}
                className="w-full"
              />
              <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                <span>0%</span><span>25%</span><span>50%</span>
              </div>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Base duration</span>
                <span className="font-medium">{baseWd} wd</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Buffer (+{forecast.bufferPct}%)</span>
                <span className="font-medium text-amber-600">+{bufferWd} wd</span>
              </div>
              <div className="flex justify-between border-t pt-1.5">
                <span className="font-medium">Buffered total</span>
                <span className="font-semibold">{totalWd} wd</span>
              </div>
            </div>
          </div>
        </SectionCard>

        {/* Timeline summary */}
        <SectionCard title="Timeline estimate" className="lg:col-span-2">
          {!projectStart ? (
            <p className="text-sm text-muted-foreground">Add start and end dates to tasks to see a forecast.</p>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Stat label="Start" value={projectStart || "—"} />
                <Stat label="Baseline end" value={projectEnd || "—"} />
                <Stat label="Buffered end" value={bufferedEnd || "—"} highlight={!!bufferedEnd} />
                <Stat label="Work done" value={`${donePct}%`} />
              </div>

              {/* Visual timeline bar */}
              {projectStart && projectEnd && (
                <div>
                  <div className="relative h-8 overflow-hidden rounded-lg bg-muted">
                    {/* Done work */}
                    <div
                      className="absolute inset-y-0 left-0 bg-green-500/70 flex items-center pl-2"
                      style={{ width: `${donePct * (100 / (100 + forecast.bufferPct))}%` }}
                    />
                    {/* Remaining work */}
                    <div
                      className="absolute inset-y-0 bg-blue-400/50"
                      style={{
                        left: `${donePct * (100 / (100 + forecast.bufferPct))}%`,
                        width: `${(100 - donePct) * (100 / (100 + forecast.bufferPct))}%`,
                      }}
                    />
                    {/* Buffer zone */}
                    <div
                      className="absolute inset-y-0 right-0 bg-amber-400/40 flex items-center justify-center"
                      style={{ width: `${(forecast.bufferPct / (100 + forecast.bufferPct)) * 100}%` }}
                    >
                      <span className="text-[10px] font-medium text-amber-700">buffer</span>
                    </div>
                    {/* Today line */}
                    <TodayLine projectStart={projectStart} bufferedEnd={bufferedEnd || projectEnd} />
                  </div>
                  <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                    <span>{projectStart}</span>
                    <span>{bufferedEnd}</span>
                  </div>
                </div>
              )}

              {bufferedEnd && bufferedEnd > projectEnd! && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  <span>
                    Buffer adds <strong>{bufferWd} working days</strong>. Earliest safe end:{" "}
                    <strong>{bufferedEnd}</strong>.
                  </span>
                </div>
              )}
            </div>
          )}
        </SectionCard>
      </div>

      {/* Per-task delay controls */}
      {datedTasks.length > 0 && (
        <SectionCard title="Per-task delay" className="mt-6">
          <p className="mb-4 text-xs text-muted-foreground">
            Enter working days to shift a task and all downstream dependents. Negative = move earlier.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="pb-2 font-medium">Task</th>
                  <th className="pb-2 w-20 text-center font-medium">Duration</th>
                  <th className="pb-2 w-28 font-medium">Current end</th>
                  <th className="pb-2 w-32 font-medium">Shift by</th>
                  <th className="pb-2 font-medium">Preview</th>
                </tr>
              </thead>
              <tbody>
                {datedTasks.map((t) => (
                  <TaskDelayRow key={t.id} task={t} allTasks={tasks} projectId={projectId} />
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-sm font-semibold", highlight && "text-amber-600 dark:text-amber-400")}>{value}</p>
    </div>
  );
}

function TodayLine({ projectStart, bufferedEnd }: { projectStart: string; bufferedEnd: string }) {
  const today = format(new Date(), "yyyy-MM-dd");
  if (today < projectStart || today > bufferedEnd) return null;
  const s = new Date(projectStart).getTime();
  const e = new Date(bufferedEnd).getTime();
  const n = new Date(today).getTime();
  const pct = ((n - s) / (e - s)) * 100;
  return (
    <div className="absolute inset-y-0 w-0.5 bg-indigo-600 z-10" style={{ left: `${pct}%` }}>
      <span className="absolute -top-5 left-1 text-[9px] font-bold text-indigo-600 whitespace-nowrap">Today</span>
    </div>
  );
}
