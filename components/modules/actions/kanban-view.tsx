"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus, MessageSquare, Layers } from "lucide-react";
import { useCreateEntity, useUpdateEntity } from "@/lib/api/hooks";
import type { Task, WorkingSet } from "@/lib/types";
import { assigneesOf, depsOf, initials, COLUMNS, TRACK_ICONS, taskIdMap, subtaskDefaults, todayISO } from "@/lib/tasks";
import { cn } from "@/lib/utils";

function KCard({
  task, ws, projectId, seq, dragging, blocked, onOpen, onDragStart, onDragEnd,
}: {
  task: Task; ws: WorkingSet; projectId: string; seq: number | null; dragging: boolean; blocked: boolean;
  onOpen: (t: Task) => void; onDragStart: (e: React.DragEvent) => void; onDragEnd: () => void;
}) {
  const update = useUpdateEntity(projectId, "tasks");
  const create = useCreateEntity(projectId, "tasks");
  const kids = ws.tasks.filter((x) => x.parentId === task.id);
  const who = assigneesOf(task);
  const [addingSub, setAddingSub] = useState(false);
  const [subTitle, setSubTitle] = useState("");

  function commitAddSubtask() {
    const title = subTitle.trim();
    if (!title) { setAddingSub(false); setSubTitle(""); return; }
    create.mutate(
      { title, ...subtaskDefaults(task, todayISO()) },
      { onError: (e) => toast.error((e as Error).message) },
    );
    setSubTitle("");
  }

  const cat = task.category ? ws.categories.find((c) => c.id === task.category) : null;
  const trackIcon = cat?.icon ? TRACK_ICONS[cat.icon] : null;

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDoubleClick={() => onOpen(task)}
      title="Double-click to open"
      className={cn(
        "group shadow-xs relative cursor-grab rounded-[var(--radius-md)] border bg-[var(--panel)] p-4 transition hover:shadow-md hover:-translate-y-px",
        dragging && "opacity-40",
      )}
    >
      {seq !== null && (
        <span className="text-muted-foreground/40 absolute top-2.5 right-3 font-mono text-[10px]" title={`Task ID #${seq}`}>
          {seq}
        </span>
      )}
      {cat && (
        <div className="text-muted-foreground mb-1.5 flex items-center gap-1.5 text-[11.5px] font-medium">
          {trackIcon && <trackIcon.Icon className="size-3.5 shrink-0" />}
          <span className="truncate">{cat.label}</span>
        </div>
      )}
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 text-[16px] font-semibold leading-snug">{task.title}</p>
        {blocked && <span title="Dependency block" className="shrink-0 text-[var(--t-red)]">⛔</span>}
      </div>

      <div className="mt-3 flex items-center gap-2 border-t pt-3">
        {who.length === 0 ? (
          <span className="text-muted-foreground text-[13px]">Unassigned</span>
        ) : (
          <>
            <span className="flex -space-x-1.5">
              {who.slice(0, 3).map((n) => (
                <span key={n} title={n} className="bg-foreground text-background flex size-7 shrink-0 items-center justify-center rounded-full border-2 border-[var(--panel)] text-[11px] font-bold">
                  {initials(n)}
                </span>
              ))}
            </span>
            <span className="text-muted-foreground min-w-0 flex-1 truncate text-[13px]">{who.length === 1 ? who[0] : `${who.length} people`}</span>
          </>
        )}
      </div>

      {(kids.length > 0 || addingSub) && (
        <div className="mt-2.5 space-y-1 border-t pt-2.5">
          {kids.length > 0 && (
            <div className="text-muted-foreground/70 mb-1 flex items-center gap-1 font-mono text-[10.5px] font-semibold uppercase tracking-wide">
              <Layers className="size-3" /> {kids.filter((k) => k.status === "done").length}/{kids.length} subtasks
            </div>
          )}
          {kids.map((k) => (
            <div key={k.id} onClick={(e) => { e.stopPropagation(); onOpen(k); }} className="hover:bg-muted flex items-center gap-2 rounded px-1 py-1">
              <button
                onClick={(e) => { e.stopPropagation(); update.mutate({ id: k.id, data: { status: k.status === "done" ? "backlog" : "done" } }); }}
                className={cn("flex size-4 shrink-0 items-center justify-center rounded-full border", k.status === "done" ? "border-[var(--hue-done)] bg-[var(--hue-done)]" : "border-[var(--line-strong)]")}
              />
              <span className={cn("min-w-0 flex-1 truncate text-[13px]", k.status === "done" && "text-muted-foreground line-through")}>{k.title}</span>
              {assigneesOf(k).length > 0 && (
                <span className="bg-foreground text-background flex size-[18px] shrink-0 items-center justify-center rounded-full text-[9px] font-bold">
                  {initials(assigneesOf(k)[0])}
                </span>
              )}
            </div>
          ))}
          {addingSub && (
            <input
              autoFocus
              value={subTitle}
              onChange={(e) => setSubTitle(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === "Enter") { commitAddSubtask(); }
                if (e.key === "Escape") { setAddingSub(false); setSubTitle(""); }
              }}
              onBlur={() => { commitAddSubtask(); setAddingSub(false); }}
              placeholder="Subtask title…"
              className="w-full rounded border border-[var(--line-strong)] bg-[var(--panel)] px-1.5 py-1 text-[13px] outline-none focus:border-primary"
            />
          )}
        </div>
      )}
      <button
        onClick={(e) => { e.stopPropagation(); setAddingSub(true); }}
        className={cn(
          "text-muted-foreground/70 hover:text-foreground mt-1.5 flex items-center gap-1 text-[11.5px] opacity-0 transition group-hover:opacity-100",
          addingSub && "hidden",
        )}
      >
        <Plus className="size-3" /> Add subtask
      </button>

      {(task.comments?.length ?? 0) > 0 && (
        <div className="text-muted-foreground mt-2.5 flex items-center gap-1.5 border-t pt-2.5 text-[13px]">
          <MessageSquare className="size-3.5" /> {task.comments.length}
        </div>
      )}
    </div>
  );
}

