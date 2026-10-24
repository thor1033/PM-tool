"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Plus, Trash2, Pencil, ChevronRight, ChevronDown, MessageSquare, GripVertical, Flag, Milestone as MilestoneIcon,
  TriangleAlert, RotateCw, UserRound, Check, ListTodo,
} from "lucide-react";
import { useCreateEntity, useUpdateEntity, useDeleteEntity } from "@/lib/api/hooks";
import type { Task, WorkingSet, Milestone, Category } from "@/lib/types";
import { depsOf, statusVar, fmtD, daysBetween, taskIdMap, COLUMNS, TRACK_ICONS, subtaskDefaults, todayISO } from "@/lib/tasks";
import { kindOf } from "@/lib/task-kinds";
import { groupByMilestone, type MilestoneGroup } from "@/lib/milestone-grouping";
import { accent, accentVar } from "@/lib/colors";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { COLLAPSE_STORAGE_KEY_PREFIX, OPEN_SUBS_STORAGE_KEY_PREFIX, MS_FOLD_STORAGE_KEY_PREFIX } from "@/components/modules/actions/shared";
import { groupTasks, sortTasks, showsMilestoneHeaders, GROUP_OPTIONS, type GroupMode, type SortMode } from "@/lib/grouping";
import { useConfirm } from "@/components/project/confirm";

const SYNTH_GROUPS = [
  { key: "_comms", label: "Communications", color: "teal", origin: "comms" },
  { key: "_change", label: "Change management", color: "purple", origin: "change" },
] as const;

/** Adds anything that lives inside a track. One button per track rather
 *  than one for the whole page, so what gets created is never ambiguous
 *  about where it lands. */
