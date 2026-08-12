"use client";

import { useMemo } from "react";
import { toast } from "sonner";
import { Minus, Plus } from "lucide-react";
import { useProject, useUpdateProject, useUpdateEntity } from "@/lib/api/hooks";
import { computeCpm, toWeeks, wdBetween, addWD, slipOf, type CpmRow } from "@/lib/cpm";
import { ModuleHeader, SectionCard } from "@/components/project/ui";
import { cn } from "@/lib/utils";

/* Forecast: the whole schedule projected from tasks and their dependencies
 * by critical path, in working days, then stress-tested with a global buffer
 * and per-task delays that cascade downstream.
 *
 * Delays are modelled, not committed: they live on `delayDays` and never
 * touch start/end, so the plan of record survives the experiment. */

interface ForecastDoc { bufferPct: number; weighting?: string }

const DEFAULT_BUFFER = 20;

function fmtDate(d: string): string {
  if (!d) return "—";
  return new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  });
}

// ── summary cards ────────────────────────────────────────────────────────────

function Card({
  label, value, sub, accent,
}: {
  label: string; value: string; sub: string; accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-lg)] border p-4",
        accent
          ? "border-[color-mix(in_oklch,var(--accent-c)_30%,var(--line))] bg-[color-mix(in_oklch,var(--accent-c)_5%,var(--panel))]"
          : "bg-[var(--panel)]",
      )}
    >
      <p className="eyebrow mb-2">{label}</p>
      <p
        className={cn(
          "font-serif-display text-[26px] leading-none tracking-[-0.02em]",
          accent && "text-[var(--accent-deep)]",
        )}
      >
        {value}
      </p>
      <p className="text-muted-foreground mt-2 font-mono text-[11px] leading-snug">{sub}</p>
    </div>
  );
}

// ── delay stepper ────────────────────────────────────────────────────────────

function DelayStepper({
  value, onChange, disabled,
}: {
  value: number; onChange: (n: number) => void; disabled?: boolean;
}) {
  return (
    <div className="inline-flex items-center gap-1">
      <button
        type="button"
        disabled={disabled || value <= 0}
        onClick={() => onChange(Math.max(0, value - 1))}
        aria-label="Remove a delay day"
        className="hover:bg-[var(--paper-2)] disabled:opacity-30 flex size-6 items-center justify-center rounded-[var(--radius-sm)] border transition"
      >
        <Minus className="size-3" />
      </button>
      <span
        className={cn(
          "min-w-[38px] text-center font-mono text-[11.5px]",
          value > 0 ? "font-bold text-[var(--t-red)]" : "text-muted-foreground",
        )}
      >
        {value > 0 ? `+${value}d` : "—"}
      </span>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(value + 1)}
        aria-label="Add a delay day"
        className="hover:bg-[var(--paper-2)] disabled:opacity-30 flex size-6 items-center justify-center rounded-[var(--radius-sm)] border transition"
      >
        <Plus className="size-3" />
      </button>
    </div>
  );
}

// ── table row ────────────────────────────────────────────────────────────────

function ForecastRow({
  row, projectId,
}: {
  row: CpmRow; projectId: string;
}) {
  const update = useUpdateEntity(projectId, "tasks");
  const { task, duration, slack, critical, startDate, endDate, done, estimated } = row;

  function setDelay(n: number) {
    update.mutate(
      { id: task.id, data: { delayDays: n } },
      { onError: (e) => toast.error((e as Error).message) },
    );
  }

  return (
    <tr
      className={cn(
        "border-b transition last:border-0 hover:bg-[var(--paper-2)]",
        done && "opacity-55",
      )}
    >
      <td className="py-2.5 pr-4">
        <span className="flex items-center gap-2">
          {critical && (
            <span
              className="size-[7px] shrink-0 rounded-full bg-[var(--t-red)]"
              title="On the critical path — a delay here pushes the whole project"
            />
          )}
          <span className={cn("text-[13px]", critical && "font-semibold", !critical && "ml-[15px]")}>
            {task.title}
          </span>
          {estimated && (
            <span className="text-muted-foreground shrink-0 rounded border bg-[var(--paper-2)] px-1.5 py-px font-mono text-[9.5px] uppercase tracking-wide">
              est
            </span>
          )}
        </span>
      </td>
      <td className="text-muted-foreground py-2.5 pr-4 text-right font-mono text-[11.5px]">
        {duration}
      </td>
      <td className="text-muted-foreground py-2.5 pr-4 font-mono text-[11.5px] whitespace-nowrap">
        {startDate} → {endDate}
      </td>
      <td className="py-2.5 pr-4 font-mono text-[11.5px]">
        {critical ? (
          <span className="font-bold text-[var(--t-red)]">critical</span>
        ) : (
          <span className="text-muted-foreground">{slack}d</span>
        )}
      </td>
      <td className="py-2.5">
        <DelayStepper value={task.delayDays ?? 0} onChange={setDelay} disabled={done} />
      </td>
    </tr>
  );
}

// ── module ───────────────────────────────────────────────────────────────────

