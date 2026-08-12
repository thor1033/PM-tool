"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronsRight, CheckCircle2, CalendarOff, TrendingUp } from "lucide-react";
import { useProject, useUpdateProject, useUpdateEntity } from "@/lib/api/hooks";
import {
  computeForecast, downstreamOf, workingDays, shiftDate, slipOf, WD_TO_CAL,
  type Forecast,
} from "@/lib/forecast";
import type { Task } from "@/lib/types";
import { ModuleHeader, SectionCard } from "@/components/project/ui";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/* The forecast is about work that is left, and it is judged against what
 * actually happened. The calculation lives in lib/forecast.ts; this file is
 * presentation only. */

interface ForecastDoc { bufferPct: number; weighting: string }

// ── per-task delay ───────────────────────────────────────────────────────────

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
    const calDays = Math.round(days * WD_TO_CAL);
    const byId = new Map(allTasks.map((t) => [t.id, t]));
    [task.id, ...downstream].forEach((id) => {
      const t = byId.get(id);
      if (!t) return;
      update.mutate(
        { id, data: { start: shiftDate(t.start, calDays), end: shiftDate(t.end, calDays) } },
        { onError: (e) => toast.error((e as Error).message) },
      );
    });
    toast.success(
      `Shifted “${task.title}”${downstream.length ? ` and ${downstream.length} downstream task${downstream.length === 1 ? "" : "s"}` : ""} by ${days} working days.`,
    );
    setDays(0);
  }

  const newEnd = days && task.end ? shiftDate(task.end, Math.round(days * WD_TO_CAL)) : null;

  return (
    <tr className="border-b last:border-0">
      <td className="py-2 pr-4">
        <span className="text-[13px]">{task.title}</span>
        {downstream.length > 0 && (
          <Badge variant="secondary" className="ml-2 text-[10px]">
            +{downstream.length} downstream
          </Badge>
        )}
      </td>
      <td className="text-muted-foreground py-2 pr-4 text-center text-[13px]">{dur} wd</td>
      <td className="text-muted-foreground py-2 pr-4 text-[13px]">{task.end || "—"}</td>
      <td className="py-2 pr-3">
        <div className="flex items-center gap-2">
          <Input
            type="number"
            value={days || ""}
            onChange={(e) => setDays(parseInt(e.target.value) || 0)}
            className="h-7 w-20 text-[13px]"
            min={-999} max={999} placeholder="0"
            aria-label={`Shift ${task.title} by working days`}
          />
          <span className="text-muted-foreground shrink-0 text-xs">wd</span>
        </div>
      </td>
      <td className="py-2">
        {days !== 0 && (
          <div className="flex items-center gap-2">
            <span
              className="text-xs font-medium"
              style={{ color: days > 0 ? "var(--t-red)" : "var(--hue-done)" }}
            >
              → {newEnd}
            </span>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={apply}>
              <ChevronsRight className="size-3.5" /> Apply
            </Button>
          </div>
        )}
      </td>
    </tr>
  );
}

// ── pieces ───────────────────────────────────────────────────────────────────

function Stat({ label, value, hint, tone }: {
  label: string; value: string; hint?: string; tone?: "warn" | "bad" | "good";
}) {
  const color =
    tone === "bad" ? "var(--t-red)" : tone === "warn" ? "var(--t-amber)" :
    tone === "good" ? "var(--hue-done)" : undefined;
  return (
    <div className="rounded-[var(--radius-md)] border p-3">
      <p className="text-muted-foreground text-[11.5px]">{label}</p>
      <p
        className="mt-1 text-[15px] font-semibold tabular-nums"
        style={color ? { color: `color-mix(in oklch, ${color} 76%, var(--ink))` } : undefined}
      >
        {value}
      </p>
      {hint && <p className="text-muted-foreground mt-0.5 text-[11px] leading-snug">{hint}</p>}
    </div>
  );
}

