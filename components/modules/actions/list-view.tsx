"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Plus, Trash2, Pencil, ChevronRight, ChevronDown, MessageSquare, GripVertical, Flag,
  TriangleAlert,
} from "lucide-react";
import { useCreateEntity, useUpdateEntity, useDeleteEntity } from "@/lib/api/hooks";
import type { Task, WorkingSet, Milestone } from "@/lib/types";
import { depsOf, statusVar, fmtD, sequenceTasks, PRIO, COLUMNS } from "@/lib/tasks";
import { accent, accentVar, ACCENTS } from "@/lib/colors";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { COLLAPSE_STORAGE_KEY_PREFIX, OPEN_SUBS_STORAGE_KEY_PREFIX } from "@/components/modules/actions/shared";
import type { SortMode } from "@/components/modules/actions/shared";

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
  ws, projectId, filtered, hasActiveFilter, sort, onEdit, onEditMilestone,
}: {
  ws: WorkingSet; projectId: string; filtered: Task[]; hasActiveFilter: boolean; sort: SortMode;
  onEdit: (t: Task | null, defaultCategoryId?: string | null) => void;
  onEditMilestone: (m: Milestone | null, defaultCategoryId?: string | null) => void;
}) {
  const create = useCreateEntity(projectId, "tasks");
  const update = useUpdateEntity(projectId, "tasks");
  const del = useDeleteEntity(projectId, "tasks");
  const updateCat = useUpdateEntity(projectId, "categories");
  const createCat = useCreateEntity(projectId, "categories");

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => loadJSON(`${COLLAPSE_STORAGE_KEY_PREFIX}${projectId}`, {}));
  const [expandedSubs, setExpandedSubs] = useState<Record<string, boolean>>(() => loadJSON(`${OPEN_SUBS_STORAGE_KEY_PREFIX}${projectId}`, {}));
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const [dragOverRow, setDragOverRow] = useState<string | null>(null);
  const [editingTrack, setEditingTrack] = useState<string | null>(null);
  const [addingTrack, setAddingTrack] = useState(false);
  const [newTrackLabel, setNewTrackLabel] = useState("");

  function commitAddTrack() {
    const name = newTrackLabel.trim();
    if (!name) return;
    createCat.mutate(
      { label: name, color: ACCENTS[ws.categories.length % ACCENTS.length] },
      { onError: (e) => toast.error((e as Error).message) },
    );
    setNewTrackLabel("");
    setAddingTrack(false);
  }

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
    const byCat = new Map<string, Task[]>();
    const undefinedCategory: Task[] = [];
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

    // "Undefined track" only exists to surface legacy/imported tasks
    // without a track — it's not a valid drop target now that a track
    // is required.
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

  if (sort === "sequence") {
    return <SequenceList ws={ws} tasks={sequenced} onEdit={onEdit} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3.5">
        <Button onClick={() => setAddingTrack(true)}>
          <Plus className="size-4" /> Add track
        </Button>
        {addingTrack && (
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
              className="h-9 w-48 text-[14px]"
            />
            <Button variant="ghost" onClick={commitAddTrack} disabled={!newTrackLabel.trim()}>Add</Button>
          </div>
        )}
        <p className="text-muted-foreground text-[13.5px]">
          Drag tasks between tracks to re-bucket them · order top-to-bottom = sequence
        </p>
      </div>

      {groups.map((g) => {
        const isOpen = !(collapsed[g.key] ?? false);
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
        const isUndefined = g.key === "_none";

        return (
          <Collapsible key={g.key} open={isOpen} onOpenChange={() => toggleGroup(g.key)}>
            <div
              className={cn("flex items-center gap-2.5 rounded-[var(--radius-sm)] px-4 py-2.5", isUndefined && "border border-dashed border-[var(--t-red)]/40")}
              style={{ background: isUndefined ? "color-mix(in oklch, var(--t-red) 8%, var(--panel))" : a ? `color-mix(in oklch, ${accentVar(g.color)} 12%, var(--panel))` : "var(--paper-2)" }}
            >
              <CollapsibleTrigger asChild>
                <button className="flex flex-1 items-center gap-2.5 text-left">
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
              <div className="flex items-center gap-4">
                {!g.key.startsWith("_") && (
                  <button
                    className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-[13px] font-semibold opacity-80 hover:opacity-100"
                    onClick={() => onEditMilestone(null, g.key)}
                    title="Add gate / milestone"
                  >
                    <Flag className="size-4" /> Gate / milestone
                  </button>
                )}
                {!g.key.startsWith("_") && (
                  <button
                    className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-[13px] font-semibold opacity-80 hover:opacity-100"
                    onClick={() => onEdit(null, g.key)}
                    title="Add task to this track"
                  >
                    <Plus className="size-4" /> Add
                  </button>
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
                <div className="flex flex-wrap gap-2 px-3 pb-2 pt-2.5">
                  {groupMilestones.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => onEditMilestone(m)}
                      className="inline-flex items-center gap-2 rounded-full border bg-[var(--panel)] px-3 py-1.5 text-[13px] font-medium transition hover:border-[var(--line-strong)]"
                      style={{ color: a ? accentVar(g.color) : "var(--accent-deep)" }}
                    >
                      ◆ {m.title} <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--accent-deep)]">Milestone</span>
                      {m.date && <span className="text-muted-foreground font-mono">{fmtD(m.date)}</span>}
                    </button>
                  ))}
                </div>
              )}

              <table className="w-full text-[14.5px]">
                <thead>
                  <tr className="border-b text-left">
                    <th className="w-10 pb-2.5 pl-3"></th>
                    <th className="pb-2.5 font-mono text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Task</th>
                    <th className="w-32 pb-2.5 font-mono text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Tags</th>
                    <th className="w-32 pb-2.5 font-mono text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Owner</th>
                    <th className="w-40 pb-2.5 font-mono text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Dates</th>
                    <th className="w-32 pb-2.5 font-mono text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Status</th>
                    <th className="w-10 pb-2.5"></th>
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
                          onToggleSubs={() => toggleSubs(t.id)}
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
                      <td colSpan={7} className="pb-1.5 pl-12 pt-2">
                        <button onClick={() => onEdit(null, g.key)} className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-[13.5px]">
                          <Plus className="size-3.5" /> Add task
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

      {groups.length === 0 && (
        <p className="text-muted-foreground py-12 text-center text-sm">No tasks match the current filters.</p>
      )}
    </div>
  );
}