export function KanbanView({
  ws, projectId, filtered, onOpen, onNew,
}: {
  ws: WorkingSet; projectId: string; filtered: Task[]; onOpen: (t: Task) => void; onNew: (status: string) => void;
}) {
  const update = useUpdateEntity(projectId, "tasks");
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);

  const seqByTaskId = taskIdMap(ws.tasks);
  const visibleIds = new Set(filtered.map((t) => t.id));
  const columns = COLUMNS.map((c) => ({
    ...c,
    tasks: filtered.filter((t) => t.status === c.id && !(t.parentId && visibleIds.has(t.parentId))),
  }));

  function drop(status: string) {
    setOverCol(null);
    if (!dragId) return;
    const task = ws.tasks.find((t) => t.id === dragId);
    setDragId(null);
    if (!task || task.status === status) return;
    update.mutate({ id: task.id, data: { status } }, { onError: (e) => toast.error((e as Error).message) });
  }

  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
      {columns.map((col) => (
        <div
          key={col.id}
          onDragOver={(e) => { e.preventDefault(); setOverCol(col.id); }}
          onDragLeave={(e) => { if (e.currentTarget === e.target) setOverCol(null); }}
          onDrop={() => drop(col.id)}
          className={cn("flex min-h-[220px] flex-col rounded-[var(--radius-lg)] border p-3.5 transition", overCol === col.id ? "border-primary/40 bg-primary/5" : "bg-[var(--paper-2)]")}
        >
          <div className="flex items-center gap-2.5 px-2 py-2.5">
            <h3 className="font-serif-display text-[19px] font-medium tracking-tight">{col.label}</h3>
            <span className="text-muted-foreground ml-auto font-mono text-[13px]">{col.tasks.length}</span>
          </div>
          <div className="flex flex-1 flex-col gap-2.5 px-0.5 pb-1">
            {col.tasks.map((t) => {
              const deps = depsOf(t, { tasks: ws.tasks, products: ws.products, externals: ws.externals });
              const blocked = deps.some((d) => d.violated);
              return (
                <KCard
                  key={t.id} task={t} ws={ws} projectId={projectId} seq={seqByTaskId.get(t.id) ?? null} dragging={dragId === t.id} blocked={blocked}
                  onOpen={onOpen}
                  onDragStart={(e) => { setDragId(t.id); e.dataTransfer.effectAllowed = "move"; }}
                  onDragEnd={() => { setDragId(null); setOverCol(null); }}
                />
              );
            })}
            <button
              onClick={() => onNew(col.id)}
              className="flex items-center justify-center gap-2 rounded-[var(--radius-md)] border-[1.5px] border-dashed border-[var(--line-strong)] py-3 text-[14px] font-semibold text-muted-foreground transition hover:border-primary/40 hover:bg-[var(--panel)] hover:text-primary"
            >
              <Plus className="size-4" /> Add task
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
