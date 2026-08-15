"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { addMonths } from "date-fns";
import { GitBranch, ChevronDown, SlidersHorizontal, ArrowUpDown, Eye, EyeOff } from "lucide-react";
import { useUpdateEntity } from "@/lib/api/hooks";
import type { Task, WorkingSet, Milestone } from "@/lib/types";
import { daysBetween, fmtD, NO_TRACK_ID } from "@/lib/tasks";
import { accentVar } from "@/lib/colors";
import { stackMarkers } from "@/lib/marker-stack";
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
/** Minimum clear space between two markers before one drops to the next row,
 *  and the height of each of those rows. */
const MARKER_GAP = 26, MARKER_ROW_H = 21;
const LABEL_W = 250;


export interface TimelineFilters {
  cat: string[];
  from: string;
  to: string;
}
export const EMPTY_TIMELINE_FILTERS: TimelineFilters = { cat: [], from: "", to: "" };

/** Optional overlays on the gantt — each can be switched off to cut visual
 *  noise without changing which tasks are shown. */
export interface TimelineLayers {
  milestones: boolean;
  gates: boolean;
  deps: boolean;
  today: boolean;
  subtasks: boolean;
}
export const ALL_TIMELINE_LAYERS: TimelineLayers = {
  milestones: true, gates: true, deps: true, today: true, subtasks: true,
};
export const LAYER_OPTIONS: { id: keyof TimelineLayers; label: string; hint: string }[] = [
  { id: "deps", label: "Dependency lines", hint: "Arrows between linked tasks" },
  { id: "milestones", label: "Milestones", hint: "Diamond markers in each track" },
  { id: "gates", label: "Gates", hint: "Full-height checkpoint lines" },
  { id: "subtasks", label: "Subtask bars", hint: "Nested bars under their parent" },
  { id: "today", label: "Today line", hint: "The vertical marker on today" },
];
export const TIMELINE_LAYERS_KEY = "atlas.actions.timelineLayers";

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
        <div className="bg-popover absolute left-0 z-[70] mt-1.5 w-72 rounded-[var(--radius-md)] border p-4 shadow-lg">
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

export function TimelineLayersPopover({
  layers, setLayers,
}: {
  layers: TimelineLayers; setLayers: (v: TimelineLayers) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(() => setOpen(false));
  const hidden = LAYER_OPTIONS.filter((o) => !layers[o.id]).length;
  return (
    <div className="flex items-center gap-2">
      <div className="relative" ref={ref}>
        <Button
          variant="outline"
          size="sm"
          className={cn("h-8 text-[13px]", hidden > 0 && "border-primary bg-primary/10 text-primary")}
          onClick={() => setOpen((v) => !v)}
        >
          <Eye className="size-3.5" /> Show...{hidden > 0 ? ` · ${hidden} off` : ""}
        </Button>
        {open && (
          <div className="bg-popover absolute left-0 z-[70] mt-1.5 w-64 rounded-[var(--radius-md)] border p-1.5 shadow-lg">
            {LAYER_OPTIONS.map((o) => {
              const on = layers[o.id];
              return (
                <button
                  key={o.id}
                  onClick={() => setLayers({ ...layers, [o.id]: !on })}
                  className="hover:bg-muted flex w-full items-start gap-2.5 rounded-[var(--radius-sm)] px-3 py-2 text-left transition"
                >
                  {on
                    ? <Eye className="mt-0.5 size-3.5 shrink-0 text-primary" />
                    : <EyeOff className="text-muted-foreground/60 mt-0.5 size-3.5 shrink-0" />}
                  <span className="min-w-0 flex-1">
                    <span className={cn("block text-[13.5px]", on ? "font-semibold" : "text-muted-foreground")}>
                      {o.label}
                    </span>
                    <span className="text-muted-foreground/70 block text-[11.5px]">{o.hint}</span>
                  </span>
                </button>
              );
            })}
            {hidden > 0 && (
              <>
                <div className="my-1 border-t" />
                <button
                  onClick={() => setLayers(ALL_TIMELINE_LAYERS)}
                  className="text-muted-foreground hover:text-foreground hover:bg-muted w-full rounded-[var(--radius-sm)] px-3 py-1.5 text-left text-[12.5px] font-medium transition"
                >
                  Show all
                </button>
              </>
            )}
          </div>
        )}
      </div>
      {hidden > 0 && (
        <span className="rounded-[var(--radius-sm)] bg-[var(--paper-2)] px-2.5 py-1 text-[12.5px] font-medium text-muted-foreground">
          {hidden} hidden
        </span>
      )}
    </div>
  );
}

export function TimelineSortPopover({
  sort, onChange,
}: {
  sort: TimelineSortMode; onChange: (v: TimelineSortMode) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(() => setOpen(false));
  const active = sort !== "track";
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
          <div className="bg-popover absolute left-0 z-[70] mt-1.5 w-52 rounded-[var(--radius-md)] border p-1.5 shadow-lg">
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
          </div>
        )}
      </div>
      {sort !== "track" && (
        <span className="rounded-[var(--radius-sm)] bg-[var(--paper-2)] px-2.5 py-1 text-[12.5px] font-medium text-muted-foreground">
          {SORT_OPTIONS.find((o) => o.id === sort)?.label}
        </span>
      )}
    </div>
  );
}

