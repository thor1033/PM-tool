"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Rows3, GitBranch, Calendar, KanbanSquare, SlidersHorizontal, ArrowUpDown, Search, X, Plus } from "lucide-react";
import { useProject } from "@/lib/api/hooks";
import { taskMatchesFilter, taskIdMap, NO_TRACK_ID } from "@/lib/tasks";
import { TrackModal } from "@/components/project/track-modal";
import type { Task, Milestone, Category } from "@/lib/types";
import { accentVar } from "@/lib/colors";
import { cn } from "@/lib/utils";
import { ModuleHeader } from "@/components/project/ui";
import { CardModal } from "@/components/project/card-modal";
import { MilestoneModal } from "@/components/project/milestone-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ListView } from "@/components/modules/actions/list-view";
import { TimelineView, TimelineFilterPopover, TimelineSortPopover, TimelineLayersPopover, EMPTY_TIMELINE_FILTERS, ALL_TIMELINE_LAYERS, TIMELINE_LAYERS_KEY } from "@/components/modules/actions/timeline-view";
import type { TimelineFilters, TimelineSortMode, TimelineLayers } from "@/components/modules/actions/timeline-view";
import { CalendarView } from "@/components/modules/actions/calendar-view";
import { KanbanView } from "@/components/modules/actions/kanban-view";
import type { ActionsView, SortMode } from "@/components/modules/actions/shared";
import { VIEW_STORAGE_KEY, SORT_STORAGE_KEY } from "@/components/modules/actions/shared";

const STATUS_FILTERS = [
  { id: "backlog", label: "Backlog", var: "--hue-backlog" },
  { id: "inprogress", label: "In progress", var: "--hue-progress" },
  { id: "done", label: "Done", var: "--hue-done" },
];
/** Done work is hidden by default — it's the bulk of an old project and
 *  rarely what you're looking at. Shown as a real filter, not a hidden rule,
 *  so it's discoverable and reversible. */
const DEFAULT_STATUS_FILTER = ["backlog", "inprogress"];

const VIEWS: { id: ActionsView; label: string; icon: typeof Rows3 }[] = [
  { id: "list", label: "Task list", icon: Rows3 },
  { id: "kanban", label: "Kanban", icon: KanbanSquare },
  { id: "timeline", label: "Timeline", icon: GitBranch },
  { id: "calendar", label: "Calendar", icon: Calendar },
];

type View = ActionsView;

// ── header Filter popover ───────────────────────────────────────────────────

