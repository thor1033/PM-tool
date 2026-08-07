"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { addMonths } from "date-fns";
import { Target, GitBranch, ChevronDown, SlidersHorizontal, ArrowUpDown } from "lucide-react";
import { useUpdateEntity } from "@/lib/api/hooks";
import type { Task, WorkingSet, Milestone } from "@/lib/types";
import { daysBetween, fmtD } from "@/lib/tasks";
import { accentVar } from "@/lib/colors";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { UnscheduledTray, UNSCHEDULED_DRAG_TYPE } from "@/components/modules/actions/unscheduled-tray";

const DAYW = 15; // px per day, matches the reference's density

// How far the grid opens by default — always symmetric around today, so the
// "today" line sits exactly in the middle of the axis. A real task/milestone
// dated further out than the chosen range still pulls that edge to include
// it (equally on both sides, to keep today centered), it's a floor not a clip.
const RANGE_OPTIONS = [
  { id: "1m", label: "±1 month", months: 1 },
  { id: "3m", label: "±3 months", months: 3 },
  { id: "6m", label: "±6 months", months: 6 },
  { id: "all", label: "All history", months: null },
] as const;
type RangeId = (typeof RANGE_OPTIONS)[number]["id"];
const RANGE_KEY = "atlas.actions.timelineRange";

export type TimelineSortMode = "track" | "sequence" | "deadline";
const SORT_OPTIONS: { id: TimelineSortMode; label: string }[] = [
  { id: "track", label: "Track" },
  { id: "sequence", label: "Sequence" },
  { id: "deadline", label: "Upcoming deadlines" },
];

const MAX_VISIBLE_ROWS = 8;
const ROW_H = 48, HDR_H = 44, TRACK_H = 40, SUB_ROW_H = 34;
const LABEL_W = 250;

const NO_TRACK_ID = "_none";

export interface TimelineFilters {
  cat: string[];
  from: string;
  to: string;
}
export const EMPTY_TIMELINE_FILTERS: TimelineFilters = { cat: [], from: "", to: "" };

function useClickOutside(onOutside: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function h(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) onOutside(); }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [onOutside]);
  return ref;
}

// ── Timeline-only filter panel (track + date overlap) ──────────────────────

export function TimelineFilterPopover({
  ws, filters, setFilters,
}: {
  ws: WorkingSet; filters: TimelineFilters; setFilters: (f: TimelineFilters) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(() => setOpen(false));
  const count = filters.cat.length + (filters.from ? 1 : 0) + (filters.to ? 1 : 0);
  const toggleCat = (id: string) =>
    setFilters({ ...filters, cat: filters.cat.includes(id) ? filters.cat.filter((x) => x !== id) : [...filters.cat, id] });

  return (
    <div className="relative" ref={ref}>
      <Button
        variant="outline"
        size="sm"
        className={cn("h-8 text-[13px]", count > 0 && "border-primary bg-primary/10 text-primary")}
        onClick={() => setOpen((v) => !v)}
      >
        <SlidersHorizontal className="size-3.5" /> Filter by...{count > 0 ? ` · ${count}` : ""}
      </Button>
      {open && (
        <div className="bg-popover absolute left-0 z-20 mt-1.5 w-72 rounded-[var(--radius-md)] border p-4 shadow-lg">
          <div className="mb-2 flex items-center justify-between">
            <p className="eyebrow">Track</p>
            {count > 0 && (
              <button onClick={() => setFilters(EMPTY_TIMELINE_FILTERS)} className="text-muted-foreground hover:text-foreground text-[12px] font-medium">
                Clear
              </button>
            )}
          </div>
          <div className="mb-4 flex flex-wrap gap-2">
            {ws.categories.map((c) => (
              <button
                key={c.id}
                onClick={() => toggleCat(c.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium transition",
                  filters.cat.includes(c.id) ? "bg-foreground text-background border-foreground" : "hover:bg-muted",
                )}
              >
                <span className="size-2 rounded-full" style={{ background: accentVar(c.color) }} />{c.label}
              </button>
            ))}
            <button
              onClick={() => toggleCat(NO_TRACK_ID)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium transition",
                filters.cat.includes(NO_TRACK_ID) ? "bg-foreground text-background border-foreground" : "hover:bg-muted",
              )}
            >
              <span className="bg-ink-ghost size-2 rounded-full" />No track
            </button>
          </div>
          <p className="eyebrow mb-2">Dates (task overlaps range)</p>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={filters.from}
              onChange={(e) => setFilters({ ...filters, from: e.target.value })}
              className="h-9 min-w-0 flex-1 rounded-[var(--radius-sm)] border bg-[var(--panel)] px-2 text-[13px]"
            />
            <span className="text-muted-foreground text-[13px]">to</span>
            <input
              type="date"
              value={filters.to}
              onChange={(e) => setFilters({ ...filters, to: e.target.value })}
              className="h-9 min-w-0 flex-1 rounded-[var(--radius-sm)] border bg-[var(--panel)] px-2 text-[13px]"
            />
          </div>
        </div>
      )}
    </div>
  );
}

