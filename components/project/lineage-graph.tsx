"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GitBranch, Maximize2, Minus, Plus, Scan } from "lucide-react";
import type { Task, WorkingSet } from "@/lib/types";
import {
  buildLineage, COL, DOC_SIZE, TASK_R,
  type Lineage, type LineageNode, type LineageTaskNode, type LineageDocNode, type LineageShelf,
} from "@/lib/lineage";
import { COLUMNS, fmtD, depsOf, type ResolvedDep } from "@/lib/tasks";
import { typeMeta } from "@/lib/file-types";
import { accentVar } from "@/lib/colors";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/* The lineage of a task, drawn: where it came from, what it split into, what
 * followed from it and what was produced along the way. Layout is decided in
 * lib/lineage; this file only draws it and makes it navigable. */

const MIN_K = 0.3;
const MAX_K = 2;

// Labels are cut to the width they have, not to a character count: a title in
// capitals or bold is far wider than the same number of lowercase letters.
let measureCtx: CanvasRenderingContext2D | null | undefined;
function fit(s: string, maxPx: number, font: string): string {
  if (measureCtx === undefined) measureCtx = typeof document === "undefined" ? null : document.createElement("canvas").getContext("2d");
  if (!measureCtx) return s.length > 22 ? s.slice(0, 21).trimEnd() + "…" : s;
  measureCtx.font = font;
  if (measureCtx.measureText(s).width <= maxPx) return s;
  let lo = 0, hi = s.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (measureCtx.measureText(s.slice(0, mid).trimEnd() + "…").width <= maxPx) lo = mid; else hi = mid - 1;
  }
  return s.slice(0, lo).trimEnd() + "…";
}
const FONT = "ui-sans-serif, system-ui, sans-serif";
/** Room for a label beside a node, up to the next node on the rail. */
const LABEL_W = COL - 13 - 12 - 8 - 24;
const statusLabel = (id: string) => COLUMNS.find((c) => c.id === id)?.label ?? id;

/** The one line of history under a node's title: when it was finished, or
 *  else when it is planned, or else when it was written down. */
function whenOf(t: Task): string {
  if (t.status === "done" && t.completedOn) return `done ${fmtD(t.completedOn)}`;
  if (t.start && t.end) return `${fmtD(t.start)} → ${fmtD(t.end)}`;
  if (t.end) return `due ${fmtD(t.end)}`;
  if (t.start) return `from ${fmtD(t.start)}`;
  const created = String(t.createdAt ?? "").slice(0, 10);
  return created ? `added ${fmtD(created)}` : "";
}

type View = { k: number; tx: number; ty: number };

/** Scale and offset that fit the drawing in the frame, never enlarging it,
 *  and that keep the focused task on screen when the drawing is wider. */
function fitView(lin: Lineage, w: number, h: number): View {
  const k = Math.max(MIN_K, Math.min(1, (w - 16) / lin.width, (h - 16) / lin.height));
  const focus = lin.nodes.find((n) => n.kind !== "doc" && n.id === lin.focusId);
  let tx = (w - lin.width * k) / 2;
  let ty = (h - lin.height * k) / 2;
  if (focus && lin.width * k > w) tx = Math.min(0, Math.max(w - lin.width * k, w / 3 - focus.x * k));
  if (focus && lin.height * k > h) ty = Math.min(0, Math.max(h - lin.height * k, h / 3 - focus.y * k));
  return { k, tx, ty };
}

