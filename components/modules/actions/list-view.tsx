"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Plus, Trash2, Pencil, ChevronRight, ChevronDown, MessageSquare, GripVertical, Flag, Milestone as MilestoneIcon,
  TriangleAlert, RotateCw,
} from "lucide-react";
import { useCreateEntity, useUpdateEntity, useDeleteEntity } from "@/lib/api/hooks";
import type { Task, WorkingSet, Milestone } from "@/lib/types";
import { depsOf, statusVar, fmtD, sequenceTasks, taskIdMap, COLUMNS, TRACK_ICONS } from "@/lib/tasks";
import { accent, accentVar } from "@/lib/colors";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { COLLAPSE_STORAGE_KEY_PREFIX, OPEN_SUBS_STORAGE_KEY_PREFIX } from "@/components/modules/actions/shared";
import type { SortMode } from "@/components/modules/actions/shared";

const PRIO_RANK: Record<string, number> = { high: 0, med: 1, low: 2 };
const STATUS_RANK: Record<string, number> = Object.fromEntries(COLUMNS.map((c, i) => [c.id, i]));

function ownerOf(t: Task): string {
  const who = t.assignees ?? [];
  return who.length ? who[0] : "";
}

/** Comparators for the flat (non-Track) sort modes — undated/unset values always sort last. */
const FLAT_SORTERS: Partial<Record<SortMode, (a: Task, b: Task) => number>> = {
  dueDate: (a, b) => (a.end || "9999-99-99").localeCompare(b.end || "9999-99-99"),
  priority: (a, b) => (PRIO_RANK[a.priority] ?? 99) - (PRIO_RANK[b.priority] ?? 99),
  status: (a, b) => (STATUS_RANK[a.status] ?? 99) - (STATUS_RANK[b.status] ?? 99),
  owner: (a, b) => {
    const ao = ownerOf(a), bo = ownerOf(b);
    if (!ao && !bo) return 0;
    if (!ao) return 1;
    if (!bo) return -1;
    return ao.localeCompare(bo);
  },
};

const SYNTH_GROUPS = [
  { key: "_comms", label: "Communications", color: "teal", origin: "comms" },
  { key: "_change", label: "Change management", color: "purple", origin: "change" },
] as const;

