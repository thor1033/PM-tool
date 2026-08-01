"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Plus, Trash2, Pencil, ChevronRight, ChevronDown, MessageSquare, GripVertical, Flag,
  Layers, CalendarDays,
} from "lucide-react";
import { useCreateEntity, useUpdateEntity, useDeleteEntity } from "@/lib/api/hooks";
import type { Task, WorkingSet, Milestone } from "@/lib/types";
import { depsOf, statusVar, fmtD, PRIO, COLUMNS } from "@/lib/tasks";
import { accent, accentVar } from "@/lib/colors";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";

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

function loadCollapsed(projectId: string): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(`atlas.actions.collapsed.${projectId}`) ?? "{}");
  } catch {
    return {};
  }
}
function saveCollapsed(projectId: string, state: Record<string, boolean>) {
  try {
    localStorage.setItem(`atlas.actions.collapsed.${projectId}`, JSON.stringify(state));
  } catch {
    // best-effort
  }
}

export function ListView({
  ws, projectId, filtered, hasActiveFilter, onEdit, onEditMilestone,
}: {
  ws: WorkingSet; projectId: string; filtered: Task[]; hasActiveFilter: boolean;
  onEdit: (t: Task | null, defaultCategoryId?: string | null) => void;
  onEditMilestone: (m: Milestone | null, defaultCategoryId?: string | null) => void;
}) {
  const create = useCreateEntity(projectId, "tasks");
  const update = useUpdateEntity(projectId, "tasks");
  const del = useDeleteEntity(projectId, "tasks");
  const updateCat = useUpdateEntity(projectId, "categories");

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => loadCollapsed(projectId));
  const [expandedSubs, setExpandedSubs] = useState<Record<string, boolean>>({});
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const [dragOverRow, setDragOverRow] = useState<string | null>(null);
  const [editingTrack, setEditingTrack] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<"track" | "date">(() => {
    if (typeof window === "undefined") return "track";
    try { return (localStorage.getItem(`atlas.actions.listSort.${projectId}`) as "track" | "date") ?? "track"; } catch { return "track"; }
  });
  function changeSortMode(mode: "track" | "date") {
    setSortMode(mode);
    try { localStorage.setItem(`atlas.actions.listSort.${projectId}`, mode); } catch { /* ignore */ }
  }

  // "By date" — a flat, ungrouped list sorted by start date (undated tasks
  // last), simplest possible reading of "sequence = tasks sorted by date".
  const byDate = useMemo(() => {
    const topLevel = filtered.filter((t) => !t.parentId);
    const dateKey = (t: Task) => t.start || t.end || "9999-99-99";
    return [...topLevel].sort((a, b) => dateKey(a).localeCompare(dateKey(b)));
  }, [filtered]);

  function toggleGroup(key: string) {
    setCollapsed((s) => {
      const next = { ...s, [key]: !(s[key] ?? true) };
      saveCollapsed(projectId, next);
      return next;
    });
  }

  const groups: Group[] = useMemo(() => {
    const topLevel = filtered.filter((t) => !t.parentId);
    const byCat = new Map<string, Task[]>();
    const uncategorised: Task[] = [];
    const synthBuckets = new Map<string, Task[]>(SYNTH_GROUPS.map((g) => [g.key, []]));

    topLevel.forEach((t) => {
      const synth = SYNTH_GROUPS.find((g) => g.origin === t.origin);
      if (synth) {
        synthBuckets.get(synth.key)!.push(t);
        return;
      }
      if (t.category) {
        const arr = byCat.get(t.category) ?? [];
        arr.push(t);
        byCat.set(t.category, arr);
      } else {
        uncategorised.push(t);
      }
    });

    const out: Group[] = [];
    ws.categories.forEach((c) => {
      const tasks = byCat.get(c.id) ?? [];
      if (tasks.length || !hasActiveFilter) out.push({ key: c.id, label: c.label, color: c.color, tasks });
    });
    if (uncategorised.length || !hasActiveFilter) {
      out.push({ key: "_none", label: "Uncategorised", color: null, tasks: uncategorised });
    }
    SYNTH_GROUPS.forEach((g) => {
      const tasks = synthBuckets.get(g.key) ?? [];
      if (tasks.length) out.push({ key: g.key, label: g.label, color: g.color, tasks });
    });
    return out;
  }, [filtered, ws.categories, hasActiveFilter]);

  function subtasksOf(parentId: string) {
    return filtered.filter((t) => t.parentId === parentId);
  }

  function addSubtask(parent: Task) {
    create.mutate({
      title: "New subtask", status: "backlog", priority: parent.priority,
      category: parent.category, origin: parent.origin,
      parentId: parent.id, assignees: parent.assignees, tags: parent.tags,
      deps: [], comments: [], custom: {},
    }, { onError: (e) => toast.error((e as Error).message) });
  }

  // drag & drop: reorder within a group / move across groups (re-bucket)
  function handleDrop(targetTask: Task | null, targetGroup: Group) {
    if (!dragTaskId) return;
    const dragged = ws.tasks.find((t) => t.id === dragTaskId);
    setDragTaskId(null);
    setDragOverRow(null);
    if (!dragged) return;

    // "Uncategorised" only exists to surface legacy/imported tasks without a
    // category — it's not a valid drop target now that category is required.
    if (targetGroup.key === "_none") return;

    const synth = SYNTH_GROUPS.find((g) => g.key === targetGroup.key);
    // Communications/Change management groups key off `origin`, not
    // `category` — a task keeps its existing (mandatory) category when moved
    // into one of them, only its origin changes.
    const nextCategory = synth ? dragged.category : targetGroup.key;
    const nextOrigin = synth?.origin ?? null;

    if (dragged.category !== nextCategory || dragged.origin !== nextOrigin) {
      update.mutate({ id: dragged.id, data: { category: nextCategory, origin: nextOrigin } });
    }
    if (targetTask && targetTask.id !== dragged.id) {
      // Insert-before semantics via position: place just before target's position.
      update.mutate({ id: dragged.id, data: { position: targetTask.position - 1 } });
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex gap-1 rounded-[var(--radius-sm)] border bg-[var(--paper-2)] p-1">
          <button
            onClick={() => changeSortMode("track")}
            className={cn(
              "flex items-center gap-1.5 rounded-[6px] px-2.5 py-1 text-xs font-semibold transition",
              sortMode === "track" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Layers className="size-3.5" /> By track
          </button>
          <button
            onClick={() => changeSortMode("date")}
            className={cn(
              "flex items-center gap-1.5 rounded-[6px] px-2.5 py-1 text-xs font-semibold transition",
              sortMode === "date" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <CalendarDays className="size-3.5" /> By date
          </button>
        </div>
      </div>

      {sortMode === "date" && (
        <DateSortedList ws={ws} tasks={byDate} onEdit={onEdit} />
      )}

      {sortMode === "track" && groups.map((g) => {
        const isOpen = !(collapsed[g.key] ?? true);
        const a = g.color ? accent(g.color) : null;
        const groupMilestones = ws.milestones.filter((m) => m.type === "milestone" && m.category === g.key);
        const groupGates = ws.milestones.filter((m) => m.type === "gate" && m.category === g.key && m.date);

        // Interleave gates between task rows by date.
        const dated = g.tasks.filter((t) => t.end).sort((x, y) => (x.end < y.end ? -1 : 1));
        const undated = g.tasks.filter((t) => !t.end);
        type Row = { kind: "task"; task: Task } | { kind: "gate"; gate: Milestone };
        const rows: Row[] = [];
        let gateIdx = 0;
        const sortedGates = [...groupGates].sort((x, y) => (x.date < y.date ? -1 : 1));
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

        return (
          <Collapsible key={g.key} open={isOpen} onOpenChange={() => toggleGroup(g.key)}>
            <div
              className="flex items-center gap-2 rounded-[var(--radius-sm)] px-3 py-1.5"
              style={{ background: a ? `color-mix(in oklch, ${accentVar(g.color)} 12%, var(--panel))` : "var(--paper-2)" }}
            >
              <CollapsibleTrigger asChild>
                <button className="flex flex-1 items-center gap-2 text-left">
                  {isOpen ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                  <span className="text-muted-foreground eyebrow !normal-case !tracking-normal !text-[10px]">Track</span>
                  {a && <span className="size-2 shrink-0 rounded-full" style={{ background: accentVar(g.color) }} />}
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
                      className="h-6 w-40 text-sm"
                    />
                  ) : (
                    <span
                      className="text-sm font-semibold"
                      onDoubleClick={(e) => { e.stopPropagation(); if (!g.key.startsWith("_")) setEditingTrack(g.key); }}
                    >
                      {g.label}
                    </span>
                  )}
                  <Badge variant="secondary" className="text-xs">{g.tasks.length}</Badge>
                  {(groupMilestones.length + groupGates.length) > 0 && (
                    <span className="text-muted-foreground flex items-center gap-0.5 text-xs">
                      <Flag className="size-3" /> {groupMilestones.length + groupGates.length}
                    </span>
                  )}
                </button>
              </CollapsibleTrigger>
              <div className="flex items-center gap-1">
                <button
                  className="text-muted-foreground hover:text-foreground text-xs opacity-70 hover:opacity-100"
                  onClick={() => onEditMilestone(null, g.key.startsWith("_") ? null : g.key)}
                  title="Add gate / milestone"
                >
                  <Flag className="size-3.5" />
                </button>
                {!g.key.startsWith("_") && (
                  <button
                    className="text-muted-foreground hover:text-foreground opacity-70 hover:opacity-100"
                    onClick={() => onEdit(null, g.key)}
                    title="Add task to this track"
                  >
                    <Plus className="size-3.5" />
                  </button>
                )}
              </div>
            </div>

            <CollapsibleContent>
              {/* Milestone strip */}
              {groupMilestones.length > 0 && (
                <div className="flex flex-wrap gap-1.5 px-2 pb-1.5 pt-2">
                  {groupMilestones.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => onEditMilestone(m)}
                      className="inline-flex items-center gap-1.5 rounded-full border bg-[var(--panel)] px-2.5 py-1 text-xs font-medium transition hover:border-[var(--line-strong)]"
                      style={{ color: a ? accentVar(g.color) : "var(--accent-deep)" }}
                    >
                      ◆ {m.title} {m.date && <span className="text-muted-foreground font-mono">{fmtD(m.date)}</span>}
                    </button>
                  ))}
                </div>
              )}

              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="w-10 pb-1.5 pl-2"></th>
                    <th className="pb-1.5 font-mono text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Task</th>
                    <th className="w-32 pb-1.5 font-mono text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Tags</th>
                    <th className="w-28 pb-1.5 font-mono text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Owner</th>
                    <th className="w-36 pb-1.5 font-mono text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Dates</th>
                    <th className="w-28 pb-1.5 font-mono text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Status</th>
                    <th className="w-8 pb-1.5"></th>
                  </tr>
                </thead>
                <tbody
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => handleDrop(null, g)}
                >
                  {rows.map((row, i) => {
                    if (row.kind === "gate") {
                      const overdue = row.gate.date && row.gate.date < today;
                      return (
                        <tr key={`gate-${row.gate.id}`}>
                          <td colSpan={7} className="py-1.5">
                            <button
                              onClick={() => onEditMilestone(row.gate)}
                              className={cn(
                                "flex w-full items-center gap-2 rounded-[var(--radius-sm)] border-l-[3px] px-3 py-2 text-left transition hover:brightness-95",
                                overdue
                                  ? "border-l-[var(--t-red)] bg-[color-mix(in_oklch,var(--t-red)_8%,var(--paper-2))]"
                                  : "border-l-[var(--t-red)]/60 bg-[var(--paper-2)]",
                              )}
                            >
                              <span className="text-[var(--t-red)]">▐</span>
                              <span className="font-mono text-[10.5px] font-bold uppercase tracking-wide text-[var(--t-red)]">Gate</span>
                              <span className="text-sm font-semibold">{row.gate.title || "Checkpoint"}</span>
                              <span className="text-muted-foreground text-xs">— everything above must pass before continuing</span>
                              {a && <span className="rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: `color-mix(in oklch, ${accentVar(g.color)} 16%, var(--panel))`, color: accentVar(g.color) }}>{g.label}</span>}
                              <span className={cn("ml-auto font-mono text-xs", overdue ? "font-bold text-[var(--t-red)]" : "text-muted-foreground")}>
                                {fmtD(row.gate.date)}
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
                    return (
                      <>
                        <TaskRow
                          key={t.id}
                          seq={i + 1}
                          task={t} tagMap={tagMap(ws)} blocked={blocked}
                          hasSubtasks={subs.length > 0}
                          subsOpen={subsOpen}
                          doneCount={subs.filter((s) => s.status === "done").length}
                          totalCount={subs.length}
                          onToggleSubs={() => setExpandedSubs((s) => ({ ...s, [t.id]: !s[t.id] }))}
                          onEdit={() => onEdit(t)}
                          onDelete={() => { if (confirm(`Delete "${t.title}"?`)) del.mutate(t.id, { onError: (e) => toast.error((e as Error).message) }); }}
                          onAddSubtask={() => addSubtask(t)}
                          indent={0}
                          dragging={dragTaskId === t.id}
                          dragOver={dragOverRow === t.id}
                          onDragStart={() => setDragTaskId(t.id)}
                          onDragOver={() => setDragOverRow(t.id)}
                          onDrop={() => handleDrop(t, g)}
                        />
                        {subsOpen && subs.map((sub) => (
                          <TaskRow
                            key={sub.id}
                            seq={null}
                            task={sub} tagMap={tagMap(ws)} blocked={false}
                            hasSubtasks={false} subsOpen={false} doneCount={0} totalCount={0}
                            onToggleSubs={() => {}}
                            onEdit={() => onEdit(sub)}
                            onDelete={() => { if (confirm(`Delete "${sub.title}"?`)) del.mutate(sub.id, { onError: (e) => toast.error((e as Error).message) }); }}
                            onAddSubtask={() => {}}
                            indent={1}
                            dragging={false} dragOver={false}
                            onDragStart={() => {}} onDragOver={() => {}} onDrop={() => {}}
                          />
                        ))}
                      </>
                    );
                  })}
                  {!g.key.startsWith("_") && (
                    <tr>
                      <td colSpan={7} className="pb-1 pl-10 pt-1.5">
                        <button onClick={() => onEdit(null, g.key)} className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs">
                          <Plus className="size-3" /> Add action
                        </button>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CollapsibleContent>
          </Collapsible>
        );
      })}

      {sortMode === "track" && groups.length === 0 && (
        <p className="text-muted-foreground py-12 text-center text-sm">No tasks match the current filters.</p>
      )}
    </div>
  );
}

function tagMap(ws: WorkingSet) {
  return new Map(ws.tags.map((t) => [t.id, t]));
}

// ── "By date" flat view ──────────────────────────────────────────────────────

function DateSortedList({
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
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-[var(--paper-2)] text-left">
            <th className="w-10 pb-2 pl-3 pt-2 font-mono text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground">#</th>
            <th className="pb-2 pt-2 font-mono text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground">Task</th>
            <th className="w-32 pb-2 pt-2 font-mono text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground">Track</th>
            <th className="w-28 pb-2 pt-2 font-mono text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground">Owner</th>
            <th className="w-36 pb-2 pt-2 font-mono text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground">Dates</th>
            <th className="w-28 pb-2 pr-3 pt-2 font-mono text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground">Status</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((t, i) => {
            const cat = t.category ? catMap.get(t.category) : null;
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
              >
                <td className="text-muted-foreground py-2 pl-3 font-mono text-xs">{i + 1}</td>
                <td className="py-2 pr-4">
                  <span className="flex items-center gap-1.5">
                    <span className="size-1.5 shrink-0 rounded-full" style={{ background: `var(${PRIO[t.priority]?.var ?? "--ink-ghost"})` }} />
                    <span className="size-2 shrink-0 rounded-full" style={{ background: statusVar(t.status) }} />
                    {t.title}
                    {blocked && <span className="text-[10px] font-bold text-[var(--t-red)]" title="Dependency block">⛔</span>}
                  </span>
                </td>
                <td className="py-2 pr-2">
                  {cat && (
                    <span className="rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: `color-mix(in oklch, ${accentVar(cat.color)} 16%, var(--panel))`, color: accentVar(cat.color) }}>
                      {cat.label}
                    </span>
                  )}
                </td>
                <td className="text-muted-foreground py-2 pr-2 text-xs">
                  {who.length === 0 ? "—" : who.length === 1 ? who[0] : `${who.length} people`}
                </td>
                <td className="text-muted-foreground py-2 pr-2 font-mono text-xs">
                  {t.start || t.end ? `${t.start ? fmtD(t.start) : "?"} → ${t.end ? fmtD(t.end) : "?"}` : "—"}
                </td>
                <td className="py-2 pr-3">
                  <span className="text-xs font-medium">{COLUMNS.find((s) => s.id === t.status)?.label ?? t.status}</span>
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
  seq, task, tagMap, blocked, hasSubtasks, subsOpen, doneCount, totalCount,
  onToggleSubs, onEdit, onDelete, onAddSubtask, indent,
  dragging, dragOver, onDragStart, onDragOver, onDrop,
}: {
  seq: number | null; task: Task; tagMap: Map<string, WorkingSet["tags"][number]>; blocked: boolean;
  hasSubtasks: boolean; subsOpen: boolean; doneCount: number; totalCount: number;
  onToggleSubs: () => void; onEdit: () => void; onDelete: () => void; onAddSubtask: () => void; indent: number;
  dragging: boolean; dragOver: boolean;
  onDragStart: () => void; onDragOver: () => void; onDrop: () => void;
}) {
  const cardTags = (task.tags ?? []).slice(0, 4).map((id) => tagMap.get(id)).filter(Boolean);
  const who = task.assignees ?? [];
  const ownerLabel = who.length === 0 ? "—" : who.length === 1 ? who[0] : `${who.length} people`;

  return (
    <tr
      draggable={indent === 0}
      onDragStart={onDragStart}
      onDragOver={(e) => { e.preventDefault(); onDragOver(); }}
      onDrop={(e) => { e.preventDefault(); e.stopPropagation(); onDrop(); }}
      className={cn(
        "group border-b border-[var(--line)] hover:bg-[var(--paper-2)]",
        dragging && "opacity-40",
        dragOver && "border-t-2 border-t-primary",
      )}
    >
      <td className="w-10 pl-2">
        <div className="flex items-center gap-1">
          {indent === 0 ? (
            <>
              <GripVertical className="text-muted-foreground/30 size-3.5 shrink-0 cursor-grab opacity-0 group-hover:opacity-100" />
              {seq !== null && <span className="text-muted-foreground/60 w-4 shrink-0 font-mono text-[10px]">{seq}</span>}
            </>
          ) : (
            <span className="text-muted-foreground/40 pl-3 text-xs">↳</span>
          )}
          {hasSubtasks && (
            <button onClick={onToggleSubs} className="text-muted-foreground hover:text-foreground shrink-0">
              {subsOpen ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
            </button>
          )}
        </div>
      </td>
      <td className="py-2 pr-4">
        <div className={cn("flex items-center gap-1.5", indent > 0 && "text-xs")}>
          <span className="size-1.5 shrink-0 rounded-full" style={{ background: `var(${PRIO[task.priority]?.var ?? "--ink-ghost"})` }} />
          <span className="leading-snug">{task.title}</span>
          {(task.comments?.length ?? 0) > 0 && (
            <span className="text-muted-foreground/60 flex items-center gap-0.5 text-[11px]">
              <MessageSquare className="size-3" />{task.comments.length}
            </span>
          )}
          {hasSubtasks && (
            <span className="text-muted-foreground/70 font-mono text-[10px]">{doneCount}/{totalCount}</span>
          )}
          {blocked && <span title="Dependency block" className="text-[10px] font-bold text-[var(--t-red)]">⛔</span>}
          {indent === 0 && (
            <button onClick={onAddSubtask} title="Add subtask" className="text-muted-foreground hover:text-foreground opacity-0 transition group-hover:opacity-100">
              <Plus className="size-3" />
            </button>
          )}
        </div>
      </td>
      <td className="py-2 pr-2">
        <div className="flex flex-wrap gap-1">
          {cardTags.map((tg) => tg && <span key={tg.id} className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", accent(tg.color).soft)}>{tg.label}</span>)}
        </div>
      </td>
      <td className="text-muted-foreground py-2 pr-2 text-xs">{ownerLabel}</td>
      <td className="text-muted-foreground py-2 pr-2 font-mono text-xs">
        {task.start || task.end ? `${task.start ? fmtD(task.start) : "?"} → ${task.end ? fmtD(task.end) : "?"}` : "—"}
      </td>
      <td className="py-2 pr-2">
        <span className="flex items-center gap-1.5 text-xs font-medium">
          <span className="size-2 shrink-0 rounded-full" style={{ background: statusVar(task.status) }} />
          {COLUMNS.find((s) => s.id === task.status)?.label ?? task.status}
        </span>
      </td>
      <td className="py-2 pr-2">
        <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
          <button onClick={onEdit} className="text-muted-foreground hover:text-foreground"><Pencil className="size-3.5" /></button>
          <button onClick={onDelete} className="text-muted-foreground hover:text-[var(--t-red)]"><Trash2 className="size-3.5" /></button>
        </div>
      </td>
    </tr>
  );
}
