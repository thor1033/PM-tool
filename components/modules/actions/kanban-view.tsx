"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import { Plus, X, Search, SlidersHorizontal, MessageSquare, Layers } from "lucide-react";
import { useUpdateEntity } from "@/lib/api/hooks";
import type { Task, WorkingSet } from "@/lib/types";
import { assigneesOf, depsOf, initials, PRIO, COLUMNS } from "@/lib/tasks";
import { accent, accentVar } from "@/lib/colors";
import { cn } from "@/lib/utils";

interface KanbanFilters {
  q: string;
  tags: string[];
  phase: string[];
  cat: string[];
  who: string[];
}

const EMPTY_FILTERS: KanbanFilters = { q: "", tags: [], phase: [], cat: [], who: [] };

function FilterPopover({ ws, f, setF }: { ws: WorkingSet; f: KanbanFilters; setF: (f: KanbanFilters) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function h(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const n = f.phase.length + f.cat.length + f.who.length;
  const toggle = (arr: string[], key: "phase" | "cat" | "who", id: string) =>
    setF({ ...f, [key]: arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id] });

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-sm)] border px-3 text-[13px] font-semibold transition",
          n > 0 ? "bg-foreground text-background border-foreground" : "text-muted-foreground hover:text-foreground",
        )}
      >
        <SlidersHorizontal className="size-4" /> Filter{n ? ` · ${n}` : ""}
      </button>
      {open && (
        <div className="bg-popover absolute right-0 z-20 mt-1.5 w-64 rounded-[var(--radius-md)] border p-3.5 shadow-lg">
          <p className="eyebrow mb-2">Assigned to</p>
          <div className="mb-4 flex flex-wrap gap-1.5">
            {ws.members.map((m) => (
              <button key={m.id} onClick={() => toggle(f.who, "who", m.name)}
                className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium transition", f.who.includes(m.name) ? "bg-foreground text-background border-foreground" : "hover:bg-muted")}>
                <span className="size-1.5 rounded-full" style={{ background: accentVar(m.color) }} />{m.name}
              </button>
            ))}
            <button onClick={() => toggle(f.who, "who", "__unassigned")}
              className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium transition", f.who.includes("__unassigned") ? "bg-foreground text-background border-foreground" : "hover:bg-muted")}>
              <span className="bg-ink-ghost size-1.5 rounded-full" />Unassigned
            </button>
            {ws.members.length === 0 && <span className="text-muted-foreground text-xs">No members yet</span>}
          </div>
          <p className="eyebrow mb-2">Phase</p>
          <div className="mb-4 flex flex-wrap gap-1.5">
            {ws.phases.map((p) => (
              <button key={p.id} onClick={() => toggle(f.phase, "phase", p.id)}
                className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium transition", f.phase.includes(p.id) ? "bg-foreground text-background border-foreground" : "hover:bg-muted")}>
                <span className="size-1.5 rounded-full" style={{ background: accentVar(p.color) }} />{p.label}
              </button>
            ))}
          </div>
          <p className="eyebrow mb-2">Track</p>
          <div className="flex flex-wrap gap-1.5">
            {ws.categories.map((c) => (
              <button key={c.id} onClick={() => toggle(f.cat, "cat", c.id)}
                className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium transition", f.cat.includes(c.id) ? "bg-foreground text-background border-foreground" : "hover:bg-muted")}>
                <span className="size-1.5 rounded-full" style={{ background: accentVar(c.color) }} />{c.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function KCard({
  task, ws, projectId, dragging, blocked, onOpen, onDragStart, onDragEnd,
}: {
  task: Task; ws: WorkingSet; projectId: string; dragging: boolean; blocked: boolean;
  onOpen: (t: Task) => void; onDragStart: (e: React.DragEvent) => void; onDragEnd: () => void;
}) {
  const update = useUpdateEntity(projectId, "tasks");
  const tagMap = new Map(ws.tags.map((t) => [t.id, t]));
  const kids = ws.tasks.filter((x) => x.parentId === task.id);
  const cardTags = (task.tags ?? []).map((id) => tagMap.get(id)).filter(Boolean);
  const who = assigneesOf(task);

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDoubleClick={() => onOpen(task)}
      title="Double-click to open"
      className={cn(
        "shadow-xs cursor-grab rounded-[var(--radius-md)] border-l-[4px] bg-[var(--panel)] p-4 transition hover:shadow-md hover:-translate-y-px",
        dragging && "opacity-40",
      )}
      style={{ borderLeftColor: `var(${PRIO[task.priority]?.var ?? "--line-strong"})` }}
    >
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 text-[16px] font-semibold leading-snug">{task.title}</p>
        {blocked && <span title="Dependency block" className="shrink-0 text-[var(--t-red)]">⛔</span>}
      </div>

      {cardTags.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {cardTags.map((tg) => tg && (
            <span key={tg.id} className={cn("inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium", accent(tg.color).soft)}>
              <span className="size-1.5 rounded-full" style={{ background: accentVar(tg.color) }} />{tg.label}
            </span>
          ))}
        </div>
      )}

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
        <span className="ml-auto font-mono text-[11px] font-semibold uppercase tracking-wide" style={{ color: `var(${PRIO[task.priority]?.var ?? "--ink-faint"})` }}>
          {PRIO[task.priority]?.label}
        </span>
      </div>

      {kids.length > 0 && (
        <div className="mt-2.5 space-y-1 border-t pt-2.5">
          <div className="text-muted-foreground/70 mb-1 flex items-center gap-1 font-mono text-[10.5px] font-semibold uppercase tracking-wide">
            <Layers className="size-3" /> {kids.filter((k) => k.status === "done").length}/{kids.length} subtasks
          </div>
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
        </div>
      )}

      {(task.comments?.length ?? 0) > 0 && (
        <div className="text-muted-foreground mt-2.5 flex items-center gap-1.5 border-t pt-2.5 text-[13px]">
          <MessageSquare className="size-3.5" /> {task.comments.length}
        </div>
      )}
    </div>
  );
}

export function KanbanView({
  ws, projectId, onOpen, onNew,
}: {
  ws: WorkingSet; projectId: string; onOpen: (t: Task) => void; onNew: (status: string) => void;
}) {
  const update = useUpdateEntity(projectId, "tasks");
  const [f, setF] = useState<KanbanFilters>(EMPTY_FILTERS);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return ws.tasks.filter((t) => {
      if (f.q) {
        const q = f.q.toLowerCase();
        if (!(t.title + " " + t.description + " " + assigneesOf(t).join(" ")).toLowerCase().includes(q)) return false;
      }
      if (f.tags.length && !f.tags.every((id) => (t.tags ?? []).includes(id))) return false;
      if (f.phase.length && !(t.phase && f.phase.includes(t.phase))) return false;
      if (f.cat.length && !(t.category && f.cat.includes(t.category))) return false;
      if (f.who.length) {
        const who = assigneesOf(t);
        if (!f.who.some((w) => (w === "__unassigned" ? who.length === 0 : who.includes(w)))) return false;
      }
      return true;
    });
  }, [ws.tasks, f]);

  const anyFilter = f.q || f.tags.length || f.phase.length || f.cat.length || f.who.length;
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
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="focus-within:border-primary focus-within:ring-primary/20 flex h-10 w-64 items-center gap-2 rounded-[var(--radius-sm)] border bg-[var(--panel)] px-3 transition focus-within:ring-2">
          <Search className="text-muted-foreground size-4 shrink-0" />
          <input value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder="Search tasks…" className="min-w-0 flex-1 bg-transparent text-[14px] outline-none" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {ws.tags.map((tg) => (
            <button
              key={tg.id}
              onClick={() => setF({ ...f, tags: f.tags.includes(tg.id) ? f.tags.filter((x) => x !== tg.id) : [...f.tags, tg.id] })}
              className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[12px] font-medium transition", f.tags.includes(tg.id) ? "bg-foreground text-background border-foreground" : "hover:bg-muted")}
            >
              <span className="size-1.5 rounded-full" style={{ background: accentVar(tg.color) }} />{tg.label}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        {anyFilter && (
          <button onClick={() => setF(EMPTY_FILTERS)} className="text-muted-foreground hover:text-foreground inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-sm)] px-2.5 text-[13px] font-medium transition">
            <X className="size-3.5" /> Clear
          </button>
        )}
        <FilterPopover ws={ws} f={f} setF={setF} />
      </div>

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
              <span className="size-3 shrink-0 rounded-full" style={{ background: `var(${col.var})` }} />
              <h3 className="font-serif-display text-[19px] font-medium tracking-tight">{col.label}</h3>
              <span className="text-muted-foreground ml-auto font-mono text-[13px]">{col.tasks.length}</span>
            </div>
            <div className="flex flex-1 flex-col gap-2.5 px-0.5 pb-1">
              {col.tasks.map((t) => {
                const deps = depsOf(t, { tasks: ws.tasks, products: ws.products, externals: ws.externals });
                const blocked = deps.some((d) => d.violated);
                return (
                  <KCard
                    key={t.id} task={t} ws={ws} projectId={projectId} dragging={dragId === t.id} blocked={blocked}
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
    </div>
  );
}