function FilterPopover({
  ws, fCat, setFCat, fWho, setFWho, fStatus, setFStatus, showStatus = true,
}: {
  ws: { categories: { id: string; label: string; color: string }[]; members: { id: string; name: string; color: string }[] };
  fCat: string[]; setFCat: (v: string[]) => void;
  fWho: string[]; setFWho: (v: string[]) => void;
  fStatus: string[]; setFStatus: (v: string[]) => void;
  /** Hidden on Kanban, where status is the board's columns. */
  showStatus?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function h(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  // The badge reflects whether anything is actually being hidden, not whether
  // a setting differs from its default — hiding Done by default still hides
  // work, and that should be visible rather than silent.
  const statusHides = fStatus.length > 0 && fStatus.length < STATUS_FILTERS.length;
  const count = fCat.length + fWho.length + (showStatus && statusHides ? 1 : 0);
  const toggleCat = (id: string) => setFCat(fCat.includes(id) ? fCat.filter((x) => x !== id) : [...fCat, id]);
  const toggleWho = (id: string) => setFWho(fWho.includes(id) ? fWho.filter((x) => x !== id) : [...fWho, id]);
  const toggleStatus = (id: string) =>
    setFStatus(fStatus.includes(id) ? fStatus.filter((x) => x !== id) : [...fStatus, id]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "inline-flex h-10 items-center gap-2 rounded-[var(--radius-sm)] border px-4 text-[14.5px] font-semibold transition",
          count > 0 ? "bg-primary/10 border-primary text-primary" : "hover:bg-muted",
        )}
      >
        <SlidersHorizontal className="size-4" /> Filter{count > 0 ? ` · ${count}` : ""}
      </button>
      {open && (
        <div className="bg-popover absolute right-0 z-[70] mt-1.5 w-80 rounded-[var(--radius-md)] border p-4 shadow-lg">
          <div className="mb-2 flex items-center justify-between">
            <p className="eyebrow">Assigned to</p>
            {count > 0 && (
              <button onClick={() => { setFCat([]); setFWho([]); setFStatus(DEFAULT_STATUS_FILTER); }} className="text-muted-foreground hover:text-foreground text-[12px] font-medium">
                Clear
              </button>
            )}
          </div>
          <div className="mb-4 flex flex-wrap gap-2">
            {ws.members.map((m) => (
              <button
                key={m.id}
                onClick={() => toggleWho(m.name)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium transition",
                  fWho.includes(m.name) ? "bg-foreground text-background border-foreground" : "hover:bg-muted",
                )}
              >
                <span className="size-2 rounded-full" style={{ background: accentVar(m.color) }} />{m.name}
              </button>
            ))}
            <button
              onClick={() => toggleWho("__unassigned")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium transition",
                fWho.includes("__unassigned") ? "bg-foreground text-background border-foreground" : "hover:bg-muted",
              )}
            >
              <span className="bg-ink-ghost size-2 rounded-full" />Unassigned
            </button>
            {ws.members.length === 0 && <span className="text-muted-foreground text-sm">No members yet</span>}
          </div>
          {showStatus && <p className="eyebrow mb-2">Status</p>}
          {showStatus && <div className="mb-4 flex flex-wrap gap-2">
            {STATUS_FILTERS.map((st) => (
              <button
                key={st.id}
                onClick={() => toggleStatus(st.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium transition",
                  fStatus.includes(st.id) ? "bg-foreground text-background border-foreground" : "hover:bg-muted",
                )}
              >
                <span className="size-2 rounded-full" style={{ background: `var(${st.var})` }} />{st.label}
              </button>
            ))}
          </div>}
          <p className="eyebrow mb-2">Track</p>
          <div className="flex flex-wrap gap-2">
            {ws.categories.map((c) => (
              <button
                key={c.id}
                onClick={() => toggleCat(c.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium transition",
                  fCat.includes(c.id) ? "bg-foreground text-background border-foreground" : "hover:bg-muted",
                )}
              >
                <span className="size-2 rounded-full" style={{ background: accentVar(c.color) }} />{c.label}
              </button>
            ))}
            {/* Tasks are allowed to have no track, so the filter has to be
                able to select them — the timeline already offered this. */}
            <button
              onClick={() => toggleCat(NO_TRACK_ID)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium transition",
                fCat.includes(NO_TRACK_ID) ? "bg-foreground text-background border-foreground" : "hover:bg-muted",
              )}
            >
              <span className="bg-ink-ghost size-2 rounded-full" />No track
            </button>
            {ws.categories.length === 0 && <span className="text-muted-foreground text-sm">No tracks yet</span>}
          </div>
        </div>
      )}
    </div>
  );
}

// ── header Sort by dropdown (List + Timeline only) ──────────────────────────

