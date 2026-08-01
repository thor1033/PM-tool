"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { addMonths, format } from "date-fns";
import { Flag, Target, GitBranch } from "lucide-react";
import { useUpdateEntity, useUpdateProject } from "@/lib/api/hooks";
import type { Task, WorkingSet, Milestone } from "@/lib/types";
import { daysBetween, fmtD } from "@/lib/tasks";
import { accentVar } from "@/lib/colors";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const DAYW = 13; // px per day, matches the reference's density

interface Baseline {
  at: number;
  bars: Record<string, { start: string; end: string }>;
}

export function TimelineView({
  ws, projectId, filtered, onEdit, onEditMilestone,
}: {
  ws: WorkingSet; projectId: string; filtered: Task[]; onEdit: (t: Task) => void;
  onEditMilestone: (m: Milestone) => void;
}) {
  const updateTask = useUpdateEntity(projectId, "tasks");
  const updateProject = useUpdateProject(projectId);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showCP, setShowCP] = useState(false);

  const settings = (ws.project.settings as Record<string, unknown> | null) ?? {};
  const baseline = (settings.timelineBaseline as Baseline | undefined) ?? null;

  const dated = filtered.filter((t) => !t.parentId && t.start && t.end);
  const datedMs = ws.milestones.filter((m) => m.date);

  // critical path: longest-duration chain through task→task deps
  const cp = useMemo(() => {
    const dur = (t: Task) => Math.max(1, daysBetween(t.start, t.end));
    const map = new Map(dated.map((t) => [t.id, t]));
    const memo = new Map<string, { len: number; next: string | null }>();
    const visiting = new Set<string>();
    function longest(id: string): { len: number; next: string | null } {
      if (memo.has(id)) return memo.get(id)!;
      if (visiting.has(id)) return { len: 0, next: null };
      visiting.add(id);
      const t = map.get(id)!;
      let best: { len: number; next: string | null } = { len: dur(t), next: null };
      dated.forEach((s) => {
        if ((s.deps ?? []).some((d) => d.type === "task" && d.refId === id)) {
          const r = longest(s.id);
          if (dur(t) + r.len > best.len) best = { len: dur(t) + r.len, next: s.id };
        }
      });
      visiting.delete(id);
      memo.set(id, best);
      return best;
    }
    let start: string | null = null;
    let len = -1;
    dated.forEach((t) => { const r = longest(t.id); if (r.len > len) { len = r.len; start = t.id; } });
    const path = new Set<string>();
    let cur: string | null = start;
    while (cur) { path.add(cur); cur = memo.get(cur)!.next; }
    return path;
  }, [dated]);

  function setBaseline() {
    const bars: Baseline["bars"] = {};
    ws.tasks.forEach((t) => { if (t.start && t.end) bars[t.id] = { start: t.start, end: t.end }; });
    updateProject.mutate({ settings: { ...settings, timelineBaseline: { at: Date.now(), bars } } });
  }
  function clearBaseline() {
    const next = { ...settings };
    delete next.timelineBaseline;
    updateProject.mutate({ settings: next });
  }

  if (!dated.length && !datedMs.length) {
    return (
      <div className="flex flex-col items-center rounded-[var(--radius-lg)] border border-dashed p-16 text-center">
        <GitBranch className="text-muted-foreground/40 mb-3 size-8" />
        <p className="font-serif-display text-[17px] font-medium">No dated actions yet</p>
        <p className="text-muted-foreground mt-1 text-sm">Add start and end dates to tasks to see them on the timeline.</p>
      </div>
    );
  }

  const allDates = [...dated.flatMap((t) => [t.start, t.end]), ...datedMs.map((m) => m.date)];
  let min = Infinity, max = -Infinity;
  allDates.forEach((d) => { const v = +new Date(d); if (v < min) min = v; if (v > max) max = v; });
  const now = Date.now();
  min = Math.min(min, now);
  max = Math.max(max, now);
  const rangeMin = new Date(min - 4 * 86_400_000);
  const rangeMax = new Date(max + 8 * 86_400_000);
  const minStr = rangeMin.toISOString().slice(0, 10);
  const totalDays = Math.max(1, daysBetween(minStr, rangeMax.toISOString().slice(0, 10)));
  const totalW = totalDays * DAYW;

  const months: { left: number; width: number; label: string }[] = [];
  let cur = new Date(rangeMin);
  cur.setDate(1);
  while (cur < rangeMax) {
    const start = new Date(Math.max(+cur, +rangeMin));
    const next = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    const end = new Date(Math.min(+next, +rangeMax));
    months.push({
      label: cur.toLocaleDateString("en-GB", { month: "short", year: "2-digit" }),
      left: daysBetween(minStr, start.toISOString().slice(0, 10)) * DAYW,
      width: Math.max(0, daysBetween(start.toISOString().slice(0, 10), end.toISOString().slice(0, 10))) * DAYW,
    });
    cur = addMonths(cur, 1);
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  const todayLeft = todayStr >= minStr && todayStr <= rangeMax.toISOString().slice(0, 10)
    ? daysBetween(minStr, todayStr) * DAYW : null;

  useEffect(() => {
    if (scrollRef.current && todayLeft != null) {
      scrollRef.current.scrollLeft = Math.max(0, todayLeft - 160);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const catMap = new Map(ws.categories.map((c) => [c.id, c]));
  const groups: { id: string; label: string; color: string | null; tasks: Task[] }[] = [];
  const bycat = new Map<string, Task[]>();
  dated.forEach((t) => {
    const key = t.category ?? "_none";
    const arr = bycat.get(key) ?? [];
    arr.push(t);
    bycat.set(key, arr);
  });
  ws.categories.forEach((c) => {
    const tasks = bycat.get(c.id);
    if (tasks?.length) groups.push({ id: c.id, label: c.label, color: c.color, tasks });
  });
  const noTrack = bycat.get("_none");
  if (noTrack?.length) groups.push({ id: "_none", label: "No track", color: null, tasks: noTrack });

  const ROW_H = 42, HDR_H = 38, TRACK_H = 34;
  const taskLayout = new Map<string, { rowY: number; barLeft: number; barWidth: number }>();
  let yCursor = HDR_H;
  groups.forEach((g) => {
    yCursor += TRACK_H;
    g.tasks.forEach((t) => {
      const barLeft = daysBetween(minStr, t.start) * DAYW;
      const barWidth = Math.max(DAYW, daysBetween(t.start, t.end) * DAYW);
      taskLayout.set(t.id, { rowY: yCursor + ROW_H / 2, barLeft, barWidth });
      yCursor += ROW_H;
    });
  });
  const totalH = yCursor + 20;

  const depLines: {
    key: string; from: { x: number; y: number }; to: { x: number; y: number };
    violated: boolean; color: string; task: Task; title: string; critical: boolean;
  }[] = [];
  ws.tasks.forEach((t) => {
    if (!t.start || !t.end || !taskLayout.has(t.id)) return;
    (t.deps ?? []).forEach((d) => {
      if (d.type !== "task") return;
      const pred = ws.tasks.find((x) => x.id === d.refId);
      if (!pred?.start || !pred.end || !taskLayout.has(pred.id)) return;
      const pL = taskLayout.get(pred.id)!;
      const dL = taskLayout.get(t.id)!;
      const violated = pred.status !== "done" && new Date(t.start) < new Date(pred.end);
      const predCat = catMap.get(pred.category ?? "");
      const color = predCat ? accentVar(predCat.color) : "var(--accent-deep)";
      depLines.push({
        key: d.id || `${pred.id}-${t.id}`,
        from: { x: pL.barLeft + pL.barWidth, y: pL.rowY },
        to: { x: dL.barLeft, y: dL.rowY },
        violated, color, task: t,
        critical: cp.has(pred.id) && cp.has(t.id),
        title: violated
          ? `⚠ Dependency block — ${t.title} starts ${fmtD(t.start)} but "${pred.title}" isn't finished until ${fmtD(pred.end)} · double-click to inspect`
          : `${pred.title} → ${t.title} · double-click to inspect`,
      });
    });
  });

  const LABEL_W = 220;

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        {baseline ? (
          <>
            <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs">
              <span className="inline-block h-[7px] w-[22px] rounded-sm border" style={{ background: "repeating-linear-gradient(90deg, var(--ink-ghost) 0 4px, transparent 4px 7px)" }} />
              Baseline set {new Date(baseline.at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
            </span>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={setBaseline}>Update</Button>
            <Button variant="ghost" size="sm" className="h-7 text-xs text-[var(--t-red)]" onClick={clearBaseline}>Clear</Button>
          </>
        ) : (
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={setBaseline} title="Snapshot today's dates to compare slippage against later">
            <Flag className="size-3" /> Set baseline
          </Button>
        )}
        <div className="flex-1" />
        <Button
          variant={showCP ? "default" : "outline"}
          size="sm"
          className="h-7 text-xs"
          onClick={() => setShowCP((v) => !v)}
          title="Highlight the longest dependency chain"
        >
          <Target className="size-3" /> Critical path
        </Button>
      </div>

      <div ref={scrollRef} className="overflow-x-auto rounded-[var(--radius-lg)] border">
        <div className="relative" style={{ minWidth: LABEL_W + totalW }}>
          {depLines.length > 0 && (
            <svg className="pointer-events-none absolute top-0 z-10 overflow-visible" style={{ left: LABEL_W, width: totalW, height: totalH }}>
              <defs>
                <marker id="tl-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M0,0 L10,5 L0,10 z" fill="currentColor" />
                </marker>
                <marker id="tl-arr-bad" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M0,0 L10,5 L0,10 z" fill="var(--t-red)" />
                </marker>
              </defs>
              {depLines.map((line) => {
                const dx = Math.max(34, Math.abs(line.to.x - line.from.x) * 0.5);
                const path = `M${line.from.x},${line.from.y} C${line.from.x + dx},${line.from.y} ${line.to.x - dx},${line.to.y} ${line.to.x - 4},${line.to.y}`;
                const critical = showCP && line.critical;
                return (
                  <path
                    key={line.key} d={path} fill="none"
                    strokeWidth={line.violated || critical ? 2.6 : 2}
                    stroke={line.violated ? "var(--t-red)" : critical ? "var(--t-red)" : line.color}
                    opacity={line.violated ? 0.95 : 0.85}
                    style={{ color: line.violated ? "var(--t-red)" : line.color }}
                    markerEnd={line.violated ? "url(#tl-arr-bad)" : "url(#tl-arr)"}
                    className="pointer-events-auto cursor-pointer transition hover:opacity-100"
                    onDoubleClick={() => onEdit(line.task)}
                  >
                    <title>{line.title}</title>
                  </path>
                );
              })}
            </svg>
          )}

          {/* Header */}
          <div className="flex border-b bg-[var(--paper-2)]" style={{ height: HDR_H }}>
            <div className="text-muted-foreground shrink-0 border-r px-3 py-2 font-mono text-[10.5px] font-medium uppercase tracking-wide" style={{ width: LABEL_W }}>
              Category / Action
            </div>
            <div className="relative flex-1" style={{ width: totalW }}>
              {months.map((m, i) => (
                <div key={i} className="text-muted-foreground absolute top-0 border-l px-2 py-2 font-mono text-[11px]" style={{ left: m.left, width: m.width, overflow: "hidden", whiteSpace: "nowrap" }}>
                  {m.label}
                </div>
              ))}
              {todayLeft !== null && (
                <div className="border-primary absolute bottom-0 top-0 z-10 border-l-[2.5px]" style={{ left: todayLeft }}>
                  <span className="bg-primary text-primary-foreground absolute top-1 whitespace-nowrap rounded px-1 font-mono text-[9px] font-bold">Today</span>
                </div>
              )}
              {datedMs.map((ms) => {
                const left = daysBetween(minStr, ms.date) * DAYW;
                const cat = catMap.get(ms.category ?? "");
                const col = cat ? accentVar(cat.color) : "var(--accent-c)";
                return ms.type === "gate" ? (
                  <div key={ms.id} onClick={() => onEditMilestone(ms)} className="absolute bottom-0 top-0 z-20 cursor-pointer border-l-[2.5px] border-[var(--t-red)]" style={{ left }} title={`${ms.title} (gate) — ${fmtD(ms.date)}`}>
                    <span className="absolute top-1 whitespace-nowrap rounded bg-[oklch(1_0_0/0.85)] px-1 font-mono text-[8.5px] font-bold uppercase tracking-wide text-[var(--t-red)]">Gate</span>
                  </div>
                ) : (
                  <div key={ms.id} onClick={() => onEditMilestone(ms)} className="absolute top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 cursor-pointer text-[15px] transition hover:scale-125" style={{ left, color: col }} title={`${ms.title} — ${fmtD(ms.date)}`}>
                    ◆
                  </div>
                );
              })}
            </div>
          </div>

          {/* Groups */}
          {groups.map((g) => {
            const col = g.color ? accentVar(g.color) : "var(--ink-ghost)";
            return (
              <div key={g.id}>
                <div className="flex border-b" style={{ height: TRACK_H, background: g.color ? `color-mix(in oklch, ${col} 10%, var(--panel))` : "var(--paper-2)" }}>
                  <div className="flex shrink-0 items-center gap-1.5 border-r px-3 py-1" style={{ width: LABEL_W }}>
                    <span className="size-2 shrink-0 rounded-full" style={{ background: col }} />
                    <span className="eyebrow" style={g.color ? { color: col } : undefined}>{g.label}</span>
                  </div>
                  <div className="relative flex-1" style={{ width: totalW }}>
                    {todayLeft !== null && <div className="border-primary/30 absolute inset-y-0 border-l-[1.5px]" style={{ left: todayLeft }} />}
                  </div>
                </div>
                {g.tasks.map((t) => (
                  <GanttRow
                    key={t.id} task={t} layout={taskLayout.get(t.id)!} barColorVar={col}
                    minStr={minStr} totalW={totalW} todayLeft={todayLeft}
                    baselineBar={baseline?.bars[t.id]}
                    gates={datedMs.filter((m) => m.type === "gate")}
                    critical={showCP && cp.has(t.id)}
                    onEdit={() => onEdit(t)}
                    onCommit={(start, end) => updateTask.mutate({ id: t.id, data: { start, end } }, { onError: (e) => toast.error((e as Error).message) })}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>

      <div className="text-muted-foreground mt-3.5 flex flex-wrap gap-4 text-[11.5px]">
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-[18px] rounded-[3px]" style={{ background: "var(--accent-c)" }} /> In progress</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-[18px] rounded-[3px] opacity-55" style={{ background: "var(--accent-c)" }} /> Done</span>
        <span className="inline-flex items-center gap-1.5" style={{ color: "var(--accent-deep)" }}>◆ Milestone</span>
        <span className="inline-flex items-center gap-1.5 text-[var(--t-red)]">▐ Gate</span>
        <span className="inline-flex items-center gap-1.5 text-[var(--t-red)]">Dependency block (double-click to inspect)</span>
        {baseline && <span className="inline-flex items-center gap-1.5"><span className="inline-block h-[6px] w-[18px] rounded-sm bg-[var(--ink-ghost)] opacity-50" /> Baseline</span>}
      </div>
    </div>
  );
}

// ── gantt row with drag-move / drag-resize ──────────────────────────────────

function GanttRow({
  task, layout, barColorVar, minStr, totalW, todayLeft, baselineBar, gates, critical, onEdit, onCommit,
}: {
  task: Task; layout: { rowY: number; barLeft: number; barWidth: number }; barColorVar: string;
  minStr: string; totalW: number; todayLeft: number | null;
  baselineBar?: { start: string; end: string };
  gates: Milestone[]; critical: boolean;
  onEdit: () => void;
  onCommit: (start: string, end: string) => void;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    kind: "move" | "l" | "r"; startX: number; start0: Date; end0: Date; moved: boolean;
    preview?: { start: string; end: string };
  } | null>(null);
  const [visual, setVisual] = useState({ left: layout.barLeft, width: layout.barWidth });

  useEffect(() => setVisual({ left: layout.barLeft, width: layout.barWidth }), [layout.barLeft, layout.barWidth]);

  function onPointerDown(e: React.PointerEvent, kind: "move" | "l" | "r") {
    e.preventDefault();
    e.stopPropagation();
    drag.current = { kind, startX: e.clientX, start0: new Date(task.start), end0: new Date(task.end), moved: false };
    document.body.style.cursor = kind === "move" ? "grabbing" : "ew-resize";
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }
  function onMove(e: PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const deltaDays = Math.round((e.clientX - d.startX) / DAYW);
    if (deltaDays !== 0) d.moved = true;
    let s = new Date(d.start0), en = new Date(d.end0);
    if (d.kind === "move") {
      s = new Date(+d.start0 + deltaDays * 86_400_000);
      en = new Date(+d.end0 + deltaDays * 86_400_000);
    } else if (d.kind === "l") {
      s = new Date(Math.min(+d.start0 + deltaDays * 86_400_000, +d.end0 - 86_400_000));
    } else {
      en = new Date(Math.max(+d.end0 + deltaDays * 86_400_000, +d.start0 + 86_400_000));
    }
    const left = daysBetween(minStr, s.toISOString().slice(0, 10)) * DAYW;
    const width = Math.max(DAYW, daysBetween(s.toISOString().slice(0, 10), en.toISOString().slice(0, 10)) * DAYW);
    setVisual({ left, width });
    d.preview = { start: s.toISOString().slice(0, 10), end: en.toISOString().slice(0, 10) };
  }
  function onUp() {
    const d = drag.current;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    document.body.style.cursor = "";
    if (d?.moved && d.preview) onCommit(d.preview.start, d.preview.end);
    else setVisual({ left: layout.barLeft, width: layout.barWidth });
    drag.current = null;
  }

  const nowTs = Date.now();
  const isPast = +new Date(task.end) < nowTs;

  return (
    <div className="group flex border-b hover:bg-[var(--paper-2)]" style={{ height: 42 }}>
      <div className="flex shrink-0 items-center border-r px-3" style={{ width: 220 }}>
        <button onClick={onEdit} className="hover:text-primary truncate text-left text-xs" title={task.title}>{task.title}</button>
      </div>
      <div className="relative flex-1" style={{ width: totalW }}>
        {todayLeft !== null && <div className="border-primary/20 absolute inset-y-0 border-l-[1.5px]" style={{ left: todayLeft }} />}
        {gates.map((m) => (
          <div key={m.id} className="pointer-events-none absolute inset-y-0 border-l-[1.5px] border-dashed border-[oklch(0.63_0.12_25/0.3)]" style={{ left: daysBetween(minStr, m.date) * DAYW }} />
        ))}
        {baselineBar && (
          <div
            className="absolute top-[26px] h-[6px] rounded-sm bg-[var(--ink-ghost)] opacity-50"
            style={{
              left: daysBetween(minStr, baselineBar.start) * DAYW,
              width: Math.max(DAYW, daysBetween(baselineBar.start, baselineBar.end) * DAYW),
            }}
            title={`Baseline: ${fmtD(baselineBar.start)} → ${fmtD(baselineBar.end)}`}
          />
        )}
        <div
          ref={barRef}
          className={cn(
            "shadow-xs absolute top-2 flex h-[26px] cursor-grab items-center overflow-hidden rounded-[7px] select-none",
            task.status === "done" && "opacity-55",
            isPast && task.status !== "done" && "opacity-40 grayscale-[0.4]",
            critical && "ring-2 ring-[var(--t-red)]",
          )}
          style={{ left: visual.left, width: visual.width, background: `color-mix(in oklch, ${barColorVar} 88%, white)` }}
          onPointerDown={(e) => onPointerDown(e, "move")}
          onDoubleClick={onEdit}
          title={`${task.title} · ${fmtD(task.start)} → ${fmtD(task.end)}`}
        >
          <span className="pointer-events-none absolute inset-0 flex items-center truncate px-2.5 text-[11.5px] font-semibold text-white [text-shadow:0_1px_2px_rgba(0,0,0,.18)]">
            {visual.width > 44 ? task.title : ""}
          </span>
          <span className="absolute left-0 top-0 h-full w-2 cursor-ew-resize" onPointerDown={(e) => onPointerDown(e, "l")} />
          <span className="absolute right-0 top-0 h-full w-2 cursor-ew-resize" onPointerDown={(e) => onPointerDown(e, "r")} />
        </div>
      </div>
    </div>
  );
}