function tagMap(ws: WorkingSet) {
  return new Map(ws.tags.map((t) => [t.id, t]));
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
            <th className="w-10 pb-2.5 pl-4 pt-2.5 font-mono text-[11px] font-medium uppercase tracking-wide text-muted-foreground">#</th>
            <th className="pb-2.5 pt-2.5 font-mono text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Task</th>
            <th className="w-36 pb-2.5 pt-2.5 font-mono text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Track</th>
            <th className="w-56 pb-2.5 pt-2.5 font-mono text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Depends on</th>
            <th className="w-32 pb-2.5 pt-2.5 font-mono text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Owner</th>
            <th className="w-40 pb-2.5 pt-2.5 font-mono text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Dates</th>
            <th className="w-32 pb-2.5 pr-4 pt-2.5 font-mono text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Status</th>
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
                title={blocked ? "Dependency block" : undefined}
              >
                <td className="text-muted-foreground py-3 pl-4 font-mono text-[13px]">{i + 1}</td>
                <td className="py-3 pr-4">
                  <span className="flex items-center gap-2">
                    <span className="size-2 shrink-0 rounded-full" style={{ background: `var(${PRIO[t.priority]?.var ?? "--ink-ghost"})` }} />
                    <span className="size-2.5 shrink-0 rounded-full" style={{ background: statusVar(t.status) }} />
                    <span className="font-medium">{t.title}</span>
                    {blocked && <span className="text-[11px] font-bold text-[var(--t-red)]" title="Dependency block">⛔</span>}
                  </span>
                </td>
                <td className="py-3 pr-2">
                  {cat && (
                    <span className="rounded-full px-2.5 py-0.5 text-[11px] font-medium" style={{ background: `color-mix(in oklch, ${accentVar(cat.color)} 16%, var(--panel))`, color: accentVar(cat.color) }}>
                      {cat.label}
                    </span>
                  )}
                </td>
                <td className="py-3 pr-2">
                  {deps.length === 0 ? (
                    <span className="text-muted-foreground text-[13px]">—</span>
                  ) : (
                    <div className="flex flex-wrap gap-x-2.5 gap-y-1">
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
                <td className="text-muted-foreground py-3 pr-2 text-[13.5px]">
                  {who.length === 0 ? "—" : who.length === 1 ? who[0] : `${who.length} people`}
                </td>
                <td className="text-muted-foreground py-3 pr-2 font-mono text-[13px]">
                  {t.start || t.end ? `${t.start ? fmtD(t.start) : "?"} → ${t.end ? fmtD(t.end) : "?"}` : "—"}
                </td>
                <td className="py-3 pr-4">
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
      <td className="w-10 pl-3">
        <div className="flex items-center gap-1.5">
          {indent === 0 ? (
            <>
              <GripVertical className="text-muted-foreground/30 size-4 shrink-0 cursor-grab opacity-0 group-hover:opacity-100" />
              {seq !== null && <span className="text-muted-foreground/60 w-5 shrink-0 font-mono text-[11px]">{seq}</span>}
            </>
          ) : (
            <span className="text-muted-foreground/40 pl-3 text-sm">↳</span>
          )}
          {hasSubtasks && (
            <button onClick={onToggleSubs} className="text-muted-foreground hover:text-foreground shrink-0">
              {subsOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
            </button>
          )}
        </div>
      </td>
      <td className="py-3 pr-4">
        <div className={cn("flex items-center gap-2", indent > 0 && "text-[13.5px]")}>
          <span className="size-2 shrink-0 rounded-full" style={{ background: `var(${PRIO[task.priority]?.var ?? "--ink-ghost"})` }} />
          <span className="leading-snug font-medium">{task.title}</span>
          {(task.comments?.length ?? 0) > 0 && (
            <span className="text-muted-foreground/60 flex items-center gap-1 text-[12px]">
              <MessageSquare className="size-3.5" />{task.comments.length}
            </span>
          )}
          {hasSubtasks && (
            <span className="text-muted-foreground/70 font-mono text-[11px]">{doneCount}/{totalCount}</span>
          )}
          {blocked && <span title="Dependency block" className="text-[11px] font-bold text-[var(--t-red)]">⛔</span>}
          {indent === 0 && (
            <button onClick={onAddSubtask} title="Add subtask" className="text-muted-foreground hover:text-foreground opacity-0 transition group-hover:opacity-100">
              <Plus className="size-3.5" />
            </button>
          )}
        </div>
      </td>
      <td className="py-3 pr-2">
        <div className="flex flex-wrap gap-1.5">
          {cardTags.map((tg) => tg && <span key={tg.id} className={cn("rounded px-2 py-0.5 text-[11px] font-medium", accent(tg.color).soft)}>{tg.label}</span>)}
        </div>
      </td>
      <td className="text-muted-foreground py-3 pr-2 text-[13.5px]">{ownerLabel}</td>
      <td className="text-muted-foreground py-3 pr-2 font-mono text-[13px]">
        {task.start || task.end ? `${task.start ? fmtD(task.start) : "?"} → ${task.end ? fmtD(task.end) : "?"}` : "—"}
      </td>
      <td className="py-3 pr-2">
        <span className="flex items-center gap-2 text-[13.5px] font-medium">
          <span className="size-2.5 shrink-0 rounded-full" style={{ background: statusVar(task.status) }} />
          {COLUMNS.find((s) => s.id === task.status)?.label ?? task.status}
        </span>
      </td>
      <td className="py-3 pr-3">
        <div className="flex items-center gap-1.5 opacity-0 transition group-hover:opacity-100">
          <button onClick={onEdit} className="text-muted-foreground hover:text-foreground"><Pencil className="size-4" /></button>
          <button onClick={onDelete} className="text-muted-foreground hover:text-[var(--t-red)]"><Trash2 className="size-4" /></button>
        </div>
      </td>
    </tr>
  );
}