export function ForecastModule({ projectId }: { projectId: string }) {
  const { data: ws } = useProject(projectId);
  const updateProject = useUpdateProject(projectId);

  const bufferPct = useMemo(() => {
    const raw = ws?.project.forecast as Partial<ForecastDoc> | null;
    return raw?.bufferPct ?? DEFAULT_BUFFER;
  }, [ws]);

  const tasks = useMemo(() => ws?.tasks ?? [], [ws]);
  const cpm = useMemo(() => computeCpm(tasks), [tasks]);

  // The pessimistic finish: the critical-path estimate plus a flat percentage.
  const bufferedDur = Math.round(cpm.projDur * (1 + bufferPct / 100));
  const bufferedEnd = cpm.rows.length ? addWD(cpm.projStart, bufferedDur) : null;
  const vsPlanned =
    bufferedEnd && cpm.plannedEnd ? wdBetween(cpm.plannedEnd, bufferedEnd) : null;

  const measured = useMemo(
    () => tasks.filter((t) => t.status === "done" && t.end && t.completedOn),
    [tasks],
  );

  if (!ws) return null;

  function saveBuffer(pct: number) {
    const raw = (ws!.project.forecast ?? {}) as Partial<ForecastDoc>;
    updateProject.mutate(
      { forecast: { ...raw, bufferPct: pct } },
      { onError: (e) => toast.error((e as Error).message) },
    );
  }

  const empty = cpm.rows.length === 0;

  return (
    <div>
      <ModuleHeader
        title="Forecast"
        description="Projected from your actions and their dependencies (the critical path), counted in working days. Add a delay to any action below and the whole schedule — and the finish date — recalculates."
      />

      {empty ? (
        <SectionCard>
          <p className="font-serif-display text-[17px]">Nothing to forecast yet</p>
          <p className="text-muted-foreground mt-1.5 text-[13px] leading-relaxed">
            Add actions with dates to see a projected duration and end date.
          </p>
        </SectionCard>
      ) : (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <Card
              label="Estimated duration"
              value={`${toWeeks(cpm.projDur)} wks`}
              sub={`${cpm.projDur} working days · ${cpm.criticalCount} on critical path`}
            />
            <Card
              label="Expected finish"
              value={fmtDate(cpm.projEnd)}
              sub={`from ${cpm.projStart}`}
            />
            <Card
              accent
              label={`With delays (+${bufferPct}%)`}
              value={fmtDate(bufferedEnd ?? "")}
              sub={`${toWeeks(bufferedDur)} wks · buffered estimate`}
            />
          </div>

          <SectionCard className="mb-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="text-[13px] font-bold tracking-tight">Delay buffer</span>
              <span className="font-mono text-[13px] font-bold text-[var(--accent-deep)]">
                +{bufferPct}%
              </span>
            </div>
            <input
              type="range"
              min={0} max={100} step={5}
              value={bufferPct}
              onChange={(e) => saveBuffer(Number(e.target.value))}
              aria-label="Delay buffer percentage"
              className="accent-[var(--accent-c)] w-full"
            />
            <p className="text-muted-foreground mt-2 text-[11.5px] leading-relaxed">
              Global contingency added on top of the critical-path estimate to produce the
              pessimistic finish
              {vsPlanned !== null && (
                <>
                  {" — "}
                  <strong>
                    {Math.abs(vsPlanned)} working day{Math.abs(vsPlanned) === 1 ? "" : "s"}
                  </strong>{" "}
                  {vsPlanned > 0 ? "later than" : vsPlanned < 0 ? "ahead of" : "level with"} your
                  planned finish
                </>
              )}
              .
            </p>
          </SectionCard>

          <SectionCard>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-muted-foreground border-b text-left">
                    <th className="pb-2 font-mono text-[10px] font-medium uppercase tracking-wider">Action</th>
                    <th className="w-16 pb-2 pr-4 text-right font-mono text-[10px] font-medium uppercase tracking-wider">Days</th>
                    <th className="w-56 pb-2 font-mono text-[10px] font-medium uppercase tracking-wider">Scheduled</th>
                    <th className="w-24 pb-2 font-mono text-[10px] font-medium uppercase tracking-wider">Slack</th>
                    <th className="w-32 pb-2 font-mono text-[10px] font-medium uppercase tracking-wider">Delay</th>
                  </tr>
                </thead>
                <tbody>
                  {cpm.rows.map((r) => (
                    <ForecastRow key={r.task.id} row={r} projectId={projectId} />
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-muted-foreground mt-3 border-t pt-3 text-[11.5px] leading-relaxed">
              <span className="text-[var(--t-red)]">●</span> Critical path — delaying these pushes
              the project end date. Slack is how many working days an action can slip before it
              does.
            </p>
          </SectionCard>
        </>
      )}

      {/* Kept alongside the projection: what actually happened is the evidence
          for whether the dates above deserve to be believed. */}
      {measured.length > 0 && (
        <SectionCard title="Delivery record" className="mt-4">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-muted-foreground border-b text-left">
                  <th className="pb-2 font-mono text-[10px] font-medium uppercase tracking-wider">Action</th>
                  <th className="w-32 pb-2 font-mono text-[10px] font-medium uppercase tracking-wider">Planned end</th>
                  <th className="w-32 pb-2 font-mono text-[10px] font-medium uppercase tracking-wider">Actual end</th>
                  <th className="w-24 pb-2 text-right font-mono text-[10px] font-medium uppercase tracking-wider">Variance</th>
                </tr>
              </thead>
              <tbody>
                {[...measured]
                  .sort((a, b) => (slipOf(b) ?? 0) - (slipOf(a) ?? 0))
                  .slice(0, 12)
                  .map((t) => {
                    const slip = slipOf(t) ?? 0;
                    return (
                      <tr key={t.id} className="border-b last:border-0">
                        <td className="py-2 pr-4">{t.title}</td>
                        <td className="text-muted-foreground py-2 pr-4 font-mono text-[11.5px]">{t.end}</td>
                        <td className="text-muted-foreground py-2 pr-4 font-mono text-[11.5px]">{t.completedOn}</td>
                        <td
                          className="py-2 text-right font-mono text-[11.5px] font-medium"
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