/** Centers "today" in the viewport whenever the range changes.
 *
 *  Lives in its own component because the grid it belongs to is skipped
 *  entirely when a filter leaves nothing dated; as an effect in the parent it
 *  would sit after that early return and change hook order between renders. */
function CenterOnToday({
  scrollRef,
  todayLeft,
  totalW,
}: {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  todayLeft: number | null;
  totalW: number;
}) {
  useEffect(() => {
    const el = scrollRef.current;
    if (el && todayLeft != null) {
      el.scrollLeft = Math.max(0, LABEL_W + todayLeft - el.clientWidth / 2);
    }
  }, [scrollRef, todayLeft, totalW]);
  return null;
}

export function TimelineView({
  ws, projectId, filtered, filters, sort, layers, onEdit, onEditMilestone,
}: {
  ws: WorkingSet; projectId: string; filtered: Task[]; onEdit: (t: Task) => void;
  onEditMilestone: (m: Milestone) => void;
  filters: TimelineFilters;
  sort: TimelineSortMode;
  layers: TimelineLayers;
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
    setRangeTouchedUnderSort(sort);
    try { window.localStorage.setItem(`${RANGE_KEY}.${projectId}`, id); } catch { /* best-effort */ }
  }
  // "Upcoming deadlines" is a near-term view, so it opens at ±1 month rather
  // than whatever wide range was last used. Picking a range while in that sort
  // still overrides it, and the stored preference is left untouched so other
  // sorts come back to what the user had chosen.
  // Remembers which sort the user last picked a range under, so leaving and
  // re-entering "Upcoming deadlines" returns to the ±1 month default rather
  // than sticking with a one-off override. Derived, not an effect.
  const [rangeTouchedUnderSort, setRangeTouchedUnderSort] = useState<TimelineSortMode | null>(null);
  const effectiveRange: RangeId =
    sort === "deadline" && rangeTouchedUnderSort !== "deadline" ? "1m" : range;

  const filterActive = filters.cat.length > 0 || !!filters.from || !!filters.to;
  const catMap = useMemo(() => new Map(ws.categories.map((c) => [c.id, c])), [ws.categories]);
  // Dependency lines resolve a predecessor for every dep on every task —
  // a linear scan there turned quadratic as task counts grew.
  const taskById = useMemo(() => new Map(ws.tasks.map((t) => [t.id, t])), [ws.tasks]);

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
  // they don't participate in track grouping or dependency
  // lines (those are top-level-task concepts), just a visual child of
  // whichever parent row they belong to.
  const datedSubsByParent = useMemo(() => {
    const map = new Map<string, Task[]>();
    // Toggled off at the source so the rows collapse in the layout pass too,
    // not just visually — otherwise every parent would keep a blank gap.
    if (!layers.subtasks) return map;
    dateFiltered.forEach((t) => {
      if (!t.parentId || !t.start || !t.end) return;
      const arr = map.get(t.parentId) ?? [];
      arr.push(t);
      map.set(t.parentId, arr);
    });
    return map;
  }, [dateFiltered, layers.subtasks]);

  // The grid below runs hooks, so the empty case must not be an early return
  // out of this component — it renders as a sibling instead. Filtering to a
  // track with nothing dated used to unmount those hooks mid-render.
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
  const rangeMonths = RANGE_OPTIONS.find((r) => r.id === effectiveRange)?.months ?? null;
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
  // Layer toggles are applied at the source so every downstream render — the
  // full-height lines, the in-band chips and the ungrouped strip — all drop
  // out together rather than each needing its own guard.
  const inRangeGates = (layers.gates ? inRangeMs : [])
    .filter((m) => m.type === "gate")
    .map((m) => ({ ...m, left: daysBetween(minStr, m.date) * DAYW }));
  const inRangeMilestones = (layers.milestones ? inRangeMs : [])
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

  // Month labels alone leave no way to read an actual due date off the grid.
  // A second row of day ticks fixes that, spaced so the labels never collide:
  // every day when zoomed in, weekly further out, fortnightly beyond that.
  const dayStep = DAYW >= 26 ? 1 : DAYW >= 12 ? 7 : 14;
  const ticks: { left: number; label: string; strong: boolean }[] = [];
  {
    const first = new Date(`${minStr}T00:00:00`);
    // Weekly and fortnightly scales start on a Monday so the marks land on
    // week boundaries rather than an arbitrary offset from the range start.
    if (dayStep > 1) {
      const dow = (first.getDay() + 6) % 7;
      if (dow) first.setDate(first.getDate() + (7 - dow));
    }
    const cursor = new Date(first);
    while (cursor <= rangeMax) {
      const iso = cursor.toISOString().slice(0, 10);
      ticks.push({
        left: daysBetween(minStr, iso) * DAYW,
        label: String(cursor.getDate()),
        strong: cursor.getDate() <= dayStep,
      });
      cursor.setDate(cursor.getDate() + dayStep);
    }
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  const todayLeft = todayStr >= minStr && todayStr <= rangeMax.toISOString().slice(0, 10)
    ? daysBetween(minStr, todayStr) * DAYW : null;

  // "Upcoming deadlines" abandons track grouping entirely: one flat list,
  // soonest end date first, track shown inline as a small tag per row
  // instead of a section header.
  const deadlineMode = sort === "deadline";
  const groups: { id: string; label: string; color: string | null; tasks: Task[] }[] = [];
  if (deadlineMode) {
    const flat = [...inRangeDated].sort((a, b) => a.end.localeCompare(b.end));
    groups.push({ id: "_deadline", label: "Upcoming deadlines", color: null, tasks: flat });
    // Milestones and gates are deadlines too. In this mode there are no track
    // bands to hold them, so they render in the strip above the flat list —
    // still on their real dates, so they line up with the work driving them.
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
    // Track sort lays each track out in dependency flow, so linked tasks sit
    // on adjacent rows and their arrows stay short. Clustering is scoped to
    // the track's own tasks, which keeps track grouping intact.
    const orderTasks = (tasks: Task[]) =>
      sort === "sequence"
        ? sortBySequence(tasks)
        : orderByDependencyFlow(tasks, new Set(tasks.map((t) => t.id)));
    // A track earns a band if it has dated work *or* dated milestones. Without
    // the second, a milestone belonging to an empty track failed the group
    // lookup below and fell into the "ungrouped" strip, which renders at the
    // top — so it appeared to sit on whichever track happened to be first.
    const trackHasMilestone = new Set(
      inRangeMs.map((m) => m.category).filter((c): c is string => !!c),
    );
    ws.categories.forEach((c) => {
      const tasks = bycat.get(c.id);
      if (tasks?.length || trackHasMilestone.has(c.id)) {
        groups.push({ id: c.id, label: c.label, color: c.color, tasks: orderTasks(tasks ?? []) });
      }
    });
    const noTrack = bycat.get("_none");
    if (noTrack?.length) groups.push({ id: "_none", label: "No track", color: null, tasks: orderTasks(noTrack) });
    // "Sequence" also reorders the track rows themselves by their earliest
    // task date, so the whole gantt reads top-to-bottom in delivery order
    // instead of category-creation order.
    if (sort === "sequence") {
      groups.sort((a, b) => (a.tasks[0]?.start || "9999").localeCompare(b.tasks[0]?.start || "9999"));
    } else {
      orderGroupsByDependencyFlow(groups);
      // Most dependency arrows on a real board cross tracks, and neither the
      // per-track chaining nor the section ordering can shorten those on its
      // own. With both settled, pull each task toward the average row of its
      // cross-track partners — the usual barycenter pass for this problem.
      shortenCrossTrackArrows(groups);
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
    // A finished task is drawn to the date it actually finished, with the
    // planned end left behind as a ghost so the gap is visible. Undated or
    // edge-clamped bars keep the planned geometry — there's nothing to compare.
    let actualWidth: number | null = null;
    if (t.completedOn && t.start && !edgeClampedIds.has(t.id)) {
      actualWidth = Math.max(DAYW, daysBetween(t.start, t.completedOn) * DAYW);
    }
    return { rowY: rowTop + rowH / 2, barLeft, barWidth, actualWidth };
  }
  const taskLayout = new Map<string, { rowY: number; barLeft: number; barWidth: number; actualWidth: number | null }>();
  const subLayout = new Map<string, { rowY: number; barLeft: number; barWidth: number; actualWidth: number | null }>();
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
    violated: boolean; color: string; task: Task; title: string;
  }[] = [];
  (layers.deps ? ws.tasks : []).forEach((t) => {
    if (!t.start || !t.end || !taskLayout.has(t.id)) return;
    // An edge-clamped bar is a pinned marker, not drawn at its true position
    // — a dependency line to/from it would connect to a fake location and
    // draw a distorted loop across unrelated bars, so skip it entirely.
    if (edgeClampedIds.has(t.id)) return;
    (t.deps ?? []).forEach((d) => {
      if (d.type !== "task") return;
      const pred = taskById.get(d.refId ?? "");
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
      <CenterOnToday scrollRef={scrollRef} todayLeft={todayLeft} totalW={totalW} />
      <UnscheduledTray tasks={undated} onEdit={onEdit} needsStart />

      {/* Above the grid below it — the grid's sticky header and frozen label
          column sit at z-40/z-50 and would otherwise cover this dropdown. */}
      <div className="relative z-[60] mb-2 flex flex-wrap items-center gap-2.5">
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
            {RANGE_OPTIONS.find((r) => r.id === effectiveRange)?.label}
            <ChevronDown className="size-3.5" />
          </Button>
          {rangeMenuOpen && (
            <>
              <div className="fixed inset-0 z-[60]" onClick={() => setRangeMenuOpen(false)} />
              <div className="bg-popover absolute right-0 z-[70] mt-1.5 w-40 rounded-[var(--radius-md)] border p-1 shadow-lg">
                {RANGE_OPTIONS.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => changeRange(r.id)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-[13px]",
                      r.id === effectiveRange ? "bg-foreground text-background" : "hover:bg-muted",
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
        {sort !== "track" && (
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
              {layers.today && (
                <div className="border-primary pointer-events-none absolute bottom-0 top-0 z-40 border-l-[2.5px]" style={{ left: LABEL_W + todayLeft }} />
              )}
            </>
          )}
          {inRangeGates.map((g) => (
            // Gate line — runs the full height of the grid, same as the today line
            <div key={g.id} onClick={() => onEditMilestone(g)} className="absolute bottom-0 top-0 z-40 cursor-pointer border-l-[2.5px] border-[var(--t-red)]" style={{ left: LABEL_W + g.left }} title={`${g.title} (gate) — ${fmtD(g.date)}`} />
          ))}
          {depLines.length > 0 && (
            <svg className="pointer-events-none absolute top-0 z-20 overflow-visible" style={{ left: LABEL_W, width: totalW, height: totalH }}>
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
                return (
                  <path
                    key={line.key} d={path} fill="none"
                    strokeWidth={line.violated ? 2.6 : 2}
                    stroke={line.violated ? "var(--t-red)" : line.color}
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
                <div key={i} className="text-muted-foreground absolute top-0 border-l px-2.5 pt-1.5 font-mono text-[12px]" style={{ left: m.left, width: m.width, overflow: "hidden", whiteSpace: "nowrap" }}>
                  {m.label}
                </div>
              ))}
              {ticks.map((t, i) => (
                <span
                  key={`tk-${i}`}
                  className={cn(
                    "absolute bottom-1 font-mono text-[10px] tabular-nums",
                    t.strong ? "text-[var(--ink-soft)]" : "text-muted-foreground/60",
                  )}
                  style={{ left: t.left + 2 }}
                >
                  {t.label}
                </span>
              ))}
            </div>
          </div>

          {todayLeft !== null && layers.today && (
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
          {(ungroupedGates.length > 0 || ungroupedMilestones.length > 0) && (() => {
            // Diamonds, not labelled pills: a title needs ~19 days of room at
            // this zoom and often has two, so inline text always collided.
            // Anything still too close drops to the next row.
            const marks = [
              ...ungroupedGates.map((g) => ({ ...g, isGate: true as const })),
              ...ungroupedMilestones.map((m) => ({ ...m, isGate: false as const })),
            ];
            const { placed, rows } = stackMarkers(marks, MARKER_GAP);
            return (
              <div
                className="pointer-events-none sticky z-40 h-0"
                style={{ top: HDR_H + 6 }}
              >
                {placed.map(({ item, row }) => (
                  <button
                    key={item.id}
                    onClick={() => onEditMilestone(item)}
                    className="group/mk pointer-events-auto absolute flex size-[18px] -translate-x-1/2 cursor-pointer items-center justify-center rounded-[4px] text-white transition hover:scale-110 hover:brightness-110"
                    style={{
                      left: LABEL_W + item.left,
                      top: row * MARKER_ROW_H,
                      background: item.isGate ? "var(--t-red)" : item.color,
                    }}
                    title={`${item.title || "Untitled"}${item.isGate ? " (gate)" : ""} — ${fmtD(item.date)}`}
                  >
                    <span className="text-[11px] leading-none">{item.isGate ? "▮" : "◆"}</span>
                    {/* The title on demand, so the band stays readable while
                        the detail is still one hover away. */}
                    <span className="pointer-events-none absolute left-1/2 top-full z-50 mt-1 hidden -translate-x-1/2 whitespace-nowrap rounded-[var(--radius-sm)] border bg-[var(--panel)] px-2 py-1 text-[11.5px] font-medium text-[var(--ink)] shadow-md group-hover/mk:block">
                      {item.title || "Untitled"}
                      <span className="text-muted-foreground ml-1.5 font-mono text-[10.5px]">
                        {fmtD(item.date)}
                      </span>
                    </span>
                  </button>
                ))}
                <span style={{ display: "block", height: rows * MARKER_ROW_H }} />
              </div>
            );
          })()}

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
                      {/* Same treatment as the ungrouped band: diamonds that
                          stack rather than titles that collide. */}
                      {stackMarkers(milestonesByGroup.get(g.id) ?? [], MARKER_GAP, 2).placed.map(
                        ({ item: m, row }) => (
                          <button
                            key={m.id}
                            onClick={() => onEditMilestone(m)}
                            className="group/tm absolute flex size-[17px] -translate-x-1/2 cursor-pointer items-center justify-center rounded-[4px] text-white transition hover:scale-110 hover:brightness-110"
                            style={{
                              left: m.left,
                              top: `calc(50% + ${(row - 0.5) * 18}px)`,
                              transform: "translate(-50%, -50%)",
                              background: m.color,
                            }}
                            title={`${m.title || "Untitled"} — ${fmtD(m.date)}`}
                          >
                            <span className="text-[10px] leading-none">◆</span>
                            <span className="pointer-events-none absolute left-1/2 top-full z-50 mt-1 hidden -translate-x-1/2 whitespace-nowrap rounded-[var(--radius-sm)] border bg-[var(--panel)] px-2 py-1 text-[11.5px] font-medium text-[var(--ink)] shadow-md group-hover/tm:block">
                              {m.title || "Untitled"}
                              <span className="text-muted-foreground ml-1.5 font-mono text-[10.5px]">
                                {fmtD(m.date)}
                              </span>
                            </span>
                          </button>
                        ),
                      )}
                    </div>
                  </div>
                )}
                {g.tasks.map((t) => (
                  // The fragment is the list child, so it carries the key —
                  // on GanttRow it left the fragment itself unkeyed.
                  <Fragment key={t.id}>
                    <GanttRow
                      task={t} layout={taskLayout.get(t.id)!}
                      barColorVar={t.category ? accentVar(catMap.get(t.category)?.color ?? "") : col}
                      trackLabel={deadlineMode ? (t.category ? catMap.get(t.category)?.label ?? "No track" : "No track") : null}
                      minStr={minStr} totalW={totalW}
                      gates={inRangeMs.filter((m) => m.type === "gate")}
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
                  </Fragment>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      <div className="text-muted-foreground mt-4 flex flex-wrap gap-5 text-[13px]">
        <span className="inline-flex items-center gap-2"><span className="inline-block h-3 w-5 rounded-[3px]" style={{ background: "var(--accent-c)" }} /> In progress</span>
        <span className="inline-flex items-center gap-2"><span className="inline-block h-3 w-5 rounded-[3px]" style={{ background: "var(--hue-done)" }} /> Done</span>
        <span className="inline-flex items-center gap-2">
          <span className="inline-block h-3 w-5 rounded-[3px] border border-dashed" style={{ borderColor: "color-mix(in oklch, var(--accent-c) 55%, transparent)" }} /> Planned end
        </span>
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

/** Nudges tasks within each track toward the rows of their cross-track
 *  dependency partners (a barycenter sweep), shortening the long arrows that
 *  per-track chaining can't touch. Runs a few passes because moving one track
 *  changes the targets for the next.
 *
 *  Within-track dependency order is preserved: after each sweep any successor
 *  that ended up above its predecessor is pulled back down, so the ordering
 *  produced by orderByDependencyFlow still holds. */
function shortenCrossTrackArrows(
  groups: { id: string; label: string; color: string | null; tasks: Task[] }[],
): void {
  if (groups.length < 2) return;

  const rowOf = new Map<string, number>();
  const recomputeRows = () => {
    rowOf.clear();
    let row = 0;
    groups.forEach((g) => { row += 1; g.tasks.forEach((t) => { rowOf.set(t.id, row); row += 1; }); });
  };

  // Undirected cross-track partners per task.
  const trackOf = new Map<string, string>();
  groups.forEach((g) => g.tasks.forEach((t) => trackOf.set(t.id, g.id)));
  const partners = new Map<string, string[]>();
  const link = (a: string, b: string) => {
    if (trackOf.get(a) === trackOf.get(b)) return;
    partners.set(a, [...(partners.get(a) ?? []), b]);
    partners.set(b, [...(partners.get(b) ?? []), a]);
  };
  groups.forEach((g) => g.tasks.forEach((t) => {
    (t.deps ?? []).forEach((d) => {
      if (d.type !== "task" || !d.refId || !trackOf.has(d.refId)) return;
      link(t.id, d.refId);
    });
  }));
  if (partners.size === 0) return;

  // Within-track predecessor lists, used to repair order after each sweep.
  const predsInTrack = new Map<string, string[]>();
  groups.forEach((g) => {
    const ids = new Set(g.tasks.map((t) => t.id));
    g.tasks.forEach((t) => {
      const ps = (t.deps ?? [])
        .filter((d) => d.type === "task" && d.refId && ids.has(d.refId))
        .map((d) => d.refId!);
      if (ps.length) predsInTrack.set(t.id, ps);
    });
  });

  for (let pass = 0; pass < 4; pass++) {
    recomputeRows();
    let moved = false;
    groups.forEach((g) => {
      if (g.tasks.length < 2) return;
      const before = g.tasks.map((t) => t.id).join(",");
      const key = new Map<string, number>();
      g.tasks.forEach((t, i) => {
        const ps = partners.get(t.id) ?? [];
        const rows = ps.map((p) => rowOf.get(p)).filter((r): r is number => r !== undefined);
        // No cross-track partner — hold current position so unlinked tasks
        // don't drift around the linked ones.
        key.set(t.id, rows.length ? rows.reduce((s, r) => s + r, 0) / rows.length : rowOf.get(t.id) ?? i);
      });
      g.tasks.sort((a, b) => (key.get(a.id) ?? 0) - (key.get(b.id) ?? 0));

      // Repair: bubble any successor sitting above one of its in-track
      // predecessors back below it. Mutually-dependent tasks (a cycle) can
      // never satisfy this, so the swap budget caps the work instead of
      // letting the pair trade places forever.
      let repairs = g.tasks.length * g.tasks.length;
      for (let i = 0; i < g.tasks.length && repairs > 0; i++) {
        for (let j = 0; j < i; j++) {
          const ps = predsInTrack.get(g.tasks[j].id) ?? [];
          if (ps.includes(g.tasks[i].id)) {
            const [succ] = g.tasks.splice(j, 1);
            g.tasks.splice(i, 0, succ);
            repairs--;
            i = -1;
            break;
          }
        }
      }
      if (g.tasks.map((t) => t.id).join(",") !== before) moved = true;
    });
    if (!moved) break;
  }
}

/** Reorders the track sections themselves (in place) so tracks linked by
 *  cross-track dependencies sit next to each other, shortening the longest
 *  arrows on the chart. Track grouping is untouched — only section order
 *  changes. Ties and unlinked tracks fall back to earliest task start. */
function orderGroupsByDependencyFlow(
  groups: { id: string; label: string; color: string | null; tasks: Task[] }[],
): void {
  if (groups.length < 2) return;
  const groupOfTask = new Map<string, string>();
  groups.forEach((g) => g.tasks.forEach((t) => groupOfTask.set(t.id, g.id)));

  // Undirected adjacency between track sections, from cross-track deps.
  const adj = new Map<string, Set<string>>();
  groups.forEach((g) => adj.set(g.id, new Set()));
  groups.forEach((g) => {
    g.tasks.forEach((t) => {
      (t.deps ?? []).forEach((d) => {
        if (d.type !== "task" || !d.refId) return;
        const other = groupOfTask.get(d.refId);
        if (!other || other === g.id) return;
        adj.get(g.id)?.add(other);
        adj.get(other)?.add(g.id);
      });
    });
  });

  const startOfGroup = (g: { tasks: Task[] }) =>
    g.tasks.reduce((m, t) => ((t.start || "9999") < m ? t.start || "9999" : m), "9999");
  const byId = new Map(groups.map((g) => [g.id, g]));
  const byStart = [...groups].sort((a, b) => startOfGroup(a).localeCompare(startOfGroup(b)));

  // Walk connected track-clusters, seeding each from its earliest-starting
  // track and expanding to linked neighbours (earliest first).
  const seen = new Set<string>();
  const out: typeof groups = [];
  byStart.forEach((seed) => {
    if (seen.has(seed.id)) return;
    const queue = [seed.id];
    while (queue.length) {
      const id = queue.shift()!;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(byId.get(id)!);
      [...(adj.get(id) ?? [])]
        .filter((n) => !seen.has(n))
        .sort((a, b) => startOfGroup(byId.get(a)!).localeCompare(startOfGroup(byId.get(b)!)))
        .forEach((n) => queue.push(n));
    }
  });

  groups.splice(0, groups.length, ...out);
}

/** Groups tasks that are linked by task→task dependencies into contiguous
 *  runs, so a predecessor and its successors end up on adjacent rows and
 *  their arrows stay short local hops instead of sweeping across the chart.
 *
 *  Linked tasks form "clusters" (connected components over the dependency
 *  graph, treated as undirected so a shared predecessor keeps its successors
 *  together). Within a cluster, rows follow dependency order — a predecessor
 *  always precedes its successors — with start date breaking ties. Clusters
 *  themselves, and unlinked tasks, are then ordered by earliest start so the
 *  chart still reads left-to-right top-to-bottom.
 *
 *  `scopeIds` limits which dependency edges count: passing a track's own task
 *  ids keeps clustering inside that track, so track grouping is preserved. */
function orderByDependencyFlow(tasks: Task[], scopeIds?: Set<string>): Task[] {
  if (tasks.length < 2) return [...tasks];
  const ids = new Set(tasks.map((t) => t.id));
  const inScope = (id: string) => ids.has(id) && (!scopeIds || scopeIds.has(id));

  // Directed edges (pred → succ) for ordering, plus undirected adjacency for
  // working out which tasks belong in the same cluster.
  const preds = new Map<string, string[]>();
  const undirected = new Map<string, string[]>();
  const addUndirected = (a: string, b: string) => {
    undirected.set(a, [...(undirected.get(a) ?? []), b]);
    undirected.set(b, [...(undirected.get(b) ?? []), a]);
  };
  tasks.forEach((t) => {
    (t.deps ?? []).forEach((d) => {
      if (d.type !== "task" || !d.refId || !inScope(d.refId)) return;
      preds.set(t.id, [...(preds.get(t.id) ?? []), d.refId]);
      addUndirected(t.id, d.refId);
    });
  });

  // Connected components over the undirected graph.
  const clusterOf = new Map<string, number>();
  let nextCluster = 0;
  tasks.forEach((t) => {
    if (clusterOf.has(t.id)) return;
    const cluster = nextCluster++;
    const stack = [t.id];
    while (stack.length) {
      const id = stack.pop()!;
      if (clusterOf.has(id)) continue;
      clusterOf.set(id, cluster);
      (undirected.get(id) ?? []).forEach((n) => { if (!clusterOf.has(n)) stack.push(n); });
    }
  });

  const byId = new Map(tasks.map((t) => [t.id, t]));
  const startOf = (id: string) => byId.get(id)?.start || "9999";
  const buckets = new Map<number, string[]>();
  tasks.forEach((t) => {
    const c = clusterOf.get(t.id)!;
    buckets.set(c, [...(buckets.get(c) ?? []), t.id]);
  });

  // Within a cluster: topological order (predecessors first), start date as
  // the tiebreak. Cycles can't stall it — anything still unemitted when no
  // node is ready gets flushed in date order.
  function orderCluster(memberIds: string[]): string[] {
    const members = new Set(memberIds);
    const remaining = new Set(memberIds);
    const out: string[] = [];
    while (remaining.size > 0) {
      const ready = [...remaining].filter((id) =>
        (preds.get(id) ?? []).every((p) => !members.has(p) || !remaining.has(p)),
      );
      if (ready.length === 0) {
        [...remaining].sort((a, b) => startOf(a).localeCompare(startOf(b))).forEach((id) => out.push(id));
        break;
      }
      ready.sort((a, b) => startOf(a).localeCompare(startOf(b)));
      const pick = ready[0];
      out.push(pick);
      remaining.delete(pick);
    }
    return out;
  }

  const ordered = [...buckets.entries()]
    .map(([, memberIds]) => orderCluster(memberIds))
    .sort((a, b) => {
      const aStart = a.reduce((m, id) => (startOf(id) < m ? startOf(id) : m), "9999");
      const bStart = b.reduce((m, id) => (startOf(id) < m ? startOf(id) : m), "9999");
      return aStart.localeCompare(bStart);
    });

  return ordered.flat().map((id) => byId.get(id)!);
}

// ── gantt row with drag-move / drag-resize ──────────────────────────────────

function GanttRow({
  task, layout, barColorVar, trackLabel, minStr, totalW, gates, edgeClamped, onEdit, onCommit,
}: {
  task: Task;
  layout: { rowY: number; barLeft: number; barWidth: number; actualWidth: number | null };
  barColorVar: string;
  trackLabel: string | null;
  minStr: string; totalW: number;
  gates: Milestone[];
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

  // While dragging, `visual` is the live geometry and must win. Otherwise a
  // finished task draws to its actual end with the planned end ghosted.
  const dragging = visual.width !== layout.barWidth || visual.left !== layout.barLeft;
  const showsActual = !dragging && layout.actualWidth !== null && layout.actualWidth !== layout.barWidth;
  const barW = showsActual ? layout.actualWidth! : visual.width;
  const plannedWidth = layout.barWidth;
  const slipDays = task.completedOn && task.end ? daysBetween(task.end, task.completedOn) : 0;

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
        {/* Planned end, ghosted behind the real bar, so a task that finished
            early or late shows the gap rather than just moving. Only drawn
            when the two actually differ. */}
        {showsActual && (
          <div
            className="pointer-events-none absolute top-[9px] z-[9] h-[30px] rounded-[7px] border border-dashed"
            style={{
              left: visual.left,
              width: plannedWidth,
              borderColor: `color-mix(in oklch, ${barColorVar} 55%, transparent)`,
              background: `color-mix(in oklch, ${barColorVar} 8%, transparent)`,
            }}
            title={`Planned to finish ${fmtD(task.end)}`}
          />
        )}
        <div
          ref={barRef}
          className={cn(
            "shadow-xs absolute top-[9px] z-10 flex h-[30px] items-center overflow-hidden rounded-[7px] select-none",
            edgeClamped ? "cursor-pointer border-2 border-dashed border-white/60" : "cursor-grab",
            task.status === "done" && "opacity-55",
            isPast && task.status !== "done" && "opacity-40 grayscale-[0.4]",
          )}
          style={{ left: visual.left, width: barW, background: `color-mix(in oklch, ${barColorVar} 88%, white)` }}
          onPointerDown={(e) => { if (!edgeClamped) onPointerDown(e, "move"); }}
          onDoubleClick={onEdit}
          title={
            edgeClamped
              ? `${task.title} · ${fmtD(task.start)} → ${fmtD(task.end)} — outside the current range, shown at the edge · double-click to open`
              : task.completedOn
                ? `${task.title} · planned ${fmtD(task.start)} → ${fmtD(task.end)} · finished ${fmtD(task.completedOn)}`
                  + (slipDays > 0 ? ` (${slipDays}d late)` : slipDays < 0 ? ` (${Math.abs(slipDays)}d early)` : " (on time)")
                : `${task.title} · ${fmtD(task.start)} → ${fmtD(task.end)}`
          }
        >
          <span className="pointer-events-none absolute inset-0 flex items-center truncate px-2.5 text-[12.5px] font-semibold text-white [text-shadow:0_1px_2px_rgba(0,0,0,.18)]">
            {barW > 44 ? task.title : ""}
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