function SortByDropdown({ sort, onChange }: { sort: SortMode; onChange: (v: SortMode) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function h(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const OPTIONS: { id: SortMode; label: string }[] = [
    { id: "category", label: "Track" },
    { id: "upcoming", label: "Upcoming deadlines" },
    { id: "status", label: "Status" },
    { id: "owner", label: "Owner" },
  ];
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-10 items-center gap-2 rounded-[var(--radius-sm)] border px-4 text-[14.5px] font-semibold transition hover:bg-muted"
      >
        <ArrowUpDown className="size-4" />
        <span className="text-muted-foreground">Sort by</span> {OPTIONS.find((o) => o.id === sort)?.label}
      </button>
      {open && (
        <div className="bg-popover absolute right-0 z-[70] mt-1.5 w-44 rounded-[var(--radius-md)] border p-1.5 shadow-lg">
          {OPTIONS.map((o) => (
            <button
              key={o.id}
              onClick={() => { onChange(o.id); setOpen(false); }}
              className={cn(
                "flex w-full items-center rounded-[var(--radius-sm)] px-3 py-2 text-left text-[14px] transition",
                sort === o.id ? "bg-muted font-semibold" : "hover:bg-muted",
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}


// ── module ────────────────────────────────────────────────────────────────────

export function ActionsModule({ projectId }: { projectId: string }) {
  const { data: ws } = useProject(projectId);
  const [view, setView] = useState<View>("list");
  const [sort, setSort] = useState<SortMode>("category");
  const [fCat, setFCat] = useState<string[]>([]);
  const [fWho, setFWho] = useState<string[]>([]);
  const [fStatus, setFStatus] = useState<string[]>(DEFAULT_STATUS_FILTER);
  const [query, setQuery] = useState("");
  const [timelineFilters, setTimelineFilters] = useState<TimelineFilters>(EMPTY_TIMELINE_FILTERS);
  const [timelineSort, setTimelineSort] = useState<TimelineSortMode>("track");
  const [timelineLayers, setTimelineLayers] = useState<TimelineLayers>(() => {
    if (typeof window === "undefined") return ALL_TIMELINE_LAYERS;
    try {
      const raw = window.localStorage.getItem(TIMELINE_LAYERS_KEY);
      // Merged over the defaults so a stored value written before a new layer
      // existed still turns that layer on rather than leaving it undefined.
      return raw ? { ...ALL_TIMELINE_LAYERS, ...JSON.parse(raw) } : ALL_TIMELINE_LAYERS;
    } catch {
      return ALL_TIMELINE_LAYERS;
    }
  });
  function changeTimelineLayers(v: TimelineLayers) {
    setTimelineLayers(v);
    try { window.localStorage.setItem(TIMELINE_LAYERS_KEY, JSON.stringify(v)); } catch { /* best-effort */ }
  }
  const [taskDialog, setTaskDialog] = useState<{ open: boolean; task: Task | null; defaultCategoryId?: string | null; defaultStatus?: string; defaultMilestoneId?: string | null }>({ open: false, task: null });
  const [msDialog, setMsDialog] = useState<{ open: boolean; milestone: Milestone | null; defaultCategoryId?: string | null; defaultType?: "milestone" | "gate" }>({ open: false, milestone: null });
  const [trackModal, setTrackModal] = useState<{ open: boolean; track: Category | null }>({ open: false, track: null });

  // remembers the last-used view (atlas.actions.mode) and sort (atlas.actions.sort)
  useEffect(() => {
    try {
      const savedView = localStorage.getItem(VIEW_STORAGE_KEY) as View | null;
      if (savedView && VIEWS.some((v) => v.id === savedView)) setView(savedView);
      const savedSort = localStorage.getItem(SORT_STORAGE_KEY) as SortMode | null;
      const validSorts: SortMode[] = ["category", "upcoming", "status", "owner"];
      if (savedSort && validSorts.includes(savedSort)) setSort(savedSort);
    } catch {
      // ignore
    }
  }, []);
  function changeView(v: View) {
    setView(v);
    try { localStorage.setItem(VIEW_STORAGE_KEY, v); } catch { /* ignore */ }
  }
  function changeSort(v: SortMode) {
    setSort(v);
    try { localStorage.setItem(SORT_STORAGE_KEY, v); } catch { /* ignore */ }
  }

  // Search matches the task's permanent ID (see taskIdMap), its title, or
  const tasks = useMemo(() => ws?.tasks ?? [], [ws]);
  const idMap = useMemo(() => taskIdMap(tasks), [tasks]);
  const q = query.trim().toLowerCase();
  const matchesQuery = useMemo(() => (t: Task) => {
    if (!q) return true;
    if (t.title.toLowerCase().includes(q)) return true;
    const id = idMap.get(t.id);
    if (id !== undefined && (String(id) === q || `#${id}` === q)) return true;
    return false;
  }, [q, idMap]);

  // Dependency lookups always resolve against the FULL task list — filtering
  // only changes what's rendered, never whether a block resolves correctly.
  // Track / owner / search, without the status filter. Kanban uses this: the
  // board's whole point is the status columns, so hiding Done there would
  // empty a column rather than reduce noise.
  const filteredNoStatus = useMemo(
    () => tasks.filter((t) => taskMatchesFilter(t, fCat, fWho) && matchesQuery(t)),
    [tasks, fCat, fWho, matchesQuery],
  );
  const filtered = useMemo(
    () => filteredNoStatus.filter((t) => fStatus.length === 0 || fStatus.includes(t.status)),
    [filteredNoStatus, fStatus],
  );

  // Deep link from elsewhere in the app: /actions?task=<id> opens that task's
  // editor here, in the list it actually lives in, rather than a detached
  // preview.
  //
  // This runs in an effect rather than during render: navigating and setting
  // dialog state are both side effects, and doing them inline triggered
  // React's "cannot update a component while rendering a different one".
  const searchParams = useSearchParams();
  const router = useRouter();
  const linkedTaskId = searchParams.get("task");
  useEffect(() => {
    if (!linkedTaskId || !ws) return;
    const target = ws.tasks.find((t) => t.id === linkedTaskId);
    if (target) {
      setTaskDialog({ open: true, task: target });
      // Keep the row visible even when the default filter hides done work.
      if (target.status === "done") setFStatus(STATUS_FILTERS.map((st) => st.id));
    } else {
      toast.error("That task no longer exists.");
    }
    // Clear the param so a refresh or a later close doesn't reopen it.
    router.replace(`/projects/${projectId}/actions`, { scroll: false });
  }, [linkedTaskId, ws, router, projectId]);

  if (!ws) return null;

  function openTask(
    t: Task | null,
    defaultCategoryId?: string | null,
    defaultMilestoneId?: string | null,
    defaultStatus?: string,
  ) {
    setTaskDialog({ open: true, task: t, defaultCategoryId, defaultMilestoneId, defaultStatus });
  }
  function openMilestone(m: Milestone | null, defaultCategoryId?: string | null, defaultType?: "milestone" | "gate") {
    setMsDialog({ open: true, milestone: m, defaultCategoryId, defaultType });
  }

  const showSortBy = view === "list";
  const showGlobalFilter = view !== "timeline" && view !== "calendar";
  const showSearch = view !== "timeline" && view !== "calendar";


  return (
    <div>
      <ModuleHeader eyebrow="Delivery" title="Tasks" />

      <div className="mb-5 flex gap-1 rounded-[var(--radius-sm)] border bg-[var(--paper-2)] p-1.5">
        {VIEWS.map((v) => {
          const Icon = v.icon;
          const active = view === v.id;
          return (
            <button
              key={v.id}
              onClick={() => changeView(v.id)}
              className={cn(
                "flex items-center gap-2 rounded-[6px] px-4 py-2 text-[13.5px] font-semibold transition",
                active ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-4" /> {v.label}
            </button>
          );
        })}
      </div>

      {/* Above the views' own content — Timeline's grid uses z-40/z-50 for its
          sticky header and frozen label column, which would otherwise cover
          the dropdowns that open from this toolbar. */}
      <div className="relative z-[60] mt-2 mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          {showSearch && (
            <div className="relative">
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name or ID…"
                className="h-10 w-56 pl-9"
              />
              {query && (
                <button
                  onClick={() => setQuery("")}
                  className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2.5 -translate-y-1/2"
                  aria-label="Clear search"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
          )}
          {showGlobalFilter && (
            <FilterPopover
              ws={ws} fCat={fCat} setFCat={setFCat} fWho={fWho} setFWho={setFWho}
              fStatus={fStatus} setFStatus={setFStatus}
              showStatus={view !== "kanban"}
            />
          )}
          {showSortBy && <SortByDropdown sort={sort} onChange={changeSort} />}
          {view === "timeline" && (
            <>
              <TimelineFilterPopover ws={ws} filters={timelineFilters} setFilters={setTimelineFilters} />
              <TimelineSortPopover
                sort={timelineSort} onChange={setTimelineSort}
              />
              <TimelineLayersPopover layers={timelineLayers} setLayers={changeTimelineLayers} />
            </>
          )}
        </div>

        {view === "list" && (
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Tasks, milestones and gates are added from the track they
                belong to; a track is the only thing with nowhere else to
                live. */}
            <Button onClick={() => setTrackModal({ open: true, track: null })}>
              <Plus className="size-4" /> New track
            </Button>
          </div>
        )}
      </div>

      {view === "list" && (
        <ListView
          ws={ws} projectId={projectId} filtered={filtered} sort={sort}
          fCat={fCat} setFCat={setFCat}
          onEdit={openTask} onEditMilestone={openMilestone}
          onEditTrack={(t) => setTrackModal({ open: true, track: t })}
        />
      )}
      {view === "timeline" && (
        <TimelineView
          ws={ws} projectId={projectId} filtered={ws.tasks}
          filters={timelineFilters} sort={timelineSort} layers={timelineLayers}
          onEdit={openTask} onEditMilestone={(m) => openMilestone(m)}
        />
      )}
      {view === "calendar" && (
        <CalendarView ws={ws} projectId={projectId} filtered={ws.tasks} onEdit={openTask} onEditMilestone={(m) => openMilestone(m)} />
      )}
      {view === "kanban" && (
        <KanbanView
          ws={ws} projectId={projectId} filtered={filteredNoStatus}
          onOpen={(t) => openTask(t)}
          onNew={(status) => openTask(null, undefined, status)}
        />
      )}

      {taskDialog.open && (
        <CardModal
          ws={ws} projectId={projectId} task={taskDialog.task}
          defaultCategoryId={taskDialog.defaultCategoryId} defaultStatus={taskDialog.defaultStatus}
          defaultMilestoneId={taskDialog.defaultMilestoneId}
          open={taskDialog.open} onOpenChange={(v) => setTaskDialog((d) => ({ ...d, open: v }))}
        />
      )}
      {msDialog.open && (
        <MilestoneModal
          ws={ws} projectId={projectId} milestone={msDialog.milestone}
          defaultCategoryId={msDialog.defaultCategoryId} defaultType={msDialog.defaultType}
          open={msDialog.open} onOpenChange={(v) => setMsDialog((d) => ({ ...d, open: v }))}
        />
      )}
      {trackModal.open && (
        <TrackModal
          projectId={projectId}
          track={trackModal.track}
          open={trackModal.open}
          onOpenChange={(v) => setTrackModal((d) => ({ ...d, open: v }))}
          onEditMilestone={(m, cat, type) => {
            // Close the track editor first: two stacked dialogs trap focus in
            // the wrong one and the milestone modal lands behind it.
            setTrackModal((d) => ({ ...d, open: false }));
            openMilestone(m, cat, type);
          }}
        />
      )}
    </div>
  );
}