/** What completed work says about whether the remaining plan is credible. */
function EvidencePanel({ f }: { f: Forecast }) {
  if (f.measured === 0) {
    return (
      <p className="text-muted-foreground text-[13px] leading-relaxed">
        No finished task has both a planned end and a completion date yet, so there is no
        delivery record to judge the remaining plan against.
      </p>
    );
  }

  const late = f.meanSlip > 0;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Stat
          label="Delivered on time"
          value={`${f.pctOnTime}%`}
          hint={`${f.onTime} of ${f.measured} measured`}
          tone={f.pctOnTime! >= 80 ? "good" : "warn"}
        />
        <Stat
          label="Average slip"
          value={late ? `+${f.meanSlip}d` : `${f.meanSlip}d`}
          hint={late ? "later than planned" : "at or ahead of plan"}
          tone={late ? "warn" : "good"}
        />
      </div>
      {f.worstSlip > 0 && (
        <p className="text-muted-foreground text-[11.5px]">
          Worst overrun so far: <strong>{f.worstSlip} days</strong>.
        </p>
      )}
      {f.projectedEnd ? (
        <div
          className="flex items-start gap-2 rounded-[var(--radius-md)] border p-3 text-[12.5px]"
          style={{
            borderColor: "color-mix(in oklch, var(--t-amber) 34%, transparent)",
            background: "color-mix(in oklch, var(--t-amber) 8%, var(--panel))",
          }}
        >
          <TrendingUp className="mt-0.5 size-4 shrink-0" style={{ color: "var(--t-amber)" }} />
          <span className="leading-relaxed">
            At the slip rate seen so far, the remaining work lands nearer{" "}
            <strong>{f.projectedEnd}</strong> — about <strong>{f.projectedDrift} days</strong> past
            the planned end.
          </span>
        </div>
      ) : (
        <p className="text-muted-foreground text-[12px] leading-relaxed">
          Work has been finishing at or ahead of plan, so the dates are taken at face value —
          finishing early is not treated as evidence the rest will too.
        </p>
      )}
    </div>
  );
}

// ── module ───────────────────────────────────────────────────────────────────