export function LineageGraph({
  lineage,
  onOpenTask,
  height,
  wheelZoom = false,
}: {
  lineage: Lineage;
  onOpenTask?: (id: string) => void;
  /** Fixed frame height; fills the parent when omitted. */
  height?: number;
  /** Plain wheel zooms. Off inline, so scrolling the dialog past the graph
   *  still scrolls; ctrl/⌘ + wheel zooms either way. */
  wheelZoom?: boolean;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<View | null>(null);
  const [hover, setHover] = useState<LineageNode | null>(null);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);

  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Fit when the frame first has a size, and again whenever the drawing is
  // for a different task — jumping along the lineage re-centres on the new one.
  // Adjusted during render rather than in an effect, so the first paint is
  // already fitted instead of flashing the unfitted drawing.
  const fitKey = `${lineage.focusId}:${lineage.nodes.length}`;
  const [fittedFor, setFittedFor] = useState("");
  if (size.w > 0 && fittedFor !== fitKey) {
    setFittedFor(fitKey);
    setView(fitView(lineage, size.w, size.h));
    setHover(null);
  }
  const shown = view;

  const zoomAt = useCallback((factor: number, cx: number, cy: number) =>
    setView((v) => {
      if (!v) return v;
      const k = Math.min(MAX_K, Math.max(MIN_K, v.k * factor));
      const f = k / v.k;
      return { k, tx: cx - (cx - v.tx) * f, ty: cy - (cy - v.ty) * f };
    }), []);

  // A native listener, because React's wheel handler is passive and cannot
  // stop the page from scrolling underneath the zoom.
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!wheelZoom && !e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [wheelZoom, zoomAt]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (!shown || (e.target as Element).closest("[data-node], button")) return;
    drag.current = { x: e.clientX, y: e.clientY, tx: shown.tx, ty: shown.ty };
    setDragging(true);
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    setView((v) => (v ? { ...v, tx: d.tx + e.clientX - d.x, ty: d.ty + e.clientY - d.y } : v));
  };
  const endDrag = () => { drag.current = null; setDragging(false); };

  const k = shown?.k ?? 1;

  return (
    <div
      ref={frame}
      className="relative w-full touch-none overflow-hidden rounded-[var(--radius-sm)] border bg-[var(--paper-2)] select-none"
      style={{ height: height ?? "100%" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      {/* Dot grid: a quiet reference so panning reads as movement. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          backgroundImage: "radial-gradient(var(--line) 1px, transparent 1px)",
          backgroundSize: `${22 * k}px ${22 * k}px`,
          backgroundPosition: shown ? `${shown.tx}px ${shown.ty}px` : undefined,
        }}
      />
      {shown && (
        <svg width={size.w} height={size.h} className={cn("absolute inset-0", dragging ? "cursor-grabbing" : "cursor-grab")} role="group" aria-label="Task lineage">
          <g transform={`translate(${shown.tx} ${shown.ty}) scale(${shown.k})`}>
            {lineage.edges.map((e) => (
              <path
                key={e.id}
                d={e.d}
                fill="none"
                stroke="var(--ink-soft)"
                strokeOpacity={e.kind === "doc" ? 0.45 : e.kind === "subtask" ? 0.5 : 0.7}
                strokeWidth={e.kind === "followup" ? 1.6 : 1.2}
                strokeDasharray={e.kind === "doc" || e.kind === "dep" ? "2 3" : undefined}
                strokeLinecap="round"
              />
            ))}
            {/* Shelves first, so a node's hover area never sits under one. */}
            {lineage.nodes.map((n) =>
              n.kind !== "doc" && n.shelf ? (
                <Shelf key={`shelf:${n.id}`} shelf={n.shelf} onOpen={onOpenTask} />
              ) : null,
            )}
            {lineage.nodes.map((n) =>
              n.kind === "doc" ? (
                <DocMark key={n.id} n={n} onHover={setHover} />
              ) : (
                <TaskMark key={n.id} n={n} onHover={setHover} onOpen={onOpenTask} />
              ),
            )}
          </g>
        </svg>
      )}

      {hover && shown && <Tip n={hover} view={shown} frameW={size.w} frameH={size.h} />}

      <div className="absolute right-2 bottom-2 flex items-center gap-0.5 rounded-[var(--radius-sm)] border bg-[var(--panel)] p-0.5 shadow-sm">
        <ToolBtn label="Zoom out" onClick={() => zoomAt(1 / 1.25, size.w / 2, size.h / 2)}><Minus className="size-3.5" /></ToolBtn>
        <span className="text-muted-foreground w-9 text-center font-mono text-[10.5px]">{Math.round(k * 100)}%</span>
        <ToolBtn label="Zoom in" onClick={() => zoomAt(1.25, size.w / 2, size.h / 2)}><Plus className="size-3.5" /></ToolBtn>
        <ToolBtn label="Fit" onClick={() => setView(fitView(lineage, size.w, size.h))}><Scan className="size-3.5" /></ToolBtn>
      </div>
    </div>
  );
}

function ToolBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="text-muted-foreground hover:bg-muted hover:text-foreground rounded-[4px] p-1 transition"
    >
      {children}
    </button>
  );
}