function TrackAddMenu({
  trackLabel,
  hasMilestones,
  onTask,
  onMilestone,
  onGate,
}: {
  trackLabel: string;
  hasMilestones: boolean;
  onTask: () => void;
  onMilestone: () => void;
  onGate: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function h(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const pick = (fn: () => void) => () => { setOpen(false); fn(); };

  return (
    <div className="relative" ref={ref}>
      <Button
        size="sm"
        className="h-8 text-[12.5px]"
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        title={`Add to ${trackLabel}`}
      >
        <Plus className="size-3.5" /> Add new
      </Button>
      {open && (
        <div className="bg-popover absolute right-0 z-[70] mt-1.5 w-52 rounded-[var(--radius-md)] border p-1.5 shadow-lg">
          <button
            onClick={pick(onTask)}
            disabled={!hasMilestones}
            title={hasMilestones ? undefined : "Add a milestone first — tasks are assigned to one"}
            className="hover:bg-muted disabled:hover:bg-transparent flex w-full items-center gap-2.5 rounded-[var(--radius-sm)] px-3 py-2 text-left text-[13.5px] transition disabled:opacity-40"
          >
            <ListTodo className="size-4" /> Task
          </button>
          <button
            onClick={pick(onMilestone)}
            className="hover:bg-muted flex w-full items-center gap-2.5 rounded-[var(--radius-sm)] px-3 py-2 text-left text-[13.5px] transition"
          >
            <MilestoneIcon className="size-4" /> Milestone
          </button>
          <button
            onClick={pick(onGate)}
            className="hover:bg-muted flex w-full items-center gap-2.5 rounded-[var(--radius-sm)] px-3 py-2 text-left text-[13.5px] text-[var(--t-red)] transition"
          >
            <Flag className="size-4" /> Gate
          </button>
          {!hasMilestones && (
            <p className="text-muted-foreground border-t px-3 pb-1 pt-2 text-[11.5px] leading-snug">
              Add a milestone first — tasks are assigned to one.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

interface Group {
  key: string;
  label: string;
  color: string | null;
  tasks: Task[];
  /** Stakeholder id accountable for the track, when one is set. */
  owner?: string | null;
  icon?: string | null;
  /** Set when grouping by milestone, so the heading can show its date. */
  milestone?: Milestone | null;
}

function loadJSON<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function saveJSON(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // best-effort
  }
}

export function ListView({
  ws, projectId, filtered, filteredNoStatus, groupBy, sortBy, fCat, setFCat, onEdit, onEditMilestone, onEditTrack,
}: {
  ws: WorkingSet; projectId: string; filtered: Task[];
  /** What buckets the rows. Only "track" carries the track-editing controls —
   *  renaming an owner or a status heading would be meaningless, so the other
   *  groupings render plain headings. */
  groupBy: GroupMode;
  /** Order within a bucket. */
  sortBy: SortMode;
  /** Everything the track/owner/search filters allow, before the status one.
   *  An unfolded reached milestone draws from this, so its finished tasks are
   *  visible even while Done is hidden. */
  filteredNoStatus: Task[];
  fCat: string[]; setFCat: (v: string[]) => void;
  onEdit: (t: Task | null, defaultCategoryId?: string | null, defaultMilestoneId?: string | null) => void;
  onEditMilestone: (m: Milestone | null, defaultCategoryId?: string | null, defaultType?: "milestone" | "gate") => void;
  onEditTrack: (track: Category) => void;
}) {
  const create = useCreateEntity(projectId, "tasks");
  const update = useUpdateEntity(projectId, "tasks");
  const del = useDeleteEntity(projectId, "tasks");
  const updateCat = useUpdateEntity(projectId, "categories");
  const updateMilestone = useUpdateEntity(projectId, "milestones");

  // Unticking puts the task back where it would otherwise be: under way if it
  // has started, backlog if not.
  function toggleDone(t: Task) {
    const status = t.status === "done" ? (t.start ? "inprogress" : "backlog") : "done";
    update.mutate({ id: t.id, data: { status } }, { onError: (e) => toast.error((e as Error).message) });
  }
  const delCat = useDeleteEntity(projectId, "categories");

  /** Deleting a track would orphan its tasks, so they're moved to "no track"
   *  first — they stay visible under "Undefined track" instead of vanishing. */
  async function deleteTrack(g: Group) {
    const inTrack = ws.tasks.filter((t) => t.category === g.key);
    const ok = await confirm({
      title: `Delete the “${g.label}” track?`,
      body: inTrack.length
        ? `Its ${inTrack.length} task${inTrack.length === 1 ? "" : "s"} will be kept and moved to “no track”.`
        : "The track is empty.",
    });
    if (!ok) return;
    inTrack.forEach((t) => update.mutate({ id: t.id, data: { category: null } }));
    delCat.mutate(g.key, { onError: (e) => toast.error((e as Error).message) });
  }
  const confirm = useConfirm();

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => loadJSON(`${COLLAPSE_STORAGE_KEY_PREFIX}${projectId}`, {}));
  const [expandedSubs, setExpandedSubs] = useState<Record<string, boolean>>(() => loadJSON(`${OPEN_SUBS_STORAGE_KEY_PREFIX}${projectId}`, {}));
  // Milestones fold individually and start unfolded. Only a deliberate
  // choice is stored.
  const [msFold, setMsFold] = useState<Record<string, boolean>>(() => loadJSON(`${MS_FOLD_STORAGE_KEY_PREFIX}${projectId}`, {}));
  const msOpen = (mg: MilestoneGroup) => msFold[mg.key] ?? true;
  function toggleMilestone(key: string, isOpen: boolean) {
    setMsFold((s) => {
      const next = { ...s, [key]: !isOpen };
      saveJSON(`${MS_FOLD_STORAGE_KEY_PREFIX}${projectId}`, next);
      return next;
    });
  }
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const [dragOverRow, setDragOverRow] = useState<string | null>(null);
  const [addingSubFor, setAddingSubFor] = useState<string | null>(null);
  const [subTitle, setSubTitle] = useState("");

  function commitAddSubtask(parent: Task) {
    const title = subTitle.trim();
    setAddingSubFor(null);
    if (!title) { setSubTitle(""); return; }
    create.mutate(
      { title, ...subtaskDefaults(parent, todayISO()) },
      { onError: (e) => toast.error((e as Error).message) },
    );
    setSubTitle("");
    // Opening the add-row implies interest in seeing it land — expand subs
    // for this parent so the new row is visible immediately.
    setExpandedSubs((s) => {
      const next = { ...s, [parent.id]: true };
      saveJSON(`${OPEN_SUBS_STORAGE_KEY_PREFIX}${projectId}`, next);
      return next;
    });
  }
  const [editingTrack, setEditingTrack] = useState<string | null>(null);

  function toggleSubs(taskId: string) {
    setExpandedSubs((s) => {
      const next = { ...s, [taskId]: !s[taskId] };
      saveJSON(`${OPEN_SUBS_STORAGE_KEY_PREFIX}${projectId}`, next);
      return next;
    });
  }

  // Categories default to expanded — a group only collapses once the user
  // explicitly closes it (and that choice is what's persisted).
  function toggleGroup(key: string) {
    setCollapsed((s) => {
      const next = { ...s, [key]: !(s[key] ?? false) };
      saveJSON(`${COLLAPSE_STORAGE_KEY_PREFIX}${projectId}`, next);
      return next;
    });
  }

  /** Whether a task belongs in the bucket with this key, under the current
   *  grouping. Used to reach past the status filter when a reached milestone
   *  is unfolded — the bucket itself cannot contain the hidden done tasks, so
   *  membership is re-derived from the same rule that built it. */
  const inBucket = (t: Task, bucketKey: string): boolean => {
    switch (groupBy) {
      case "track": return (t.category ?? "_none") === bucketKey;
      case "milestone": return (t.milestoneId ?? "_none") === bucketKey;
      case "owner": return `owner:${(t.assignees ?? [])[0] ?? ""}` === bucketKey || (!(t.assignees ?? []).length && bucketKey === "_none");
      case "status": return `status:${t.status}` === bucketKey;
      default: return true;
    }
  };

  /** The tasks under a reached milestone, drawn from before the status filter
   *  so unfolding one shows its finished work even while Done is hidden.
   *  Scoped to the bucket, so a reached milestone under Thor shows his share
   *  of it rather than everyone's. */
  const milestoneTasksFor = (mg: MilestoneGroup, bucketKey: string) =>
    filteredNoStatus.filter(
      (t) =>
        !t.parentId &&
        (t.milestoneId ?? null) === (mg.milestone?.id ?? null) &&
        inBucket(t, bucketKey),
    );

  const trackGroups: Group[] = useMemo(() => {
    const topLevel = filtered.filter((t) => !t.parentId);
    const validCategoryIds = new Set(ws.categories.map((c) => c.id));
    const byCat = new Map<string, Task[]>();
    const undefinedCategory: Task[] = [];
    const synthBuckets = new Map<string, Task[]>(SYNTH_GROUPS.map((g) => [g.key, []]));

    topLevel.forEach((t) => {
      const synth = SYNTH_GROUPS.find((g) => g.origin === t.origin);
      if (synth) {
        synthBuckets.get(synth.key)!.push(t);
        return;
      }
      // A category id that no longer matches any real category (deleted/
      // renamed track, bad import) is treated the same as "no category" —
      // otherwise the task lands in a bucket nothing renders and silently
      // disappears from the list.
      if (t.category && validCategoryIds.has(t.category)) {
        const arr = byCat.get(t.category) ?? [];
        arr.push(t);
        byCat.set(t.category, arr);
      } else {
        undefinedCategory.push(t);
      }
    });

    const out: Group[] = [];
    // A track filter is an explicit statement about which tracks to show, so
    // a deselected one goes entirely — header, milestones and all. That is
    // different from a track left empty by the status filter, which stays
    // listed: structure the user created should not silently disappear just
    // because Done is hidden. The row explains itself below.
    const trackSelected = (id: string) => fCat.length === 0 || fCat.includes(id);
    ws.categories.forEach((c) => {
      if (!trackSelected(c.id)) return;
      const tasks = byCat.get(c.id) ?? [];
      out.push({ key: c.id, label: c.label, color: c.color, tasks, owner: c.owner ?? null, icon: c.icon ?? null });
    });
    SYNTH_GROUPS.forEach((g) => {
      const tasks = synthBuckets.get(g.key) ?? [];
      if (tasks.length) out.push({ key: g.key, label: g.label, color: g.color, tasks });
    });
    // "Undefined track" is a data-problem bucket, not a normal group — it
    // only ever appears when a task genuinely has no track (legacy rows,
    // imports). Every task created going forward always has one, so this
    // should normally be empty and absent.
    if (undefinedCategory.length) {
      out.push({ key: "_none", label: "Undefined track", color: null, tasks: undefinedCategory });
    }
    return out;
  }, [filtered, ws.categories, fCat]);

  // Track keeps the bespoke path above — it carries the track filter, the
  // synthetic Communications/Change buckets, and the owner and icon the
  // heading needs. Every other grouping is plain bucketing, so it comes from
  // the shared module rather than a second copy of that logic here.
  const buckets: Group[] = useMemo(() => {
    if (groupBy === "track") return trackGroups;
    return groupTasks(groupBy, {
      tasks: filtered,
      categories: ws.categories,
      milestones: ws.milestones,
    }).map((b) => ({
      key: b.key,
      label: b.label,
      color: b.color,
      tasks: b.tasks,
      milestone: b.milestone ?? null,
    }));
  }, [groupBy, trackGroups, filtered, ws.categories, ws.milestones]);

  const editableTracks = groupBy === "track";


  // Grouped once per render instead of re-filtering the full task list for
  // every parent row — that per-row filter turned quadratic as task counts grew.
  const subtasksByParent = useMemo(() => {
    const map = new Map<string, Task[]>();
    filtered.forEach((t) => {
      if (!t.parentId) return;
      const arr = map.get(t.parentId) ?? [];
      arr.push(t);
      map.set(t.parentId, arr);
    });
    return map;
  }, [filtered]);
  function subtasksOf(parentId: string) {
    return subtasksByParent.get(parentId) ?? [];
  }

  // drag & drop: reorder within a group / move across groups (re-bucket)
  function handleDrop(targetTask: Task | null, targetGroup: Group) {
    if (!dragTaskId) return;
    const dragged = ws.tasks.find((t) => t.id === dragTaskId);
    setDragTaskId(null);
    setDragOverRow(null);
    if (!dragged) return;

    const synth = SYNTH_GROUPS.find((g) => g.key === targetGroup.key);
    // Communications/Change management groups key off `origin`, not
    // `category` — a task keeps its existing (mandatory) category when moved
    // into one of them, only its origin changes. Dropping onto "Undefined
    // track" explicitly clears the category, same as dragging out of it
    // assigns one — the move works both ways.
    const nextCategory = synth ? dragged.category : targetGroup.key === "_none" ? null : targetGroup.key;
    const nextOrigin = synth?.origin ?? null;

    if (dragged.category !== nextCategory || dragged.origin !== nextOrigin) {
      update.mutate({ id: dragged.id, data: { category: nextCategory, origin: nextOrigin } });
      // A track filter is scoped to what's visible, not what's allowed — a
      // task moved into a track the filter excludes would otherwise vanish
      // from every view with no indication why. Extend the filter so the
      // track the user just dropped into stays visible.
      if (nextCategory && fCat.length && !fCat.includes(nextCategory)) {
        setFCat([...fCat, nextCategory]);
      }
    }
    if (targetTask && targetTask.id !== dragged.id) {
      // Insert-before semantics via position: place just before target's position.
      update.mutate({ id: dragged.id, data: { position: targetTask.position - 1 } });
    }
  }

  // Built from the full unfiltered task list (not `groups`) so numbering
  // never shifts under a filter. Must run unconditionally (before the
  // flat-sort early-returns below) to satisfy the Rules of Hooks.
  const seqByTaskId = useMemo(() => taskIdMap(ws.tasks), [ws.tasks]);

  // "Group by nothing" is the one mode with no headings at all, so it renders
  // as a single flat list. Everything else goes through the grouped renderer
  // below, whatever the bucket key happens to be.
  if (groupBy === "none") {
    const flat = sortTasks(filtered.filter((t) => !t.parentId), sortBy);
    return (
      <SequenceList
        ws={ws}
        tasks={flat}
        onEdit={onEdit}
        showDueIn={sortBy === "deadline"}
        emptyLabel="Nothing matches the current filters."
      />
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-muted-foreground text-[13.5px]">
        {editableTracks
          ? "Drag tasks between tracks to re-bucket them · order top-to-bottom = sequence"
          : `Grouped by ${GROUP_OPTIONS.find((o) => o.id === groupBy)?.label.toLowerCase()} · edit a task to change where it sits`}
      </p>

      {buckets.map((g) => {
        const isOpen = !(collapsed[g.key] ?? false);
        const a = g.color ? accent(g.color) : null;
        // A track bucket lists every milestone belonging to that track, empty
        // ones included — the structure is the point, and an empty milestone
        // still needs its header to add work under.
        //
        // Any other bucket has no track of its own, so its milestones are
        // whichever ones its tasks actually point at. Matching on g.key would
        // compare a milestone's track against "owner:Ditlev" and find nothing,
        // filing every task under "not tied to a milestone".
        // Milestones and gates both group the tasks beneath them; the type
        // only changes the icon.
        const bucketMsIds = new Set(g.tasks.map((t) => t.milestoneId).filter(Boolean) as string[]);
        const groupMilestones = editableTracks
          ? ws.milestones.filter((m) => m.category === g.key)
          : ws.milestones.filter((m) => bucketMsIds.has(m.id));
        const msCount = groupMilestones.filter((m) => m.type !== "gate").length;
        const gateCount = groupMilestones.length - msCount;

        // Each milestone heads the tasks beneath it; tasks with no milestone
        // follow, directly in the track. Follow-up tasks sort exactly like any
        // other task — they are only marked by the gutter icon in TaskRow.
        type Row =
          | { kind: "task"; task: Task }
          | { kind: "msHeader"; group: MilestoneGroup };
        const rows: Row[] = [];

        // Grouping by milestone already puts them at the top level, so the
        // bucket's rows are its tasks directly — repeating the header inside
        // would nest each bucket under a copy of its own heading.
        if (!showsMilestoneHeaders(groupBy)) {
          sortTasks(g.tasks, sortBy).forEach((t) => rows.push({ kind: "task", task: t }));
        } else {
          for (const mg of groupByMilestone(g.tasks, groupMilestones)) {
            // Tasks that sit directly in the track need no heading of their own.
            if (mg.milestone) rows.push({ kind: "msHeader", group: mg });
            if (!mg.milestone || msOpen(mg)) {
              // Unfolding a checked-off milestone is a deliberate "show me
              // this", so it reaches past the status filter to its finished work.
              const shown = mg.reachedOn ? milestoneTasksFor(mg, g.key) : mg.tasks;
              const ordered = sortBy === "sequence" ? shown : sortTasks(shown, sortBy);
              ordered.forEach((t) => rows.push({ kind: "task", task: t }));
            }
          }
        }

        const isUndefined = g.key === "_none";

        return (
          <Collapsible key={g.key} open={isOpen} onOpenChange={() => toggleGroup(g.key)}>
            <div
              className={cn("flex items-center gap-3 rounded-[var(--radius-sm)] px-4 py-3", isUndefined && "border border-dashed border-[var(--t-red)]/40")}
              style={{ background: isUndefined ? "color-mix(in oklch, var(--t-red) 8%, var(--panel))" : a ? `color-mix(in oklch, ${accentVar(g.color)} 12%, var(--panel))` : "var(--paper-2)" }}
            >
              <CollapsibleTrigger asChild>
                <button className="flex flex-1 items-center gap-3 text-left">
                  {isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                  <span className={cn("eyebrow !normal-case !tracking-normal !text-[11px]", isUndefined ? "text-[var(--t-red)]" : "text-muted-foreground")}>
                    {isUndefined
                      ? "Data problem"
                      : GROUP_OPTIONS.find((o) => o.id === groupBy)?.label ?? "Track"}
                  </span>
                  {isUndefined && <TriangleAlert className="size-4 shrink-0 text-[var(--t-red)]" />}
                  {a && <span className="size-2.5 shrink-0 rounded-full" style={{ background: accentVar(g.color) }} />}
                  {editingTrack === g.key ? (
                    <Input
                      autoFocus
                      defaultValue={g.label}
                      onClick={(e) => e.stopPropagation()}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v && v !== g.label && editableTracks && !g.key.startsWith("_")) updateCat.mutate({ id: g.key, data: { label: v } });
                        setEditingTrack(null);
                      }}
                      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                      className="h-7 w-48 text-base"
                    />
                  ) : (
                    <span
                      className={cn("font-serif-display text-[19px] font-semibold", isUndefined && "text-[var(--t-red)]")}
                      onDoubleClick={(e) => { e.stopPropagation(); if (editableTracks && !g.key.startsWith("_")) setEditingTrack(g.key); }}
                      onClick={(e) => {
                        // Single click opens the editor; double-click still
                        // renames in place. The row's own toggle is suppressed.
                        // Only meaningful when the bucket IS a track — an owner
                        // or status heading has no editor behind it, so the
                        // click falls through to the fold toggle instead.
                        if (!editableTracks) return;
                        e.stopPropagation();
                        const cat = ws.categories.find((c) => c.id === g.key);
                        if (cat) onEditTrack(cat);
                      }}
                      title={editableTracks ? "Open the track editor · double-click to rename" : undefined}
                    >
                      {g.label}
                    </span>
                  )}
                  <Badge variant="secondary" className="text-[13px]">{g.tasks.length}</Badge>
                  {/* Icon only: the milestones themselves are listed directly
                      below with their own headers, so a count here just says
                      the same thing twice. One glyph per concept — the
                      milestone mark for milestones, the flag for gates. */}
                  {msCount > 0 && (
                    <MilestoneIcon
                      className="text-muted-foreground size-3.5"
                      aria-label={`${msCount} milestone${msCount === 1 ? "" : "s"}`}
                    />
                  )}
                  {gateCount > 0 && (
                    <Flag
                      className="size-3.5 text-[var(--t-red)]"
                      aria-label={`${gateCount} gate${gateCount === 1 ? "" : "s"}`}
                    />
                  )}
                </button>
              </CollapsibleTrigger>
              <div className="flex items-center gap-2">
                {editableTracks && !g.key.startsWith("_") && (
                  <>
                    {/* Everything about a track lives on this row: who owns it,
                        how it looks, and what it contains. */}
                    <Select
                      value={g.owner ?? "none"}
                      onValueChange={(v) =>
                        updateCat.mutate(
                          { id: g.key, data: { owner: v === "none" ? null : v } },
                          { onError: (e) => toast.error((e as Error).message) },
                        )
                      }
                    >
                      <SelectTrigger
                        className="text-muted-foreground h-8 w-auto gap-1.5 border-dashed text-[12.5px]"
                        title="Who is responsible for this track"
                      >
                        <UserRound className="size-3.5 shrink-0" />
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Assign someone</SelectItem>
                        {ws.stakeholders.map((person) => (
                          <SelectItem key={person.id} value={person.id}>
                            {person.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <TrackAddMenu
                      trackLabel={g.label}
                      hasMilestones={groupMilestones.length > 0}
                      onTask={() => onEdit(null, g.key, null)}
                      onMilestone={() => onEditMilestone(null, g.key, "milestone")}
                      onGate={() => onEditMilestone(null, g.key, "gate")}
                    />
                    <button
                      onClick={() => deleteTrack(g)}
                      title="Delete this track"
                      className="text-muted-foreground/70 rounded-[var(--radius-sm)] p-1.5 transition hover:bg-[color-mix(in_oklch,var(--t-red)_12%,transparent)] hover:text-[var(--t-red)]"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </>
                )}
              </div>
            </div>

            <CollapsibleContent>
              {isUndefined && (
                <p className="px-3 pb-2 pt-2.5 text-[13px] text-[var(--t-red)]">
                  These tasks have no track set.
                </p>
              )}
              <table className="w-full text-[14.5px]">
                <thead>
                  <tr className="border-b text-left">
                    <th className="w-20 py-4 pl-2 font-mono text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-soft)]">
                      <div className="flex items-center">
                        <span className="mr-1.5 size-4 shrink-0" />
                        <span className="size-4 shrink-0" />
                        <span className="ml-1">ID</span>
                      </div>
                    </th>
                    <th className="py-4 pr-6 font-mono text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-soft)]">Task name</th>
                    <th className="w-32 py-4 pr-4 font-mono text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-soft)]">Owner</th>
                    <th className="w-40 py-4 pr-4 font-mono text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-soft)]">Start → End date</th>
                    <th className="w-40 py-4 pr-4 pl-6 font-mono text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-soft)] whitespace-nowrap">Status</th>
                    <th className="w-16 py-4 pr-4"></th>
                  </tr>
                </thead>
                <tbody
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => handleDrop(null, g)}
                >
                  {rows.length === 0 && !isUndefined && (
                    <tr
                      onDragOver={(e) => { e.preventDefault(); setDragOverRow(`_empty_${g.key}`); }}
                      onDragLeave={() => setDragOverRow((r) => (r === `_empty_${g.key}` ? null : r))}
                      onDrop={(e) => { e.preventDefault(); e.stopPropagation(); handleDrop(null, g); }}
                    >
                      <td colSpan={7} className="py-2">
                        <div
                          className={cn(
                            "text-muted-foreground rounded-[var(--radius-sm)] border-2 border-dashed py-6 text-center text-[13.5px] transition",
                            dragOverRow === `_empty_${g.key}` ? "border-primary bg-primary/5 text-primary" : "border-[var(--line)]",
                          )}
                        >
                          {ws.tasks.some((t) => !t.parentId && t.category === g.key)
                            ? "Every task here is hidden by the current filter"
                            : "Drag a task here, or use “Task” above to add one"}
                        </div>
                      </td>
                    </tr>
                  )}
                  {rows.map((row) => {
                    if (row.kind === "msHeader") {
                      const mg = row.group;
                      const m = mg.milestone!;
                      const isGate = m.type === "gate";
                      const col = isGate ? "var(--t-red)" : a ? accentVar(g.color) : "var(--accent-deep)";
                      const done = !!mg.reachedOn;
                      const open = msOpen(mg);
                      return (
                        <tr key={`ms-${mg.key}`}>
                          <td colSpan={7} className="pb-1 pt-4 first:pt-1">
                            {/* A milestone is checked off by a person, never
                                by its last task finishing. Once it is, it
                                recedes and keeps a green mark. */}
                            <div className={cn("flex items-center gap-2.5", done && "opacity-65")}>
                              <button
                                onClick={() => toggleMilestone(mg.key, open)}
                                className="text-muted-foreground hover:text-foreground shrink-0 transition"
                                title={open ? "Fold this milestone" : "Show its tasks"}
                                aria-expanded={open}
                              >
                                <ChevronRight className={cn("size-3.5 transition", open && "rotate-90")} />
                              </button>
                              <button
                                onClick={() => onEditMilestone(m)}
                                className="group/ms flex min-w-0 items-center gap-2.5 text-left"
                                title={isGate ? "Edit this gate" : "Edit this milestone"}
                              >
                                <span
                                  className="flex size-6 shrink-0 items-center justify-center rounded-[var(--radius-sm)]"
                                  style={
                                    done
                                      ? { background: "color-mix(in oklch, var(--hue-done) 16%, var(--panel))", color: "var(--hue-done)" }
                                      : { background: `color-mix(in oklch, ${col} 16%, var(--panel))`, color: col }
                                  }
                                >
                                  {done ? <Check className="size-3.5" /> : isGate ? <Flag className="size-3.5" /> : <MilestoneIcon className="size-3.5" />}
                                </span>
                                <span className={cn("truncate text-[14px] font-bold group-hover/ms:underline", done && "text-muted-foreground")}>
                                  {m.title || (isGate ? "Untitled gate" : "Untitled milestone")}
                                </span>
                                {isGate && (
                                  <span className="shrink-0 rounded-full bg-[var(--t-red)]/12 px-2 py-[1px] font-mono text-[10px] font-bold uppercase tracking-wide text-[var(--t-red)]">
                                    Gate
                                  </span>
                                )}
                                {done && (
                                  <span
                                    className="shrink-0 font-mono text-[11.5px] font-semibold"
                                    style={{ color: "color-mix(in oklch, var(--hue-done) 72%, var(--ink))" }}
                                  >
                                    {isGate ? "approved" : "reached"} {fmtD(mg.reachedOn)}
                                  </span>
                                )}
                              </button>
                              <span className="h-px flex-1 bg-[var(--line)]" />
                              <Button
                                variant="ghost"
                                size="sm"
                                className={cn("h-7 shrink-0 text-[12px]", done ? "text-[var(--hue-done)]" : "text-muted-foreground hover:text-foreground")}
                                onClick={() =>
                                  updateMilestone.mutate(
                                    { id: m.id, data: { reachedOn: done ? "" : todayISO() } },
                                    { onError: (e) => toast.error((e as Error).message) },
                                  )
                                }
                                title={done ? "Mark as not reached" : isGate ? "Check this gate off as approved" : "Check this milestone off as reached"}
                              >
                                <Check className="size-3.5" />
                                {done ? (isGate ? "Approved" : "Reached") : (isGate ? "Approve" : "Mark reached")}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-muted-foreground hover:text-foreground h-7 shrink-0 text-[12px]"
                                onClick={() => onEdit(null, g.key, m.id)}
                                title={`Add a task under “${m.title}”`}
                              >
                                <Plus className="size-3.5" /> Task
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    }

                    const t = row.task;
                    const subs = subtasksOf(t.id);
                    const subsOpen = expandedSubs[t.id] ?? false;
                    const deps = depsOf(t, { tasks: ws.tasks, products: ws.products, externals: ws.externals });
                    const blocked = deps.some((d) => d.violated);
                    const followupOfId = (t.deps ?? []).find((d) => d.type === "followup")?.refId;
                    const originSeq = followupOfId ? seqByTaskId.get(followupOfId) ?? null : null;
                    return (
                      <Fragment key={t.id}>
                        <TaskRow
                          seq={seqByTaskId.get(t.id) ?? null}
                          originSeq={originSeq}
                          task={t} ws={ws} blocked={blocked}
                          hasSubtasks={subs.length > 0}
                          subsOpen={subsOpen}
                          doneCount={subs.filter((s) => s.status === "done").length}
                          totalCount={subs.length}
                          onToggleSubs={() => toggleSubs(t.id)}
                          onEdit={() => onEdit(t)}
                          onDelete={async () => { if (await confirm({ title: `Delete “${t.title || "this task"}”?`, body: "This also removes its subtasks, comments and links." })) del.mutate(t.id, { onError: (e) => toast.error((e as Error).message) }); }}
                          indent={0}
                          dragging={dragTaskId === t.id}
                          dragOver={dragOverRow === t.id}
                          onDragStart={() => setDragTaskId(t.id)}
                          onDragOver={() => setDragOverRow(t.id)}
                          onDrop={() => handleDrop(t, g)}
                          onStartAddSubtask={() => { setAddingSubFor(t.id); setSubTitle(""); }}
                          onJumpTo={(target) => onEdit(target)}
                          onToggleDone={() => toggleDone(t)}
                        />
                        {addingSubFor === t.id && (
                          <tr>
                            <td></td>
                            <td colSpan={6} className="py-1.5 pr-4">
                              <input
                                autoFocus
                                value={subTitle}
                                onChange={(e) => setSubTitle(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") commitAddSubtask(t);
                                  if (e.key === "Escape") { setAddingSubFor(null); setSubTitle(""); }
                                }}
                                onBlur={() => commitAddSubtask(t)}
                                placeholder="Subtask title…"
                                className="w-full max-w-sm rounded border border-[var(--line-strong)] bg-[var(--panel)] px-2 py-1 pl-8 text-[13.5px] outline-none focus:border-primary"
                              />
                            </td>
                          </tr>
                        )}
                        {subsOpen && subs.map((sub) => (
                          <TaskRow
                            key={sub.id}
                            seq={null}
                            task={sub} ws={ws} blocked={false}
                            hasSubtasks={false} subsOpen={false} doneCount={0} totalCount={0}
                            onToggleSubs={() => {}}
                            onEdit={() => onEdit(sub)}
                            onDelete={async () => { if (await confirm({ title: `Delete “${sub.title || "this subtask"}”?` })) del.mutate(sub.id, { onError: (e) => toast.error((e as Error).message) }); }}
                            indent={1}
                            dragging={false} dragOver={false}
                            onDragStart={() => {}} onDragOver={() => {}} onDrop={() => {}}
                            onJumpTo={(target) => onEdit(target)}
                            onToggleDone={() => toggleDone(sub)}
                          />
                        ))}
                      </Fragment>
                    );
                  })}
                  {editableTracks && !g.key.startsWith("_") && (
                    <tr
                      onDragOver={(e) => { e.preventDefault(); setDragOverRow(`_end_${g.key}`); }}
                      onDragLeave={() => setDragOverRow((r) => (r === `_end_${g.key}` ? null : r))}
                      onDrop={(e) => { e.preventDefault(); e.stopPropagation(); handleDrop(null, g); }}
                      className={cn("h-3", dragOverRow === `_end_${g.key}` && "border-t-2 border-t-primary")}
                    >
                      <td colSpan={7}></td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CollapsibleContent>
          </Collapsible>
        );
      })}

      {buckets.length === 0 && (
        <p className="text-muted-foreground py-12 text-center text-sm">No tasks match the current filters.</p>
      )}
    </div>
  );
}

// ── "Sequence" flat view ─────────────────────────────────────────────────────

function SequenceList({
  ws, tasks, onEdit, showDueIn = false, emptyLabel = "No tasks match the current filters.",
}: {
  ws: WorkingSet; tasks: Task[]; onEdit: (t: Task | null) => void;
  /** Adds a "Due in" column — how long until (or since) each end date. */
  showDueIn?: boolean;
  emptyLabel?: string;
}) {
  const catMap = new Map(ws.categories.map((c) => [c.id, c]));
  const today = new Date().toISOString().slice(0, 10);

  if (tasks.length === 0) {
    return <p className="text-muted-foreground py-12 text-center text-sm">{emptyLabel}</p>;
  }

  return (
    <div className="overflow-x-auto rounded-[var(--radius-lg)] border">
      <table className="w-full table-fixed text-[14.5px]">
        <thead>
          <tr className="border-b bg-[var(--paper-2)] text-left">
            <th className="w-12 py-4 pl-4 font-mono text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-soft)]">#</th>
            <th className="w-[46%] py-4 pr-6 font-mono text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-soft)]">Task name</th>
            <th className="w-36 py-4 pr-4 font-mono text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-soft)]">Track</th>
            <th className="w-36 py-4 pr-4 font-mono text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-soft)]">Depends on</th>
            <th className="w-28 py-4 pr-4 font-mono text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-soft)]">Owner</th>
            <th className="w-40 py-4 pr-4 font-mono text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-soft)]">Start → End date</th>
            {showDueIn && (
              <th className="w-28 py-4 pr-4 font-mono text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-soft)] whitespace-nowrap">Due in</th>
            )}
            <th className="w-32 py-4 pr-4 font-mono text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-soft)]">Status</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((t, i) => {
            const cat = t.category ? catMap.get(t.category) : null;
            const catIcon = cat?.icon ? TRACK_ICONS[cat.icon] : null;
            const deps = depsOf(t, { tasks: ws.tasks, products: ws.products, externals: ws.externals });
            const blocked = deps.some((d) => d.violated);
            const who = t.assignees ?? [];
            return (
              <tr
                key={t.id}
                onClick={() => onEdit(t)}
                className={cn(
                  "cursor-pointer border-b border-[var(--line)] transition last:border-0 hover:bg-[var(--paper-2)]",
                  blocked && "bg-[color-mix(in_oklch,var(--t-red)_5%,transparent)]",
                )}
                title={blocked ? "Dependency block" : undefined}
              >
                <td className="text-muted-foreground py-4 pl-4 font-mono text-[13px]">{i + 1}</td>
                <td className="py-4 pr-6">
                  <span className="flex items-center gap-3">
                    <span className="size-2.5 shrink-0 rounded-full" style={{ background: statusVar(t.status) }} />
                    {/* How the task gets done, so a meeting is recognisable
                        without opening it. Build is the default and unremarkable,
                        so it stays unmarked. */}
                    {t.kind && t.kind !== "build" && (() => {
                      const k = kindOf(t.kind);
                      const KIcon = k.Icon;
                      return (
                        <KIcon
                          className="size-3.5 shrink-0"
                          style={{ color: k.tone }}
                          aria-label={k.label}
                        />
                      );
                    })()}
                    {t.priority && <PriorityDot />}
                    <span className="font-medium">{t.title}</span>
                    {blocked && <span className="text-[11px] font-bold text-[var(--t-red)]" title="Dependency block">⛔</span>}
                  </span>
                </td>
                <td className="py-4 pr-4">
                  {cat && (
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium"
                      style={{ background: `color-mix(in oklch, ${accentVar(cat.color)} 16%, var(--panel))`, color: accentVar(cat.color) }}
                    >
                      {catIcon && <catIcon.Icon className="size-3" />}
                      {cat.label}
                    </span>
                  )}
                </td>
                <td className="py-4 pr-4">
                  {deps.length === 0 ? (
                    <span className="text-muted-foreground text-[13px]">—</span>
                  ) : (
                    <div className="flex flex-wrap gap-x-3 gap-y-1">
                      {deps.map((d) => (
                        <span
                          key={d.id}
                          className={cn("text-[13px]", d.violated ? "font-semibold text-[var(--t-red)]" : d.blocked ? "text-[var(--t-amber)]" : "text-muted-foreground")}
                          title={d.violated ? "Dependency block — starts before this can finish" : undefined}
                        >
                          {d.blocked ? "⛔ " : "✓ "}{d.name}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td className="text-muted-foreground py-4 pr-4 text-[13.5px]">
                  {who.length === 0 ? "—" : who.length === 1 ? who[0] : `${who.length} people`}
                </td>
                <td className="text-muted-foreground py-4 pr-4 font-mono text-[13px]">
                  {t.start && t.end ? (
                    `${fmtD(t.start)} → ${fmtD(t.end)}`
                  ) : (
                    <span className="inline-flex items-center gap-2 text-muted-foreground" title="Missing start and/or end date">
                      <span className="size-2 shrink-0 rounded-full border-[1.5px] border-current opacity-60" />
                      {t.start || t.end ? `${t.start ? fmtD(t.start) : "?"} → ${t.end ? fmtD(t.end) : "?"}` : "No dates"}
                    </span>
                  )}
                </td>
                {showDueIn && (() => {
                  const days = t.end ? daysBetween(today, t.end) : null;
                  if (days === null) return <td className="text-muted-foreground py-4 pr-4 text-[13px]">—</td>;
                  return (
                    <td className="py-4 pr-4 whitespace-nowrap">
                      <span
                        className={cn(
                          "font-mono text-[13px]",
                          days <= 7 ? "font-semibold text-[var(--t-amber)]" : "text-muted-foreground",
                        )}
                        title={`Due ${fmtD(t.end)}`}
                      >
                        {days === 0 ? "Today" : days === 1 ? "Tomorrow" : `${days}d`}
                      </span>
                    </td>
                  );
                })()}
                <td className="py-4 pr-4">
                  <span className="text-[13.5px] font-medium">{COLUMNS.find((s) => s.id === t.status)?.label ?? t.status}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Marks a task that takes priority. Red because it is the one thing in the
 *  row that asks to be looked at first. */
function PriorityDot() {
  return <span className="size-2 shrink-0 rounded-full bg-[var(--t-red)]" title="Priority" aria-label="Priority" />;
}

function TaskRow({
  seq, originSeq, task, ws, blocked, hasSubtasks, subsOpen, doneCount, totalCount,
  onToggleSubs, onEdit, onDelete, indent,
  dragging, dragOver, onDragStart, onDragOver, onDrop,
  onStartAddSubtask, onJumpTo, onToggleDone,
}: {
  seq: number | null; task: Task; ws: WorkingSet; blocked: boolean;
  /** The origin task's list-wide row number — set whenever this task is a
   *  follow-up, regardless of which track either one is in. Drives the
   *  always-visible circling-arrow icon in the gutter. */
  originSeq?: number | null;
  hasSubtasks: boolean; subsOpen: boolean; doneCount: number; totalCount: number;
  onToggleSubs: () => void; onEdit: () => void; onDelete: () => void; indent: number;
  dragging: boolean; dragOver: boolean;
  onDragStart: () => void; onDragOver: () => void; onDrop: () => void;
  onStartAddSubtask?: () => void;
  onJumpTo: (t: Task) => void;
  onToggleDone: () => void;
}) {
  const who = task.assignees ?? [];
  const done = task.status === "done";
  const ownerLabel = who.length === 0 ? "—" : who.length === 1 ? who[0] : `${who.length} people`;

  const followupOfId = (task.deps ?? []).find((d) => d.type === "followup")?.refId;
  const followupOf = followupOfId ? ws.tasks.find((t) => t.id === followupOfId) : undefined;

  return (
    <tr
      draggable={indent === 0}
      onDragStart={onDragStart}
      onDragOver={(e) => { e.preventDefault(); onDragOver(); }}
      onDrop={(e) => { e.preventDefault(); e.stopPropagation(); onDrop(); }}
      onDoubleClick={onEdit}
      title="Double-click to open"
      className={cn(
        "group/row relative cursor-pointer border-b border-[var(--line)] hover:bg-[var(--paper-2)]",
        dragging && "opacity-40",
        dragOver && "border-t-2 border-t-primary",
      )}
    >
      <td className="w-20 py-4 pl-2">
        <div className="flex items-center">
          {/* Check off in place. Hidden until the row is hovered so the list
              stays quiet, but always shown once ticked — done is worth seeing. */}
          <button
            type="button"
            role="checkbox"
            aria-checked={done}
            aria-label={done ? "Mark as not done" : "Mark as done"}
            title={done ? "Mark as not done" : "Mark as done"}
            onClick={(e) => { e.stopPropagation(); onToggleDone(); }}
            onDoubleClick={(e) => e.stopPropagation()}
            className={cn(
              "mr-1.5 flex size-4 shrink-0 items-center justify-center rounded-[4px] border-[1.5px] transition",
              done
                ? "border-[var(--t-green)] bg-[var(--t-green)] text-white"
                : "border-[var(--ink-soft)] opacity-0 hover:border-foreground focus-visible:opacity-100 group-hover/row:opacity-100",
            )}
          >
            {done && <Check className="size-3" strokeWidth={3} />}
          </button>
          <span className="flex size-4 shrink-0 items-center justify-center">
            <GripVertical className="text-muted-foreground/30 size-4 cursor-grab opacity-0 group-hover:opacity-100" />
          </span>
          {indent === 0 ? (
            seq !== null && <span className="ml-1 shrink-0 font-mono text-[10px] text-[var(--ink-soft)]" title={`Task ID #${seq}`}>{seq}</span>
          ) : (
            <span className="text-muted-foreground/40 ml-1 text-sm">↳</span>
          )}
          {hasSubtasks && (
            <button onClick={(e) => { e.stopPropagation(); onToggleSubs(); }} className="text-muted-foreground hover:text-foreground ml-2 shrink-0">
              {subsOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
            </button>
          )}
        </div>
      </td>
      <td className="relative py-4 pr-6">
        <div className={cn("flex items-center gap-3", indent > 0 && "text-[13.5px]")}>
          {task.priority && <PriorityDot />}
          {/* The line runs through the title when it is checked off. It is a
              width transition, so it only animates on the change — a task
              that was already done loads with the line in place. */}
          <span className={cn("relative leading-snug font-medium transition-colors duration-500", done && "text-muted-foreground")}>
            {task.title}
            <span
              aria-hidden
              className={cn(
                "pointer-events-none absolute top-1/2 left-0 h-[1.5px] bg-current transition-[width] duration-500 ease-out",
                done ? "w-full" : "w-0",
              )}
            />
          </span>
          {originSeq !== null && originSeq !== undefined && (
            <button
              onClick={(e) => { e.stopPropagation(); if (followupOf) onJumpTo(followupOf); }}
              className="relative ml-1 inline-flex size-6 shrink-0 items-center justify-center text-[var(--accent-c)]"
              title={`Follow-up of task #${originSeq}${followupOf ? ` — "${followupOf.title || "Untitled task"}"` : ""} — click to open`}
            >
              <RotateCw className="size-6" strokeWidth={1.5} />
              <span className="absolute inset-0 flex items-center justify-center font-mono text-[9px] font-bold">
                {originSeq}
              </span>
            </button>
          )}
          {(task.comments?.length ?? 0) > 0 && (
            <span className="text-muted-foreground/60 flex items-center gap-1 text-[12px]">
              <MessageSquare className="size-3.5" />{task.comments.length}
            </span>
          )}
          {hasSubtasks && (
            <span className="text-muted-foreground/70 font-mono text-[11px]">{doneCount}/{totalCount}</span>
          )}
          {blocked && <span title="Dependency block" className="text-[11px] font-bold text-[var(--t-red)]">⛔</span>}
        </div>
        {indent === 0 && onStartAddSubtask && (
          <button
            onClick={(e) => { e.stopPropagation(); onStartAddSubtask(); }}
            title="Add subtask"
            className="text-muted-foreground hover:text-foreground hover:border-primary hover:text-primary absolute -bottom-4 left-3 z-10 inline-flex items-center gap-2 rounded-full border bg-[var(--panel)] px-3 py-1 text-[11.5px] font-medium opacity-0 shadow-sm transition group-hover/row:opacity-100"
          >
            <Plus className="size-3" /> Sub-task
          </button>
        )}
      </td>
      <td className="text-muted-foreground py-4 pr-4 text-[13.5px]">{ownerLabel}</td>
      <td className="text-muted-foreground py-4 pr-4 font-mono text-[13px]">
        {task.start && task.end ? (
          `${fmtD(task.start)} → ${fmtD(task.end)}`
        ) : (
          <span className="inline-flex items-center gap-2 text-muted-foreground" title="Missing start and/or end date">
            <span className="size-2 shrink-0 rounded-full border-[1.5px] border-current opacity-60" />
            {task.start || task.end ? `${task.start ? fmtD(task.start) : "?"} → ${task.end ? fmtD(task.end) : "?"}` : "No dates"}
          </span>
        )}
      </td>
      <td className="w-40 py-4 pr-4 pl-6 whitespace-nowrap">
        <span className="flex items-center gap-3 text-[13.5px] font-medium">
          <span className="size-2.5 shrink-0 rounded-full" style={{ background: statusVar(task.status) }} />
          {COLUMNS.find((s) => s.id === task.status)?.label ?? task.status}
        </span>
      </td>
      <td className="py-4 pr-4">
        {/* Always visible rather than hover-only — a delete you can't see is
            a delete you can't find. */}
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            title="Edit task"
            className="text-muted-foreground hover:bg-muted hover:text-foreground rounded-[var(--radius-sm)] p-1.5 transition"
          >
            <Pencil className="size-4" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            title="Delete task"
            className="text-muted-foreground/70 rounded-[var(--radius-sm)] p-1.5 transition hover:bg-[color-mix(in_oklch,var(--t-red)_12%,transparent)] hover:text-[var(--t-red)]"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}