export function ForecastModule({ projectId }: { projectId: string }) {
  const { data: ws } = useProject(projectId);
  const updateProject = useUpdateProject(projectId);

  const bufferPct = useMemo(() => {
    const raw = ws?.project.forecast as Partial<ForecastDoc> | null;
    return raw?.bufferPct ?? 15;
  }, [ws]);

  const tasks = useMemo(() => ws?.tasks ?? [], [ws]);
  const f = useMemo(() => computeForecast(tasks, bufferPct), [tasks, bufferPct]);

  if (!ws) return null;

  function saveBuffer(pct: number) {
    const raw = (ws!.project.forecast ?? {}) as Partial<ForecastDoc>;
    updateProject.mutate(
      { forecast: { ...raw, bufferPct: pct } },
      { onError: (e) => toast.error((e as Error).message) },
    );
  }

  return (
    <div>
      <ModuleHeader
        title="Forecast"
        description="What is left, how long it should take, and what the delivery record says about that."
      />

      {f.complete ? (
        <SectionCard>
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0" style={{ color: "var(--hue-done)" }} />
            <div>
              <p className="text-[14px] font-semibold">Everything is done</p>
              <p className="text-muted-foreground mt-1 text-[13px] leading-relaxed">
                All {f.totalCount} tasks are complete, so there is nothing left to forecast.
                {f.pctOnTime !== null && (
                  <> {f.onTime} of {f.measured} landed on or before the planned date ({f.pctOnTime}%).</>
                )}
              </p>
            </div>
          </div>
        </SectionCard>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <SectionCard title="Risk buffer">
            <div className="space-y-4">
              <div>
                <div className="mb-2 flex items-center justify-between text-[13px]">
                  <span className="text-muted-foreground">Buffer</span>
                  <span className="text-xl font-bold tabular-nums">{bufferPct}%</span>
                </div>
                <Slider
                  value={[bufferPct]}
                  onValueChange={([v]) => saveBuffer(v)}
                  min={0} max={50} step={1}
                  aria-label="Risk buffer percentage"
                />
                <div className="text-muted-foreground mt-1 flex justify-between text-xs">
                  <span>0%</span><span>25%</span><span>50%</span>
                </div>
              </div>
              <div className="space-y-1.5 rounded-[var(--radius-md)] border bg-[var(--paper-2)] p-3 text-[13px]">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Remaining work</span>
                  <span className="font-medium tabular-nums">{f.baseWd} wd</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Buffer (+{bufferPct}%)</span>
                  <span className="font-medium tabular-nums" style={{ color: "var(--t-amber)" }}>
                    +{f.bufferWd} wd
                  </span>
                </div>
                <div className="flex justify-between border-t pt-1.5">
                  <span className="font-medium">Buffered total</span>
                  <span className="font-semibold tabular-nums">{f.totalWd} wd</span>
                </div>
              </div>
              <p className="text-muted-foreground text-[11px] leading-snug">
                Counts only unfinished work, measured from today — calendar already spent is
                not remaining effort.
              </p>
            </div>
          </SectionCard>

          <SectionCard title="Remaining work" className="lg:col-span-2">
            {!f.start ? (
              <p className="text-muted-foreground text-[13px]">
                {f.undated.length > 0
                  ? `${f.undated.length} unfinished task${f.undated.length === 1 ? " has" : "s have"} no dates, so there is nothing to project from yet. Add start and end dates to see a forecast.`
                  : "Nothing is scheduled. Add start and end dates to tasks to see a forecast."}
              </p>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Stat label="From" value={f.start} hint="today, or the next start" />
                  <Stat label="Planned end" value={f.end ?? "—"} />
                  <Stat
                    label="With buffer"
                    value={f.bufferedEnd ?? "—"}
                    tone={f.bufferWd > 0 ? "warn" : undefined}
                  />
                  <Stat
                    label="Left to do"
                    value={`${f.totalCount - f.doneCount}`}
                    hint={`of ${f.totalCount} tasks · ${f.pctDone}% done`}
                  />
                </div>

                {f.undated.length > 0 && (
                  <div className="text-muted-foreground flex items-start gap-2 rounded-[var(--radius-md)] border border-dashed p-3 text-[12.5px]">
                    <CalendarOff className="mt-0.5 size-4 shrink-0" />
                    <span className="leading-relaxed">
                      {f.undated.length} unfinished task{f.undated.length === 1 ? "" : "s"} ha
                      {f.undated.length === 1 ? "s" : "ve"} no dates and {f.undated.length === 1 ? "is" : "are"}{" "}
                      not in this estimate — the real end is likely later.
                    </span>
                  </div>
                )}
              </div>
            )}
          </SectionCard>

          <SectionCard title="What the record says" className="lg:col-span-3">
            <EvidencePanel f={f} />
          </SectionCard>
        </div>
      )}

      {f.remaining.length > 0 && (
        <SectionCard title="Per-task delay" className="mt-4">
          <p className="text-muted-foreground mb-3 text-xs">
            Shift a task and everything downstream of it. Negative moves earlier. Only unfinished
            work is listed.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-muted-foreground border-b text-left text-xs">
                  <th className="pb-2 font-medium">Task</th>
                  <th className="w-20 pb-2 text-center font-medium">Duration</th>
                  <th className="w-28 pb-2 font-medium">Current end</th>
                  <th className="w-32 pb-2 font-medium">Shift by</th>
                  <th className="pb-2 font-medium">Preview</th>
                </tr>
              </thead>
              <tbody>
                {f.remaining.map((t) => (
                  <TaskDelayRow key={t.id} task={t} allTasks={tasks} projectId={projectId} />
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {/* Completed work, kept visible as the evidence behind the numbers. */}
      {f.measured > 0 && (
        <SectionCard title="Delivery record" className="mt-4">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-muted-foreground border-b text-left text-xs">
                  <th className="pb-2 font-medium">Task</th>
                  <th className="w-28 pb-2 font-medium">Planned end</th>
                  <th className="w-28 pb-2 font-medium">Actual end</th>
                  <th className="w-24 pb-2 text-right font-medium">Variance</th>
                </tr>
              </thead>
              <tbody>
                {tasks
                  .filter((t) => t.status === "done" && t.end && t.completedOn)
                  .sort((a, b) => (slipOf(b) ?? 0) - (slipOf(a) ?? 0))
                  .slice(0, 12)
                  .map((t) => {
                    const slip = slipOf(t) ?? 0;
                    return (
                      <tr key={t.id} className="border-b last:border-0">
                        <td className="py-2 pr-4">{t.title}</td>
                        <td className="text-muted-foreground py-2 pr-4 tabular-nums">{t.end}</td>
                        <td className="text-muted-foreground py-2 pr-4 tabular-nums">{t.completedOn}</td>
                        <td
                          className={cn("py-2 text-right font-medium tabular-nums")}
                          style={{
                            color:
                              slip > 0 ? "color-mix(in oklch, var(--t-red) 76%, var(--ink))"
                              : slip < 0 ? "color-mix(in oklch, var(--hue-done) 76%, var(--ink))"
                              : undefined,
                          }}
                        >
                          {slip > 0 ? `+${slip}d` : slip < 0 ? `${slip}d` : "on time"}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}
    </div>
  );
}
