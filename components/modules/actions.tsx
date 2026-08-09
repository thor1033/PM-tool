"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Rows3, GitBranch, Calendar, KanbanSquare, SlidersHorizontal, ArrowUpDown, Layers, Search, X, Plus, ListTodo } from "lucide-react";
import { useProject, useCreateEntity } from "@/lib/api/hooks";
import { taskMatchesFilter, taskIdMap } from "@/lib/tasks";
import type { Task, Milestone } from "@/lib/types";
import { accentVar, ACCENTS } from "@/lib/colors";
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

const VIEWS: { id: ActionsView; label: string; icon: typeof Rows3 }[] = [
  { id: "list", label: "Task list", icon: Rows3 },
  { id: "kanban", label: "Kanban", icon: KanbanSquare },
  { id: "timeline", label: "Timeline", icon: GitBranch },
  { id: "calendar", label: "Calendar", icon: Calendar },
];

type View = ActionsView;

// ── header Filter popover ───────────────────────────────────────────────────

function FilterPopover({
  ws, fCat, setFCat, fWho, setFWho,
}: {
  ws: { categories: { id: string; label: string; color: string }[]; members: { id: string; name: string; color: string }[] };
  fCat: string[]; setFCat: (v: string[]) => void;
  fWho: string[]; setFWho: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function h(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const count = fCat.length + fWho.length;
  const toggleCat = (id: string) => setFCat(fCat.includes(id) ? fCat.filter((x) => x !== id) : [...fCat, id]);
  const toggleWho = (id: string) => setFWho(fWho.includes(id) ? fWho.filter((x) => x !== id) : [...fWho, id]);

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
              <button onClick={() => { setFCat([]); setFWho([]); }} className="text-muted-foreground hover:text-foreground text-[12px] font-medium">
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

function AddNewDropdown({ onNewTask, onNewTrack }: { onNewTask: () => void; onNewTrack: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function h(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  return (
    <div className="relative" ref={ref}>
      <Button onClick={() => setOpen((o) => !o)}>
        <Plus className="size-4" /> Add new
      </Button>
      {open && (
        <div className="bg-popover absolute right-0 z-[70] mt-1.5 w-48 rounded-[var(--radius-md)] border p-1.5 shadow-lg">
          <button
            onClick={() => { setOpen(false); onNewTask(); }}
            className="hover:bg-muted flex w-full items-center gap-2.5 rounded-[var(--radius-sm)] px-3 py-2 text-left text-[14px] transition"
          >
            <ListTodo className="size-4" /> New task
          </button>
          <button
            onClick={() => { setOpen(false); onNewTrack(); }}
            className="hover:bg-muted flex w-full items-center gap-2.5 rounded-[var(--radius-sm)] px-3 py-2 text-left text-[14px] transition"
          >
            <Layers className="size-4" /> New track
          </button>
        </div>
      )}
    </div>
  );
}

// ── module ────────────────────────────────────────────────────────────────────

export function ActionsModule({ projectId }: { projectId: string }) {
  const { data: ws } = useProject(projectId);
  const createCat = useCreateEntity(projectId, "categories");
  const [view, setView] = useState<View>("list");
  const [sort, setSort] = useState<SortMode>("category");
  const [fCat, setFCat] = useState<string[]>([]);
  const [fWho, setFWho] = useState<string[]>([]);
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
  const [taskDialog, setTaskDialog] = useState<{ open: boolean; task: Task | null; defaultCategoryId?: string | null; defaultStatus?: string }>({ open: false, task: null });
  const [msDialog, setMsDialog] = useState<{ open: boolean; milestone: Milestone | null; defaultCategoryId?: string | null; defaultType?: "milestone" | "gate" }>({ open: false, milestone: null });
  const [addingTrack, setAddingTrack] = useState(false);
  const [newTrackLabel, setNewTrackLabel] = useState("");

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
  const filtered = useMemo(
    () => tasks.filter((t) => taskMatchesFilter(t, fCat, fWho) && matchesQuery(t)),
    [tasks, fCat, fWho, matchesQuery],
  );
  const hasActiveFilter = fCat.length > 0 || fWho.length > 0 || q.length > 0;

  if (!ws) return null;

  function openTask(t: Task | null, defaultCategoryId?: string | null, defaultStatus?: string) {
    setTaskDialog({ open: true, task: t, defaultCategoryId, defaultStatus });
  }
  function openMilestone(m: Milestone | null, defaultCategoryId?: string | null, defaultType?: "milestone" | "gate") {
    setMsDialog({ open: true, milestone: m, defaultCategoryId, defaultType });
  }

  const showSortBy = view === "list";
  const showGlobalFilter = view !== "timeline" && view !== "calendar";
  const showSearch = view !== "timeline" && view !== "calendar";

  const categoriesCount = ws.categories.length;
  function commitAddTrack() {
    const name = newTrackLabel.trim();
    if (!name) return;
    createCat.mutate(
      { label: name, color: ACCENTS[categoriesCount % ACCENTS.length] },
      { onError: (e) => toast.error((e as Error).message) },
    );
    setNewTrackLabel("");
    setAddingTrack(false);
  }

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
          {showGlobalFilter && <FilterPopover ws={ws} fCat={fCat} setFCat={setFCat} fWho={fWho} setFWho={setFWho} />}
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
            {addingTrack ? (
              <div className="flex items-center gap-1.5">
                <Input
                  autoFocus
                  value={newTrackLabel}
                  onChange={(e) => setNewTrackLabel(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitAddTrack();
                    if (e.key === "Escape") { setAddingTrack(false); setNewTrackLabel(""); }
                  }}
                  onBlur={() => { if (!newTrackLabel.trim()) setAddingTrack(false); }}
                  placeholder="Track name…"
                  className="h-9 w-44 text-[14px]"
                />
                <Button variant="ghost" onClick={commitAddTrack} disabled={!newTrackLabel.trim()}>Add</Button>
              </div>
            ) : (
              <AddNewDropdown onNewTask={() => openTask(null)} onNewTrack={() => setAddingTrack(true)} />
            )}
          </div>
        )}
      </div>

      {view === "list" && (
        <ListView
          ws={ws} projectId={projectId} filtered={filtered} hasActiveFilter={hasActiveFilter} sort={sort}
          fCat={fCat} setFCat={setFCat}
          onEdit={openTask} onEditMilestone={openMilestone}
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
          ws={ws} projectId={projectId} filtered={filtered}
          onOpen={(t) => openTask(t)}
          onNew={(status) => openTask(null, undefined, status)}
        />
      )}

      {taskDialog.open && (
        <CardModal
          ws={ws} projectId={projectId} task={taskDialog.task}
          defaultCategoryId={taskDialog.defaultCategoryId} defaultStatus={taskDialog.defaultStatus}
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
    </div>
  );
}