export function TimelineSortPopover({
  sort, onChange, showCP, onToggleCP,
}: {
  sort: TimelineSortMode; onChange: (v: TimelineSortMode) => void;
  showCP: boolean; onToggleCP: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(() => setOpen(false));
  const active = sort !== "track" || showCP;
  return (
    <div className="flex items-center gap-2">
      <div className="relative" ref={ref}>
        <Button
          variant="outline"
          size="sm"
          className={cn("h-8 text-[13px]", active && "border-primary bg-primary/10 text-primary")}
          onClick={() => setOpen((v) => !v)}
        >
          <ArrowUpDown className="size-3.5" /> Sort by...
        </Button>
        {open && (
          <div className="bg-popover absolute left-0 z-20 mt-1.5 w-52 rounded-[var(--radius-md)] border p-1.5 shadow-lg">
            {SORT_OPTIONS.map((o) => (
              <button
                key={o.id}
                onClick={() => { onChange(o.id); setOpen(false); }}
                className={cn(
                  "flex w-full items-center rounded-[var(--radius-sm)] px-3 py-2 text-left text-[13.5px] transition",
                  sort === o.id ? "bg-muted font-semibold" : "hover:bg-muted",
                )}
              >
                {o.label}
              </button>
            ))}
            <div className="my-1 border-t" />
            <button
              onClick={() => { onToggleCP(); setOpen(false); }}
              className={cn(
                "flex w-full items-center justify-between rounded-[var(--radius-sm)] px-3 py-2 text-left text-[13.5px] transition",
                showCP ? "bg-muted font-semibold" : "hover:bg-muted",
              )}
            >
              <span className="inline-flex items-center gap-2"><Target className="size-3.5" /> Critical path</span>
              {showCP && <span className="text-primary text-[12px]">On</span>}
            </button>
          </div>
        )}
      </div>
      {sort !== "track" && (
        <span className="rounded-[var(--radius-sm)] bg-[var(--paper-2)] px-2.5 py-1 text-[12.5px] font-medium text-muted-foreground">
          {SORT_OPTIONS.find((o) => o.id === sort)?.label}
        </span>
      )}
      {showCP && (
        <span className="rounded-[var(--radius-sm)] bg-[var(--paper-2)] px-2.5 py-1 text-[12.5px] font-medium text-muted-foreground">
          Critical path
        </span>
      )}
    </div>
  );
}

export function TimelineView({
  ws, projectId, filtered, filters, sort, showCP, onEdit, onEditMilestone,
}: {
  ws: WorkingSet; projectId: string; filtered: Task[]; onEdit: (t: Task) => void;
  onEditMilestone: (m: Milestone) => void;
  filters: TimelineFilters;
  sort: TimelineSortMode;
  showCP: boolean;
}) {
  const updateTask = useUpdateEntity(projectId, "tasks");
  const scrollRef = useRef<HTMLDivElement>(null);

  const [range, setRange] = useState<RangeId>(() => {
    if (typeof window === "undefined") return "1m";
    const saved = window.localStorage.getItem(`${RANGE_KEY}.${projectId}`);
    return RANGE_OPTIONS.some((r) => r.id === saved) ? (saved as RangeId) : "1m";
  });
  const [rangeMenuOpen, setRangeMenuOpen] = useState(false);
  function changeRange(id: RangeId) {
    setRange(id);
    setRangeMenuOpen(false);
    try { window.localStorage.setItem(`${RANGE_KEY}.${projectId}`, id); } catch { /* best-effort */ }
  }

  const filterActive = filters.cat.length > 0 || !!filters.from || !!filters.to;
  const catMap = useMemo(() => new Map(ws.categories.map((c) => [c.id, c])), [ws.categories]);

  const dateFiltered = useMemo(() => {
    return filtered.filter((t) => {
      if (filters.cat.length) {
        const key = t.category && catMap.has(t.category) ? t.category : NO_TRACK_ID;
        if (!filters.cat.includes(key)) return false;
      }
      if (filters.from && t.end && t.end < filters.from) return false;
      if (filters.to && t.start && t.start > filters.to) return false;
      return true;
    });
  }, [filtered, filters, catMap]);

  const dated = dateFiltered.filter((t) => !t.parentId && t.start && t.end);
  const undated = dateFiltered.filter((t) => !t.parentId && (!t.start || !t.end));
  const datedMs = ws.milestones.filter((m) => m.date);

  // Dated subtasks get their own thin nested bar under the parent's row —
  // they don't participate in track grouping, critical path, or dependency
  // lines (those are top-level-task concepts), just a visual child of
  // whichever parent row they belong to.
  const datedSubsByParent = useMemo(() => {
    const map = new Map<string, Task[]>();
    dateFiltered.forEach((t) => {
      if (!t.parentId || !t.start || !t.end) return;
      const arr = map.get(t.parentId) ?? [];
      arr.push(t);
      map.set(t.parentId, arr);
    });
    return map;
  }, [dateFiltered]);

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

  if (!dated.length && !datedMs.length) {
    return (
      <div>
        <UnscheduledTray tasks={undated} onEdit={onEdit} needsStart />
        <div className="flex flex-col items-center rounded-[var(--radius-lg)] border border-dashed p-16 text-center">
          <GitBranch className="text-muted-foreground/40 mb-3 size-8" />
          <p className="font-serif-display text-[17px] font-medium">No dated tasks yet</p>
          <p className="text-muted-foreground mt-1 text-sm">Add start and end dates to tasks to see them on the timeline, or drag one from the list above onto the grid.</p>
        </div>
      </div>
    );
  }

  const allDates = [...dated.flatMap((t) => [t.start, t.end]), ...datedMs.map((m) => m.date)];
  const now = Date.now();
  // The axis is always symmetric around today, so "today" lands exactly in
  // the middle. "All" spans the full data range (equally padded both ways so
  // it stays centered); every other option is a hard ±N-month window — tasks
  // outside it are excluded from the grid, not just scrolled-past, and are
  // surfaced instead in the "outside range" strip below.
  const rangeMonths = RANGE_OPTIONS.find((r) => r.id === range)?.months ?? null;
  let halfSpanMs: number;
  if (rangeMonths == null) {
    let farthestMs = 4 * 86_400_000;
    allDates.forEach((d) => { const dist = Math.abs(+new Date(d) - now); if (dist > farthestMs) farthestMs = dist; });
    halfSpanMs = farthestMs;
  } else {
    halfSpanMs = +addMonths(new Date(now), rangeMonths) - now;
  }
  const rangeMin = new Date(now - halfSpanMs);
  const rangeMax = new Date(now + halfSpanMs);
  const minStr = rangeMin.toISOString().slice(0, 10);
  const maxStr = rangeMax.toISOString().slice(0, 10);
  const totalDays = Math.max(1, daysBetween(minStr, maxStr));
  const totalW = totalDays * DAYW;

  // A hard ±N-month range excludes tasks whose whole bar falls outside the
  // window instead of stretching the axis to fit them — "All" never excludes
  // anything since its window is derived from the data itself. To avoid a
  // track looking abruptly empty right at the edge, the single nearest
  // non-overlapping task just before rangeMin and just after rangeMax are
  // pulled in too and clamped to render at that edge.
  const overlapping = dated.filter((t) => t.start <= maxStr && t.end >= minStr);
  const before = dated.filter((t) => t.end < minStr).sort((a, b) => b.end.localeCompare(a.end))[0];
  const after = dated.filter((t) => t.start > maxStr).sort((a, b) => a.start.localeCompare(b.start))[0];
  const inRangeDated = [...overlapping, ...(before ? [before] : []), ...(after ? [after] : [])];
  const edgeClampedIds = new Set([before?.id, after?.id].filter(Boolean) as string[]);
  const inRangeMs = datedMs.filter((m) => m.date >= minStr && m.date <= maxStr);
  const inRangeGates = inRangeMs
    .filter((m) => m.type === "gate")
    .map((m) => ({ ...m, left: daysBetween(minStr, m.date) * DAYW }));
  const inRangeMilestones = inRangeMs
    .filter((m) => m.type !== "gate")
    .map((m) => ({
      ...m,
      left: daysBetween(minStr, m.date) * DAYW,
      color: m.category ? accentVar(catMap.get(m.category)?.color ?? "") : "var(--accent-c)",
    }));

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
    const el = scrollRef.current;
    if (el && todayLeft != null) {
      // Center "today" (LABEL_W + todayLeft, in document coords) within the
      // scroll container's visible width, re-centering whenever the range
      // changes so today always sits in the middle of what's on screen.
      el.scrollLeft = Math.max(0, LABEL_W + todayLeft - el.clientWidth / 2);
    }
  }, [todayLeft, totalW]);

  // "Upcoming deadlines" abandons track grouping entirely: one flat list,
  // soonest end date first, track shown inline as a small tag per row
  // instead of a section header.
  const deadlineMode = sort === "deadline";
  const groups: { id: string; label: string; color: string | null; tasks: Task[] }[] = [];
  if (deadlineMode) {
    const flat = [...inRangeDated].sort((a, b) => a.end.localeCompare(b.end));
    groups.push({ id: "_deadline", label: "Upcoming deadlines", color: null, tasks: flat });
  } else {
    const bycat = new Map<string, Task[]>();
    inRangeDated.forEach((t) => {
      // A category id that no longer matches any real category (deleted/
      // renamed track, bad import) is treated the same as "no category" —
      // otherwise the task lands in a bucket nothing renders and silently
      // disappears from the gantt, same failure mode fixed in List view.
      const key = t.category && catMap.has(t.category) ? t.category : "_none";
      const arr = bycat.get(key) ?? [];
      arr.push(t);
      bycat.set(key, arr);
    });
    ws.categories.forEach((c) => {
      const tasks = bycat.get(c.id);
      if (tasks?.length) groups.push({ id: c.id, label: c.label, color: c.color, tasks: sort === "sequence" ? sortBySequence(tasks) : tasks });
    });
    const noTrack = bycat.get("_none");
    if (noTrack?.length) groups.push({ id: "_none", label: "No track", color: null, tasks: sort === "sequence" ? sortBySequence(noTrack) : noTrack });
    // "Sequence" also reorders the track rows themselves by their earliest
    // task date, so the whole gantt reads top-to-bottom in delivery order
    // instead of category-creation order.
    if (sort === "sequence") {
      groups.sort((a, b) => (a.tasks[0]?.start || "9999").localeCompare(b.tasks[0]?.start || "9999"));
    }
  }

  // Gates/milestones belong to a track, not to whichever row happens to sit
  // nearby — each renders inside its own track's colored band, at its date's
  // x-position, instead of a single global marker strip with no real
  // association to what it visually overlaps. "Upcoming deadlines" sort has
  // no track bands at all, so everything falls back to "ungrouped" there too.
  const groupIds = new Set(groups.map((g) => g.id));
  const gatesByGroup = new Map<string, typeof inRangeGates>();
  const milestonesByGroup = new Map<string, typeof inRangeMilestones>();
  const ungroupedGates: typeof inRangeGates = [];
  const ungroupedMilestones: typeof inRangeMilestones = [];
  inRangeGates.forEach((g) => {
    const key = g.category && groupIds.has(g.category) ? g.category : null;
    if (deadlineMode || !key) { ungroupedGates.push(g); return; }
    const arr = gatesByGroup.get(key) ?? [];
    arr.push(g);
    gatesByGroup.set(key, arr);
  });
  inRangeMilestones.forEach((m) => {
    const key = m.category && groupIds.has(m.category) ? m.category : null;
    if (deadlineMode || !key) { ungroupedMilestones.push(m); return; }
    const arr = milestonesByGroup.get(key) ?? [];
    arr.push(m);
    milestonesByGroup.set(key, arr);
  });

  const EDGE_BAR_W = DAYW * 3;
  function layoutBar(t: Task, rowTop: number, rowH: number) {
    let barLeft: number, barWidth: number;
    // A task pulled in from just outside the window renders as a short
    // marker pinned right at that edge — its true bar would be off-screen
    // (or absurdly wide), so it isn't drawn to scale, just placed as "the
    // last one" at the boundary.
    if (edgeClampedIds.has(t.id) && t.end < minStr) {
      barWidth = EDGE_BAR_W;
      barLeft = 0;
    } else if (edgeClampedIds.has(t.id) && t.start > maxStr) {
      barWidth = EDGE_BAR_W;
      barLeft = totalW - barWidth;
    } else {
      barLeft = daysBetween(minStr, t.start) * DAYW;
      barWidth = Math.max(DAYW, daysBetween(t.start, t.end) * DAYW);
    }
    return { rowY: rowTop + rowH / 2, barLeft, barWidth };
  }
  const taskLayout = new Map<string, { rowY: number; barLeft: number; barWidth: number }>();
  const subLayout = new Map<string, { rowY: number; barLeft: number; barWidth: number }>();
  let yCursor = HDR_H;
  groups.forEach((g) => {
    yCursor += TRACK_H;
    g.tasks.forEach((t) => {
      taskLayout.set(t.id, layoutBar(t, yCursor, ROW_H));
      yCursor += ROW_H;
      (datedSubsByParent.get(t.id) ?? []).forEach((sub) => {
        subLayout.set(sub.id, layoutBar(sub, yCursor, SUB_ROW_H));
        yCursor += SUB_ROW_H;
      });
    });
  });
  const totalH = yCursor + 20;

  const depLines: {
    key: string; from: { x: number; y: number }; to: { x: number; y: number };
    violated: boolean; color: string; task: Task; title: string; critical: boolean;
  }[] = [];
  ws.tasks.forEach((t) => {
    if (!t.start || !t.end || !taskLayout.has(t.id)) return;
    // An edge-clamped bar is a pinned marker, not drawn at its true position
    // — a dependency line to/from it would connect to a fake location and
    // draw a distorted loop across unrelated bars, so skip it entirely.
    if (edgeClampedIds.has(t.id)) return;
    (t.deps ?? []).forEach((d) => {
      if (d.type !== "task") return;
      const pred = ws.tasks.find((x) => x.id === d.refId);
      if (!pred?.start || !pred.end || !taskLayout.has(pred.id)) return;
      if (edgeClampedIds.has(pred.id)) return;
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

  function dropDateAt(clientX: number): string | null {
    const el = scrollRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const x = clientX - rect.left + el.scrollLeft - LABEL_W;
    if (x < 0) return null;
    const dayOffset = Math.floor(x / DAYW);
    const d = new Date(minStr);
    d.setDate(d.getDate() + dayOffset);
    return d.toISOString().slice(0, 10);
  }

  function handleGridDrop(e: React.DragEvent) {
    const taskId = e.dataTransfer.getData(UNSCHEDULED_DRAG_TYPE);
    if (!taskId) return;
    e.preventDefault();
    const start = dropDateAt(e.clientX);
    if (!start) return;
    const s = new Date(start);
    s.setDate(s.getDate() + 1);
    updateTask.mutate(
      { id: taskId, data: { start, end: s.toISOString().slice(0, 10) } },
      { onError: (err) => toast.error((err as Error).message) },
    );
  }

  return (
    <div>
      <UnscheduledTray tasks={undated} onEdit={onEdit} needsStart />

      <div className="relative z-40 mb-2 flex flex-wrap items-center gap-2.5">
        <div className="flex-1" />
        <div className="relative">
          <Button
            variant="outline"
            size="sm"
            className="h-8 overflow-hidden text-[13px] text-foreground"
            style={{
              background: "linear-gradient(90deg, color-mix(in oklch, var(--ink-ghost) 20%, var(--panel)) 50%, color-mix(in oklch, var(--accent-c) 12%, var(--panel)) 50%)",
            }}
            onClick={() => setRangeMenuOpen((v) => !v)}
            title="How far back and forward the timeline opens by default — always centered on today"
          >
            {RANGE_OPTIONS.find((r) => r.id === range)?.label}
            <ChevronDown className="size-3.5" />
          </Button>
          {rangeMenuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setRangeMenuOpen(false)} />
              <div className="bg-popover absolute right-0 z-20 mt-1.5 w-40 rounded-[var(--radius-md)] border p-1 shadow-lg">
                {RANGE_OPTIONS.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => changeRange(r.id)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-[13px]",
                      r.id === range ? "bg-foreground text-background" : "hover:bg-muted",
                    )}
                  >
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ background: "linear-gradient(90deg, var(--ink-ghost) 50%, var(--accent-c) 50%)" }}
                    />
                    {r.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3 text-[12.5px]">
        {filterActive && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 font-medium text-primary">
            Filters applied
          </span>
        )}
        {(sort !== "track" || showCP) && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 font-medium text-primary">
            Sorting applied
          </span>
        )}
      </div>

      <div
        ref={scrollRef}
        className="overflow-auto rounded-[var(--radius-lg)] border"
        style={{ maxHeight: HDR_H + MAX_VISIBLE_ROWS * ROW_H }}
        onDragOver={(e) => { if (e.dataTransfer.types.includes(UNSCHEDULED_DRAG_TYPE)) e.preventDefault(); }}
        onDrop={handleGridDrop}
      >
        <div className="relative" style={{ minWidth: LABEL_W + totalW }}>
          {todayLeft !== null && (
            <>
              <div className="pointer-events-none absolute bottom-0 top-0 z-0 bg-[var(--paper-2)]/60" style={{ left: LABEL_W, width: todayLeft }} />
              <div className="pointer-events-none absolute bottom-0 top-0 z-0 bg-[var(--paper-2)]/60" style={{ left: LABEL_W + todayLeft, width: Math.max(0, totalW - todayLeft) }} />
              {/* Today line — runs the full height of the grid, header through the last task row */}
              <div className="border-primary pointer-events-none absolute bottom-0 top-0 z-40 border-l-[2.5px]" style={{ left: LABEL_W + todayLeft }} />
            </>
          )}
          {inRangeGates.map((g) => (
            // Gate line — runs the full height of the grid, same as the today line
            <div key={g.id} onClick={() => onEditMilestone(g)} className="absolute bottom-0 top-0 z-40 cursor-pointer border-l-[2.5px] border-[var(--t-red)]" style={{ left: LABEL_W + g.left }} title={`${g.title} (gate) — ${fmtD(g.date)}`} />
          ))}
          {depLines.length > 0 && (
            <svg className="pointer-events-none absolute top-0 z-[5] overflow-visible" style={{ left: LABEL_W, width: totalW, height: totalH }}>
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

          {/* Header — sticky so it stays visible while the grid scrolls vertically past MAX_VISIBLE_ROWS */}
          <div className="sticky top-0 z-50 flex border-b bg-[var(--paper-2)]" style={{ height: HDR_H }}>
            <div className="text-muted-foreground sticky left-0 z-10 shrink-0 border-r bg-[var(--paper-2)] px-4 py-2.5 font-mono text-[11.5px] font-medium uppercase tracking-wide" style={{ width: LABEL_W }}>
              {deadlineMode ? "Task" : "Track / Task"}
            </div>
            <div className="relative flex-1 overflow-hidden" style={{ width: totalW }}>
              {months.map((m, i) => (
                <div key={i} className="text-muted-foreground absolute top-0 border-l px-2.5 py-2.5 font-mono text-[12px]" style={{ left: m.left, width: m.width, overflow: "hidden", whiteSpace: "nowrap" }}>
                  {m.label}
                </div>
              ))}
            </div>
          </div>

          {todayLeft !== null && (
            // Block-level sticky wrapper pins vertically at HDR_H below the
            // scroll container's top (same offset the header sticks to), so
            // it tracks vertical scroll exactly like the header does. The
            // pill inside is absolutely positioned purely for horizontal
            // placement — `sticky` only honors offsets on the element it's
            // directly applied to, not on an absolutely-positioned one.
            <div className="pointer-events-none sticky z-40 h-0" style={{ top: HDR_H + 6 }}>
              <span
                className="bg-primary text-primary-foreground absolute -translate-x-1/2 whitespace-nowrap rounded px-1.5 py-0.5 font-mono text-[10px] font-bold"
                style={{ left: LABEL_W + todayLeft }}
              >
                Today
              </span>
            </div>
          )}
          {/* Milestones/gates with no track (or in deadline-sort mode, which
              drops track grouping entirely) have no band of their own to
              live in — surfaced here instead, pinned under the header. */}
          {(ungroupedGates.length > 0 || ungroupedMilestones.length > 0) && (
            <div className="pointer-events-none sticky z-40 h-0" style={{ top: HDR_H + 6 }}>
              {ungroupedGates.map((g) => (
                <button
                  key={g.id}
                  onClick={() => onEditMilestone(g)}
                  className="pointer-events-auto absolute -translate-x-1/2 cursor-pointer whitespace-nowrap rounded bg-[var(--t-red)] px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wide text-white"
                  style={{ left: LABEL_W + g.left }}
                  title={`${g.title} (gate) — ${fmtD(g.date)} — no track`}
                >
                  Gate
                </button>
              ))}
              {ungroupedMilestones.map((m) => (
                <button
                  key={m.id}
                  onClick={() => onEditMilestone(m)}
                  className="pointer-events-auto absolute flex -translate-x-1/2 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full py-0.5 pl-1 pr-2 font-mono text-[11px] font-bold text-white transition hover:brightness-110"
                  style={{ left: LABEL_W + m.left, background: m.color }}
                  title={`${m.title} — ${fmtD(m.date)} — no track`}
                >
                  <span className="text-[15px] leading-none">◆</span>
                  {m.title}
                </button>
              ))}
            </div>
          )}

          {/* Groups */}
          {groups.map((g) => {
            const col = g.color ? accentVar(g.color) : "var(--ink-ghost)";
            return (
              <div key={g.id}>
                {!deadlineMode && (
                  <div className="flex border-b" style={{ height: TRACK_H, background: g.color ? `color-mix(in oklch, ${col} 10%, var(--panel))` : "var(--paper-2)" }}>
                    <div
                      className="sticky left-0 z-50 flex shrink-0 items-center gap-2 border-r px-4 py-1"
                      style={{ width: LABEL_W, background: g.color ? `color-mix(in oklch, ${col} 10%, var(--panel))` : "var(--paper-2)" }}
                    >
                      <span className="size-2.5 shrink-0 rounded-full" style={{ background: col }} />
                      <span className="eyebrow text-[11.5px]" style={g.color ? { color: col } : undefined}>{g.label}</span>
                    </div>
                    <div className="relative flex-1" style={{ width: totalW }}>
                      {(gatesByGroup.get(g.id) ?? []).map((gate) => (
                        <button
                          key={gate.id}
                          onClick={() => onEditMilestone(gate)}
                          className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-pointer whitespace-nowrap rounded bg-[var(--t-red)] px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wide text-white"
                          style={{ left: gate.left }}
                          title={`${gate.title} (gate) — ${fmtD(gate.date)}`}
                        >
                          Gate
                        </button>
                      ))}
                      {(milestonesByGroup.get(g.id) ?? []).map((m) => (
                        <button
                          key={m.id}
                          onClick={() => onEditMilestone(m)}
                          className="absolute top-1/2 flex -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full py-0.5 pl-1 pr-2 font-mono text-[11px] font-bold text-white transition hover:brightness-110"
                          style={{ left: m.left, background: m.color }}
                          title={`${m.title} — ${fmtD(m.date)}`}
                        >
                          <span className="text-[13px] leading-none">◆</span>
                          {m.title}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {g.tasks.map((t) => (
                  <>
                    <GanttRow
                      key={t.id} task={t} layout={taskLayout.get(t.id)!}
                      barColorVar={t.category ? accentVar(catMap.get(t.category)?.color ?? "") : col}
                      trackLabel={deadlineMode ? (t.category ? catMap.get(t.category)?.label ?? "No track" : "No track") : null}
                      minStr={minStr} totalW={totalW}
                      gates={inRangeMs.filter((m) => m.type === "gate")}
                      critical={showCP && cp.has(t.id)}
                      edgeClamped={edgeClampedIds.has(t.id)}
                      onEdit={() => onEdit(t)}
                      onCommit={(start, end) => updateTask.mutate({ id: t.id, data: { start, end } }, { onError: (e) => toast.error((e as Error).message) })}
                    />
                    {(datedSubsByParent.get(t.id) ?? []).map((sub) => (
                      <SubGanttRow
                        key={sub.id} task={sub} layout={subLayout.get(sub.id)!}
                        barColorVar={t.category ? accentVar(catMap.get(t.category)?.color ?? "") : col}
                        minStr={minStr} totalW={totalW}
                        onEdit={() => onEdit(sub)}
                        onCommit={(start, end) => updateTask.mutate({ id: sub.id, data: { start, end } }, { onError: (e) => toast.error((e as Error).message) })}
                      />
                    ))}
                  </>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      <div className="text-muted-foreground mt-4 flex flex-wrap gap-5 text-[13px]">
        <span className="inline-flex items-center gap-2"><span className="inline-block h-3 w-5 rounded-[3px]" style={{ background: "var(--accent-c)" }} /> In progress</span>
        <span className="inline-flex items-center gap-2"><span className="inline-block h-3 w-5 rounded-[3px]" style={{ background: "var(--hue-done)" }} /> Done</span>
        <span className="inline-flex items-center gap-2" style={{ color: "var(--accent-deep)" }}>◆ Milestone</span>
        <span className="inline-flex items-center gap-2 text-[var(--t-red)]">▐ Gate</span>
        <span className="inline-flex items-center gap-2 text-[var(--t-red)]">Dependency block (double-click to inspect)</span>
      </div>
    </div>
  );
}

/** Orders tasks by start date, undated last — the "Sequence" sort's per-group
 *  ordering (dependency-aware ordering lives in lib/tasks.sequenceTasks; this
 *  simpler date sort is what Timeline needs since bars already show duration). */
function sortBySequence(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => (a.start || "9999").localeCompare(b.start || "9999"));
}

// ── gantt row with drag-move / drag-resize ──────────────────────────────────

function GanttRow({
  task, layout, barColorVar, trackLabel, minStr, totalW, gates, critical, edgeClamped, onEdit, onCommit,
}: {
  task: Task; layout: { rowY: number; barLeft: number; barWidth: number }; barColorVar: string;
  trackLabel: string | null;
  minStr: string; totalW: number;
  gates: Milestone[]; critical: boolean;
  edgeClamped: boolean;
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
    <div className="group flex border-b hover:bg-[var(--paper-2)]" style={{ height: 48 }}>
      <div className="sticky left-0 z-50 flex shrink-0 items-center gap-2 border-r bg-[var(--panel)] px-4 group-hover:bg-[var(--paper-2)]" style={{ width: 250 }}>
        {trackLabel && (
          <span className="text-muted-foreground shrink-0 rounded-full border px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide">
            {trackLabel}
          </span>
        )}
        <button onClick={onEdit} className="hover:text-primary min-w-0 flex-1 truncate text-left text-[13.5px]" title={task.title}>{task.title}</button>
      </div>
      <div className="relative flex-1 overflow-hidden" style={{ width: totalW }}>
        {gates.map((m) => (
          <div key={m.id} className="pointer-events-none absolute inset-y-0 border-l-[1.5px] border-dashed border-[oklch(0.63_0.12_25/0.3)]" style={{ left: daysBetween(minStr, m.date) * DAYW }} />
        ))}
        <div
          ref={barRef}
          className={cn(
            "shadow-xs absolute top-[9px] z-10 flex h-[30px] items-center overflow-hidden rounded-[7px] select-none",
            edgeClamped ? "cursor-pointer border-2 border-dashed border-white/60" : "cursor-grab",
            task.status === "done" && "opacity-55",
            isPast && task.status !== "done" && "opacity-40 grayscale-[0.4]",
            critical && "ring-2 ring-[var(--t-red)]",
          )}
          style={{ left: visual.left, width: visual.width, background: `color-mix(in oklch, ${barColorVar} 88%, white)` }}
          onPointerDown={(e) => { if (!edgeClamped) onPointerDown(e, "move"); }}
          onDoubleClick={onEdit}
          title={
            edgeClamped
              ? `${task.title} · ${fmtD(task.start)} → ${fmtD(task.end)} — outside the current range, shown at the edge · double-click to open`
              : `${task.title} · ${fmtD(task.start)} → ${fmtD(task.end)}`
          }
        >
          <span className="pointer-events-none absolute inset-0 flex items-center truncate px-2.5 text-[12.5px] font-semibold text-white [text-shadow:0_1px_2px_rgba(0,0,0,.18)]">
            {visual.width > 44 ? task.title : ""}
          </span>
          {!edgeClamped && (
            <>
              <span className="absolute left-0 top-0 h-full w-2 cursor-ew-resize" onPointerDown={(e) => onPointerDown(e, "l")} />
              <span className="absolute right-0 top-0 h-full w-2 cursor-ew-resize" onPointerDown={(e) => onPointerDown(e, "r")} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── nested subtask row — thinner bar, no gates/resize, indented under its parent ──

function SubGanttRow({
  task, layout, barColorVar, minStr, totalW, onEdit, onCommit,
}: {
  task: Task; layout: { rowY: number; barLeft: number; barWidth: number }; barColorVar: string;
  minStr: string; totalW: number;
  onEdit: () => void;
  onCommit: (start: string, end: string) => void;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startX: number; start0: Date; end0: Date; moved: boolean; preview?: { start: string; end: string } } | null>(null);
  const [visual, setVisual] = useState({ left: layout.barLeft, width: layout.barWidth });

  useEffect(() => setVisual({ left: layout.barLeft, width: layout.barWidth }), [layout.barLeft, layout.barWidth]);

  function onPointerDown(e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    drag.current = { startX: e.clientX, start0: new Date(task.start), end0: new Date(task.end), moved: false };
    document.body.style.cursor = "grabbing";
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }
  function onMove(e: PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const deltaDays = Math.round((e.clientX - d.startX) / DAYW);
    if (deltaDays !== 0) d.moved = true;
    const s = new Date(+d.start0 + deltaDays * 86_400_000);
    const en = new Date(+d.end0 + deltaDays * 86_400_000);
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

  return (
    <div className="flex border-b bg-[var(--paper-2)]/40 hover:bg-[var(--paper-2)]" style={{ height: SUB_ROW_H }}>
      <div className="sticky left-0 z-50 flex shrink-0 items-center gap-1.5 border-r bg-[var(--panel)] pl-8 pr-4" style={{ width: LABEL_W }}>
        <span className="text-muted-foreground/40 text-xs">↳</span>
        <button onClick={onEdit} className="hover:text-primary min-w-0 flex-1 truncate text-left text-[12.5px] text-muted-foreground" title={task.title}>{task.title}</button>
      </div>
      <div className="relative flex-1" style={{ width: totalW }}>
        <div
          ref={barRef}
          className={cn(
            "shadow-xs absolute top-[7px] flex h-[20px] cursor-grab items-center overflow-hidden rounded-[5px] select-none",
            task.status === "done" && "opacity-55",
          )}
          style={{ left: visual.left, width: visual.width, background: `color-mix(in oklch, ${barColorVar} 70%, white)` }}
          onPointerDown={onPointerDown}
          onDoubleClick={onEdit}
          title={`${task.title} · ${fmtD(task.start)} → ${fmtD(task.end)}`}
        >
          <span className="pointer-events-none absolute inset-0 flex items-center truncate px-2 text-[11px] font-medium text-white [text-shadow:0_1px_2px_rgba(0,0,0,.18)]">
            {visual.width > 36 ? task.title : ""}
          </span>
        </div>
      </div>
    </div>
  );
}