interface Group {
  key: string;
  label: string;
  color: string | null;
  tasks: Task[];
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
  ws, projectId, filtered, hasActiveFilter, sort, fCat, setFCat, onEdit, onEditMilestone,
}: {
  ws: WorkingSet; projectId: string; filtered: Task[]; hasActiveFilter: boolean; sort: SortMode;
  fCat: string[]; setFCat: (v: string[]) => void;
  onEdit: (t: Task | null, defaultCategoryId?: string | null) => void;
  onEditMilestone: (m: Milestone | null, defaultCategoryId?: string | null, defaultType?: "milestone" | "gate") => void;
}) {
  const create = useCreateEntity(projectId, "tasks");
  const update = useUpdateEntity(projectId, "tasks");
  const del = useDeleteEntity(projectId, "tasks");
  const updateCat = useUpdateEntity(projectId, "categories");

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => loadJSON(`${COLLAPSE_STORAGE_KEY_PREFIX}${projectId}`, {}));
  const [expandedSubs, setExpandedSubs] = useState<Record<string, boolean>>(() => loadJSON(`${OPEN_SUBS_STORAGE_KEY_PREFIX}${projectId}`, {}));
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const [dragOverRow, setDragOverRow] = useState<string | null>(null);
  const [addingSubFor, setAddingSubFor] = useState<string | null>(null);
  const [subTitle, setSubTitle] = useState("");

  function commitAddSubtask(parent: Task) {
    const title = subTitle.trim();
    setAddingSubFor(null);
    if (!title) { setSubTitle(""); return; }
    create.mutate(
      {
        title, status: "backlog", priority: parent.priority,
        category: parent.category, origin: parent.origin,
        parentId: parent.id, assignees: parent.assignees, tags: parent.tags,
        deps: [], comments: [], custom: {},
      },
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

  // "Sequence" — a flat, ungrouped list ordered by date then dependency,
  // undated tasks last. Dependency relationships still resolve and blocked
  // rows are flagged even though grouping by track is gone in this mode.
  const sequenced = useMemo(() => {
    const topLevel = filtered.filter((t) => !t.parentId);
    return sequenceTasks(topLevel);
  }, [filtered]);

  // Name / Due date / Priority / Status / Owner — flat sort modes, reusing
  // the same "no track grouping" list as Sequence, just ordered differently.
  const flatSorted = useMemo(() => {
    const cmp = FLAT_SORTERS[sort];
    if (!cmp) return [];
    const topLevel = filtered.filter((t) => !t.parentId);
    return [...topLevel].sort(cmp);
  }, [filtered, sort]);

  // Categories default to expanded — a group only collapses once the user
  // explicitly closes it (and that choice is what's persisted).
  function toggleGroup(key: string) {
    setCollapsed((s) => {
      const next = { ...s, [key]: !(s[key] ?? false) };
      saveJSON(`${COLLAPSE_STORAGE_KEY_PREFIX}${projectId}`, next);
      return next;
    });
  }

  const groups: Group[] = useMemo(() => {
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
    ws.categories.forEach((c) => {
      const tasks = byCat.get(c.id) ?? [];
      if (tasks.length || !hasActiveFilter) out.push({ key: c.id, label: c.label, color: c.color, tasks });
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
  }, [filtered, ws.categories, hasActiveFilter]);

  function subtasksOf(parentId: string) {
    return filtered.filter((t) => t.parentId === parentId);
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
  // "sequence" sort early-return) to satisfy the Rules of Hooks.
  const seqByTaskId = useMemo(() => taskIdMap(ws.tasks), [ws.tasks]);

  if (sort === "sequence") {
    return <SequenceList ws={ws} tasks={sequenced} onEdit={onEdit} />;
  }
  if (FLAT_SORTERS[sort]) {
    return <SequenceList ws={ws} tasks={flatSorted} onEdit={onEdit} />;
  }

  return (
    <div className="space-y-6">
      <p className="text-muted-foreground text-[13.5px]">
        Drag tasks between tracks to re-bucket them · order top-to-bottom = sequence
      </p>

      {groups.map((g) => {
        const isOpen = !(collapsed[g.key] ?? false);
        const a = g.color ? accent(g.color) : null;
        const groupMilestones = ws.milestones.filter((m) => m.type === "milestone" && m.category === g.key);
        const groupGates = ws.milestones.filter((m) => m.type === "gate" && m.category === g.key && m.date);

        // Interleave gates between task rows by date. Follow-up tasks sort
        // exactly like any other task here — no forced adjacency to their
        // origin. They're only visually distinguished by the gutter icon in
        // TaskRow (see followupOf), which shows the origin's row number no
        // matter which track the follow-up ends up in.
        type Row = { kind: "task"; task: Task } | { kind: "gate"; gate: Milestone };
        const rows: Row[] = [];
        const sortedGates = [...groupGates].sort((x, y) => (x.date < y.date ? -1 : 1));
        const dated = g.tasks.filter((t) => t.end).sort((x, y) => (x.end < y.end ? -1 : 1));
        const undated = g.tasks.filter((t) => !t.end);
        let gateIdx = 0;
        dated.forEach((t) => {
          rows.push({ kind: "task", task: t });
          while (gateIdx < sortedGates.length && sortedGates[gateIdx].date <= t.end) {
            rows.push({ kind: "gate", gate: sortedGates[gateIdx] });
            gateIdx++;
          }
        });
        while (gateIdx < sortedGates.length) {
          rows.push({ kind: "gate", gate: sortedGates[gateIdx] });
          gateIdx++;
        }
        undated.forEach((t) => rows.push({ kind: "task", task: t }));

        const today = new Date().toISOString().slice(0, 10);
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
                    {isUndefined ? "Data problem" : "Track"}
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
                        if (v && v !== g.label && !g.key.startsWith("_")) updateCat.mutate({ id: g.key, data: { label: v } });
                        setEditingTrack(null);
                      }}
                      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                      className="h-7 w-48 text-base"
                    />
                  ) : (
                    <span
                      className={cn("font-serif-display text-[19px] font-semibold", isUndefined && "text-[var(--t-red)]")}
                      onDoubleClick={(e) => { e.stopPropagation(); if (!g.key.startsWith("_")) setEditingTrack(g.key); }}
                    >
                      {g.label}
                    </span>
                  )}
                  <Badge variant="secondary" className="text-[13px]">{g.tasks.length}</Badge>
                  {(groupMilestones.length + groupGates.length) > 0 && (
                    <span className="text-muted-foreground flex items-center gap-1 text-[13px]">
                      <Flag className="size-3.5" /> {groupMilestones.length + groupGates.length}
                    </span>
                  )}
                </button>
              </CollapsibleTrigger>
              <div className="flex items-center gap-2">
                {!g.key.startsWith("_") && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 border-dashed text-[12.5px]"
                      onClick={() => onEditMilestone(null, g.key, "milestone")}
                      title="Add milestone"
                    >
                      <MilestoneIcon className="size-3.5" /> Milestone
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 border-dashed border-[var(--t-red)]/40 text-[12.5px] text-[var(--t-red)] hover:bg-[var(--t-red)]/10 hover:text-[var(--t-red)]"
                      onClick={() => onEditMilestone(null, g.key, "gate")}
                      title="Add gate"
                    >
                      <Flag className="size-3.5" /> Gate
                    </Button>
                  </>
                )}
              </div>
            </div>

            <CollapsibleContent>
              {isUndefined && (
                <p className="px-3 pb-2 pt-2.5 text-[13px] text-[var(--t-red)]">
                  These tasks have no track — every task should belong to one. Open each and set a track to clear this.
                </p>
              )}
              {/* Milestone strip */}
              {groupMilestones.length > 0 && (
                <div className="space-y-2 px-3 pb-2.5 pt-2.5">
                  {groupMilestones.map((m) => {
                    const col = a ? accentVar(g.color) : "var(--accent-deep)";
                    const mOverdue = m.date && m.date < today;
                    return (
                      <button
                        key={m.id}
                        onClick={() => onEditMilestone(m)}
                        className="group/ms relative flex w-full items-center gap-3 overflow-hidden rounded-[var(--radius-sm)] border-l-[4px] px-3.5 py-2.5 text-left shadow-sm transition hover:shadow-md"
                        style={{
                          borderLeftColor: col,
                          background: `color-mix(in oklch, ${col} 10%, var(--panel))`,
                        }}
                      >
                        <span className="absolute inset-0 opacity-0 transition group-hover/ms:opacity-5" style={{ background: col }} />
                        <span
                          className="relative flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-white shadow-sm"
                          style={{ background: col }}
                        >
                          <MilestoneIcon className="size-4" />
                        </span>
                        <div className="relative min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[14px] font-bold">
                              {m.title || "Untitled milestone"}
                              <span className={cn("ml-1 font-mono text-[12px] font-normal", mOverdue ? "font-bold text-[var(--t-red)]" : "text-muted-foreground")}>
                                {" – "}{m.date ? fmtD(m.date) : "No date"}
                              </span>
                            </span>
                            <span
                              className="rounded-full px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wide"
                              style={{ background: `color-mix(in oklch, ${col} 18%, transparent)`, color: col }}
                            >
                              Milestone
                            </span>
                          </div>
                          <p className="text-muted-foreground mt-0.5 text-[12px]">
                            Key point in the track&rsquo;s progress
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              <table className="w-full text-[14.5px]">
                <thead>
                  <tr className="border-b text-left">
                    <th className="w-14 py-4 pl-2 font-mono text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-soft)]">
                      <div className="flex items-center">
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
                          Drag a task here, or use &ldquo;Task&rdquo; above to add one
                        </div>
                      </td>
                    </tr>
                  )}
                  {rows.map((row) => {
                    if (row.kind === "gate") {
                      const overdue = row.gate.date && row.gate.date < today;
                      return (
                        <tr key={`gate-${row.gate.id}`}>
                          <td colSpan={7} className="py-2">
                            <button
                              onClick={() => onEditMilestone(row.gate)}
                              className="group/gate relative flex w-full items-center gap-4 overflow-hidden rounded-[var(--radius-sm)] border-l-[4px] border-l-[var(--t-red)] px-4 py-3.5 text-left transition"
                              style={{
                                backgroundImage:
                                  "repeating-linear-gradient(-45deg, color-mix(in oklch, var(--t-red) 12%, var(--panel)) 0 8px, var(--panel) 8px 16px)",
                              }}
                            >
                              <span className="absolute inset-0 bg-[var(--t-red)]/0 transition group-hover/gate:bg-[var(--t-red)]/5" />
                              <span className="relative flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--t-red)] text-white shadow-sm">
                                <svg viewBox="0 0 16 16" className="size-5" fill="none">
                                  <rect x="1" y="1" width="6" height="6" rx="1" fill="currentColor" />
                                  <rect x="9" y="1" width="6" height="6" rx="1" fill="currentColor" opacity="0.6" />
                                  <rect x="1" y="9" width="6" height="6" rx="1" fill="currentColor" opacity="0.6" />
                                  <rect x="9" y="9" width="6" height="6" rx="1" fill="currentColor" />
                                </svg>
                              </span>
                              <div className="relative min-w-0 flex-1">
                                <div className="flex items-center gap-2.5">
                                  <span className="text-[16px] font-bold">{row.gate.title || "Untitled gate"}</span>
                                  <span className="rounded-full bg-[var(--t-red)]/15 px-2.5 py-0.5 font-mono text-[10.5px] font-bold uppercase tracking-wide text-[var(--t-red)]">
                                    Gate
                                  </span>
                                </div>
                                <p className="text-muted-foreground mt-1 text-[13.5px]">
                                  Checkpoint · everything above must pass before continuing
                                </p>
                              </div>
                              {a && (
                                <span
                                  className="relative shrink-0 rounded-full px-3 py-1.5 text-[11.5px] font-medium"
                                  style={{ background: `color-mix(in oklch, ${accentVar(g.color)} 16%, var(--panel))`, color: accentVar(g.color) }}
                                >
                                  {g.label}
                                </span>
                              )}
                              <span className={cn("relative shrink-0 font-mono text-[13px]", overdue ? "font-bold text-[var(--t-red)]" : "text-muted-foreground")}>
                                {row.gate.date ? fmtD(row.gate.date) : "No date"}
                              </span>
                            </button>
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
                      <>
                        <TaskRow
                          key={t.id}
                          seq={seqByTaskId.get(t.id) ?? null}
                          originSeq={originSeq}
                          task={t} ws={ws} blocked={blocked}
                          hasSubtasks={subs.length > 0}
                          subsOpen={subsOpen}
                          doneCount={subs.filter((s) => s.status === "done").length}
                          totalCount={subs.length}
                          onToggleSubs={() => toggleSubs(t.id)}
                          onEdit={() => onEdit(t)}
                          onDelete={() => { if (confirm(`Delete "${t.title}"?`)) del.mutate(t.id, { onError: (e) => toast.error((e as Error).message) }); }}
                          indent={0}
                          dragging={dragTaskId === t.id}
                          dragOver={dragOverRow === t.id}
                          onDragStart={() => setDragTaskId(t.id)}
                          onDragOver={() => setDragOverRow(t.id)}
                          onDrop={() => handleDrop(t, g)}
                          onStartAddSubtask={() => { setAddingSubFor(t.id); setSubTitle(""); }}
                          onJumpTo={(target) => onEdit(target)}
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
                            onDelete={() => { if (confirm(`Delete "${sub.title}"?`)) del.mutate(sub.id, { onError: (e) => toast.error((e as Error).message) }); }}
                            indent={1}
                            dragging={false} dragOver={false}
                            onDragStart={() => {}} onDragOver={() => {}} onDrop={() => {}}
                            onJumpTo={(target) => onEdit(target)}
                          />
                        ))}
                      </>
                    );
                  })}
                  {!g.key.startsWith("_") && (
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

      {groups.length === 0 && (
        <p className="text-muted-foreground py-12 text-center text-sm">No tasks match the current filters.</p>
      )}
    </div>
  );
}

// ── "Sequence" flat view ─────────────────────────────────────────────────────

function SequenceList({
  ws, tasks, onEdit,
}: {
  ws: WorkingSet; tasks: Task[]; onEdit: (t: Task | null) => void;
}) {
  const catMap = new Map(ws.categories.map((c) => [c.id, c]));

  if (tasks.length === 0) {
    return <p className="text-muted-foreground py-12 text-center text-sm">No tasks match the current filters.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-[var(--radius-lg)] border">
      <table className="w-full text-[14.5px]">
        <thead>
          <tr className="border-b bg-[var(--paper-2)] text-left">
            <th className="w-12 py-4 pl-4 font-mono text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-soft)]">#</th>
            <th className="py-4 pr-6 font-mono text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-soft)]">Task name</th>
            <th className="w-36 py-4 pr-4 font-mono text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-soft)]">Track</th>
            <th className="w-56 py-4 pr-4 font-mono text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-soft)]">Depends on</th>
            <th className="w-32 py-4 pr-4 font-mono text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-soft)]">Owner</th>
            <th className="w-40 py-4 pr-4 font-mono text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-soft)]">Start → End date</th>
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
                    <span className="inline-flex items-center gap-2 text-[var(--t-red)]" title="Missing start and/or end date">
                      <span className="size-2 shrink-0 rounded-full border-[1.5px] border-[var(--t-red)]" />
                      {t.start || t.end ? `${t.start ? fmtD(t.start) : "?"} → ${t.end ? fmtD(t.end) : "?"}` : "No dates"}
                    </span>
                  )}
                </td>
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

function TaskRow({
  seq, originSeq, task, ws, blocked, hasSubtasks, subsOpen, doneCount, totalCount,
  onToggleSubs, onEdit, onDelete, indent,
  dragging, dragOver, onDragStart, onDragOver, onDrop,
  onStartAddSubtask, onJumpTo,
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
}) {
  const who = task.assignees ?? [];
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
      <td className="w-14 py-4 pl-2">
        <div className="flex items-center">
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
          <span className="leading-snug font-medium">{task.title}</span>
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
          <span className="inline-flex items-center gap-2 text-[var(--t-red)]" title="Missing start and/or end date">
            <span className="size-2 shrink-0 rounded-full border-[1.5px] border-[var(--t-red)]" />
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
        <div className="flex items-center gap-2 opacity-0 transition group-hover:opacity-100">
          <button onClick={(e) => { e.stopPropagation(); onEdit(); }} className="text-muted-foreground hover:text-foreground"><Pencil className="size-4" /></button>
          <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="text-muted-foreground hover:text-[var(--t-red)]"><Trash2 className="size-4" /></button>
        </div>
      </td>
    </tr>
  );
}