function TaskMark({
  n, onHover, onOpen,
}: {
  n: LineageTaskNode;
  onHover: (n: LineageNode | null) => void;
  onOpen?: (id: string) => void;
}) {
  const t = n.task;
  const done = t.status === "done";
  const going = t.status === "inprogress";
  const openable = !!onOpen && !n.focus;
  const lx = n.x + n.r + 12;
  const title = t.title || "Untitled task";
  return (
    <g
      data-node
      tabIndex={openable ? 0 : -1}
      role={openable ? "button" : undefined}
      aria-label={openable ? `Open “${title}”` : title}
      className={cn("outline-none", openable ? "cursor-pointer" : "cursor-default")}
      onClick={() => openable && onOpen!(t.id)}
      onKeyDown={(e) => { if (openable && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onOpen!(t.id); } }}
      onPointerEnter={() => onHover(n)}
      onPointerLeave={() => onHover(null)}
      onFocus={() => onHover(n)}
      onBlur={() => onHover(null)}
    >
      {/* Generous invisible hit area — the circles alone are small targets. */}
      <rect x={n.x - n.r - 4} y={n.y - n.r - 18} width={LABEL_W + 30} height={n.r * 2 + 36} fill="transparent" />
      {n.focus && <circle cx={n.x} cy={n.y} r={n.r + 6} fill="none" stroke="var(--primary)" strokeOpacity={0.35} strokeWidth={3} />}
      <circle
        cx={n.x}
        cy={n.y}
        r={n.r}
        fill={done ? "var(--hue-done)" : going ? "color-mix(in oklch, var(--hue-progress) 16%, var(--panel))" : "var(--panel)"}
        stroke={done ? "var(--hue-done)" : going ? "var(--hue-progress)" : "var(--hue-backlog)"}
        strokeWidth={n.kind === "task" ? 2 : 1.6}
      />
      {done && (
        <path
          d={`M${n.x - n.r * 0.4} ${n.y + 0.5} l${n.r * 0.28} ${n.r * 0.3} l${n.r * 0.52} ${-n.r * 0.6}`}
          fill="none"
          stroke="white"
          strokeWidth={n.kind === "task" ? 2 : 1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {t.priority && (
        <circle cx={n.x + n.r * 0.78} cy={n.y - n.r * 0.78} r={3.5} fill="var(--t-red)" stroke="var(--paper-2)" strokeWidth={1.5} />
      )}
      <text
        x={lx}
        y={n.y - 8}
        fontSize={n.kind === "task" ? 12.5 : 11.5}
        fontWeight={n.focus ? 650 : 500}
        fill={done ? "var(--muted-foreground)" : "var(--foreground)"}
        textDecoration={done ? "line-through" : undefined}
      >
        {fit(title, LABEL_W, `${n.focus ? 650 : 500} ${n.kind === "task" ? 12.5 : 11.5}px ${FONT}`)}
      </text>
      <text x={lx} y={n.y + 18} fontSize={10.5} fill="var(--muted-foreground)" className="font-mono">
        {whenOf(t)}
      </text>
    </g>
  );
}

/** Whether a dependency has been met: a task that is done, or an external
 *  input that has arrived. Anything else has nothing to check off and stays
 *  greyed out. */
const depMet = (d: ResolvedDep) => (d.type === "task" || d.type === "ext") && !d.blocked;

/** What a task depends on, drawn above it as task-sized circles: greyed out
 *  until it is done, checked off once it is. */
function Shelf({ shelf, onOpen }: { shelf: LineageShelf; onOpen?: (id: string) => void }) {
  const r = TASK_R;
  return (
    <g>
      {shelf.items.map(({ dep, taskId, x, y }) => {
        const met = depMet(dep);
        const openable = !!taskId && !!onOpen;
        const lx = x + r + 12;
        return (
          <g
            key={dep.id}
            data-node
            tabIndex={openable ? 0 : -1}
            role={openable ? "button" : undefined}
            aria-label={openable ? `Open “${dep.name}”` : dep.name}
            className={cn("outline-none", openable ? "cursor-pointer" : "cursor-default")}
            onClick={() => openable && onOpen!(taskId!)}
            onKeyDown={(e) => { if (openable && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onOpen!(taskId!); } }}
          >
            <title>{`Depends on: ${dep.name} · ${dep.scope} · ${met ? "done" : "not done yet"}`}</title>
            <rect x={x - r - 4} y={y - r - 4} width={COL - 40} height={r * 2 + 8} fill="transparent" />
            <circle
              cx={x}
              cy={y}
              r={r}
              fill={met ? "var(--hue-done)" : "color-mix(in oklch, var(--ink-soft) 10%, var(--panel))"}
              stroke={met ? "var(--hue-done)" : "color-mix(in oklch, var(--ink-soft) 45%, transparent)"}
              strokeWidth={2}
              strokeDasharray={met ? undefined : "3 2.5"}
            />
            {met && (
              <path
                d={`M${x - r * 0.4} ${y + 0.5} l${r * 0.28} ${r * 0.3} l${r * 0.52} ${-r * 0.6}`}
                fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
              />
            )}
            <text x={lx} y={y - 3} fontSize={8.5} fontWeight={600} letterSpacing={0.5} fill="var(--muted-foreground)">
              DEPENDS ON
            </text>
            <text
              x={lx} y={y + 10} fontSize={11.5}
              fill={met ? "var(--muted-foreground)" : "color-mix(in oklch, var(--ink-soft) 70%, transparent)"}
              textDecoration={met ? "line-through" : undefined}
            >
              {fit(dep.name, COL - 116, `400 11.5px ${FONT}`)}
            </text>
          </g>
        );
      })}
      {shelf.more > 0 && (
        <text x={shelf.moreX} y={shelf.moreY} fontSize={10} fill="var(--muted-foreground)">
          +{shelf.more} more
        </text>
      )}
    </g>
  );
}

function DocMark({ n, onHover }: { n: LineageDocNode; onHover: (n: LineageNode | null) => void }) {
  const p = n.product;
  const meta = typeMeta(p.type);
  const Icon = meta.icon;
  const url = p.url && !p.placeholder ? p.url : "";
  const s = DOC_SIZE;
  const open = () => { if (url) window.open(url, "_blank", "noopener,noreferrer"); };
  return (
    <g
      data-node
      tabIndex={url ? 0 : -1}
      role={url ? "link" : undefined}
      aria-label={url ? `Open ${p.name}` : p.name}
      className={cn("outline-none", url ? "cursor-pointer" : "cursor-default")}
      onClick={open}
      onKeyDown={(e) => { if (url && e.key === "Enter") open(); }}
      onPointerEnter={() => onHover(n)}
      onPointerLeave={() => onHover(null)}
      onFocus={() => onHover(n)}
      onBlur={() => onHover(null)}
    >
      <rect x={n.x - s / 2 - 2} y={n.y - s / 2 - 2} width={150} height={s + 4} fill="transparent" />
      <rect
        x={n.x - s / 2}
        y={n.y - s / 2}
        width={s}
        height={s}
        rx={4}
        fill="var(--panel)"
        stroke={accentVar(meta.color)}
        strokeWidth={1.3}
        strokeDasharray={p.placeholder ? "2.5 2" : undefined}
      />
      <Icon x={n.x - 5} y={n.y - 5} width={10} height={10} color={accentVar(meta.color)} strokeWidth={2.2} />
      <text x={n.x + s / 2 + 8} y={n.y + 3.5} fontSize={10.5} fill={p.placeholder ? "var(--muted-foreground)" : "var(--ink-soft)"}>
        {fit(p.name || "Untitled file", LABEL_W - 24, `400 10.5px ${FONT}`)}
      </text>
    </g>
  );
}

/** Hover card, in screen space so it stays readable at any zoom. */
function Tip({ n, view, frameW, frameH }: { n: LineageNode; view: View; frameW: number; frameH: number }) {
  const sx = n.x * view.k + view.tx;
  const sy = n.y * view.k + view.ty;
  const left = Math.min(Math.max(8, sx - 110), Math.max(8, frameW - 228));
  // Below the node when it fits, above it when it would run out of the frame.
  const TIP_H = 92;
  const below = sy + 22 * view.k + 6;
  const top = below + TIP_H > frameH ? Math.max(8, sy - 22 * view.k - 6 - TIP_H) : below;
  const style = { left, top };
  if (n.kind === "doc") {
    const p = n.product;
    return (
      <div className="pointer-events-none absolute z-10 w-[220px] rounded-[var(--radius-sm)] border bg-[var(--panel)] px-3 py-2 text-[12px] shadow-md" style={style}>
        <div className="font-medium">{p.name || "Untitled file"}</div>
        <div className="text-muted-foreground mt-0.5">
          {typeMeta(p.type).label}
          {p.placeholder ? " · not uploaded yet" : p.url ? " · click to open" : ""}
          {p.date ? ` · ${fmtD(p.date)}` : ""}
        </div>
      </div>
    );
  }
  const t = n.task;
  const who = (t.assignees ?? [])[0];
  return (
    <div className="pointer-events-none absolute z-10 w-[220px] rounded-[var(--radius-sm)] border bg-[var(--panel)] px-3 py-2 text-[12px] shadow-md" style={style}>
      <div className="flex items-start gap-1.5 font-medium">
        {t.priority && <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[var(--t-red)]" />}
        <span>{t.title || "Untitled task"}</span>
      </div>
      <div className="text-muted-foreground mt-0.5">
        {n.kind === "subtask" ? "Subtask" : n.depth === 0 ? "Origin" : `Follow-up · step ${n.depth}`} · {statusLabel(t.status)}
        {who ? ` · ${who}` : ""}
      </div>
      {whenOf(t) && <div className="text-muted-foreground font-mono text-[11px]">{whenOf(t)}</div>}
      {n.focus ? (
        <div className="text-muted-foreground mt-1 text-[11px]">This task</div>
      ) : (
        <div className="mt-1 text-[11px] text-[var(--accent-c)]">Click to open</div>
      )}
    </div>
  );
}

function Legend() {
  return (
    <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
      <span className="inline-flex items-center gap-1"><span className="size-2.5 rounded-full border-2 border-[var(--hue-backlog)]" />Task</span>
      <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full border-[1.5px] border-[var(--hue-backlog)]" />Subtask</span>
      <span className="inline-flex items-center gap-1"><span className="size-2.5 rounded-[3px] border-[1.5px] border-[var(--ink-soft)]" />File</span>
      <span className="inline-flex items-center gap-1"><span className="size-2.5 rounded-full border-[1.5px] border-dashed border-[color-mix(in_oklch,var(--ink-soft)_45%,transparent)] bg-[color-mix(in_oklch,var(--ink-soft)_10%,var(--panel))]" />Depends on · not done</span>
      <span>↓ follow-ups</span>
      <span>→ subtasks</span>
    </div>
  );
}

/** The lineage as a section of the task editor: a compact, pannable view
 *  with a way out to a large one. Renders nothing when the task stands alone. */
/** A task's dependencies as the graph shows them. Milestone links are left
 *  out: they predate milestones deciding nothing and no longer gate work. */
export function lineageDeps(t: Task, ws: Pick<WorkingSet, "tasks" | "products" | "externals">): ResolvedDep[] {
  const deps = (t.deps ?? []).filter((d) => (d.type as string) !== "milestone");
  return depsOf({ ...t, deps }, ws);
}

export function LineageSection({
  task, ws, onOpenTask, height = 280,
}: {
  task: Task;
  ws: Pick<WorkingSet, "tasks" | "products" | "externals">;
  onOpenTask: (id: string) => void;
  height?: number;
}) {
  const lineage = useMemo(
    () => buildLineage(task, ws.tasks, ws.products, (t) => lineageDeps(t, ws)),
    [task, ws],
  );
  const [big, setBig] = useState(false);
  // A task on its own still has something to show when it waits on others.
  const hasShelf = lineage.nodes.some((n) => n.kind !== "doc" && n.shelf);
  if (lineage.nodes.length < 2 && !hasShelf) return null;

  const { followups, subtasks, docs, dependent } = lineage.counts;
  const caption = [
    followups && `${followups} follow-up${followups === 1 ? "" : "s"}`,
    subtasks && `${subtasks} subtask${subtasks === 1 ? "" : "s"}`,
    docs && `${docs} file${docs === 1 ? "" : "s"}`,
    dependent && `${dependent} with dependencies`,
  ].filter(Boolean).join(" · ");

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Label className="flex items-center gap-1.5"><GitBranch className="size-3.5" /> Lineage</Label>
        <span className="text-muted-foreground text-[11.5px]">{caption}</span>
        <button
          type="button"
          onClick={() => setBig(true)}
          className="text-muted-foreground hover:text-foreground ml-auto inline-flex items-center gap-1 text-[11.5px] font-medium"
        >
          <Maximize2 className="size-3" /> Expand
        </button>
      </div>
      <LineageGraph lineage={lineage} onOpenTask={onOpenTask} height={height} />
      <Legend />

      <Dialog open={big} onOpenChange={setBig}>
        <DialogContent className="flex h-[85dvh] w-[92vw] max-w-[1400px] flex-col gap-3 sm:max-w-[1400px]">
          <DialogHeader>
            <DialogTitle className="flex min-w-0 items-center gap-2 pr-8">
              <GitBranch className="size-4 shrink-0" />
              <span className="truncate">Lineage of “{task.title || "Untitled task"}”</span>
            </DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1">
            <LineageGraph
              lineage={lineage}
              wheelZoom
              onOpenTask={(id) => { setBig(false); onOpenTask(id); }}
            />
          </div>
          <Legend />
        </DialogContent>
      </Dialog>
    </div>
  );
}
