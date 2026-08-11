"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { NotebookPen, Plus, Trash2, Search, X, Layers, ListTodo } from "lucide-react";
import { useProject, useCreateEntity, useUpdateEntity, useDeleteEntity } from "@/lib/api/hooks";
import type { Note, Task, WorkingSet } from "@/lib/types";
import { accentVar } from "@/lib/colors";
import { fmtD, TRACK_ICONS } from "@/lib/tasks";
import { cn } from "@/lib/utils";
import { ModuleHeader } from "@/components/project/ui";
import { GlossaryText } from "@/components/project/glossary-text";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useConfirm } from "@/components/project/confirm";

const GROUP_KEY = "atlas.notes.groupBy";

type GroupBy = "track" | "task" | "date";

const NO_TRACK = "__none";
const NO_TASK = "__none";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

/** A note's track: its own if set, otherwise inherited from its task, so a
 *  note tied to a task still files under that task's track. */
function trackOf(note: Note, taskById: Map<string, Task>): string | null {
  if (note.category) return note.category;
  if (note.taskId) return taskById.get(note.taskId)?.category ?? null;
  return null;
}

// ── editor ───────────────────────────────────────────────────────────────────

function NoteEditor({ ws, projectId, note, onDone }: {
  ws: WorkingSet; projectId: string; note: Note | null; onDone: () => void;
}) {
  const create = useCreateEntity(projectId, "notes");
  const update = useUpdateEntity(projectId, "notes");
  const [form, setForm] = useState({
    title: note?.title ?? "",
    body: note?.body ?? "",
    date: note?.date || todayStr(),
    category: note?.category ?? "",
    taskId: note?.taskId ?? "",
  });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const topLevel = ws.tasks.filter((t) => !t.parentId);

  function save() {
    const payload = {
      title: form.title.trim() || "Untitled note",
      body: form.body,
      date: form.date,
      category: form.category || null,
      taskId: form.taskId || null,
    };
    const onError = (e: unknown) => toast.error((e as Error).message);
    if (note) update.mutate({ id: note.id, data: payload }, { onError, onSuccess: onDone });
    else create.mutate(payload, { onError, onSuccess: onDone });
  }

  return (
    <div className="shadow-xs space-y-3 rounded-[var(--radius-lg)] border bg-[var(--panel)] p-4">
      <Input
        autoFocus
        value={form.title}
        onChange={(e) => set("title", e.target.value)}
        placeholder="Note title…"
        className="text-[15px] font-medium"
      />
      <Textarea
        value={form.body}
        onChange={(e) => set("body", e.target.value)}
        placeholder="Write it down…"
        rows={5}
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="space-y-1.5">
          <span className="text-muted-foreground font-mono text-[11px] font-semibold uppercase tracking-wide">Date</span>
          <Input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} className="h-9" />
        </label>
        <label className="space-y-1.5">
          <span className="text-muted-foreground font-mono text-[11px] font-semibold uppercase tracking-wide">Track</span>
          <select
            value={form.category}
            onChange={(e) => set("category", e.target.value)}
            className="focus:border-primary h-9 w-full rounded-[var(--radius-sm)] border bg-[var(--panel)] px-2 text-[13.5px] outline-none"
          >
            <option value="">No track</option>
            {ws.categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </label>
        <label className="space-y-1.5">
          <span className="text-muted-foreground font-mono text-[11px] font-semibold uppercase tracking-wide">Task</span>
          <select
            value={form.taskId}
            onChange={(e) => set("taskId", e.target.value)}
            className="focus:border-primary h-9 w-full rounded-[var(--radius-sm)] border bg-[var(--panel)] px-2 text-[13.5px] outline-none"
          >
            <option value="">No task</option>
            {topLevel.map((t) => (
              <option key={t.id} value={t.id}>{t.title || "Untitled task"}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={save} disabled={create.isPending || update.isPending}>
          {note ? "Save" : "Add note"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>Cancel</Button>
      </div>
    </div>
  );
}

// ── one note ─────────────────────────────────────────────────────────────────

function NoteCard({ ws, projectId, note, onEdit }: {
  ws: WorkingSet; projectId: string; note: Note; onEdit: () => void;
}) {
  const del = useDeleteEntity(projectId, "notes");
  const confirm = useConfirm();
  const cat = note.category ? ws.categories.find((c) => c.id === note.category) : null;
  const task = note.taskId ? ws.tasks.find((t) => t.id === note.taskId) : null;
  const catIcon = cat?.icon ? TRACK_ICONS[cat.icon] : null;

  return (
    <article
      onDoubleClick={onEdit}
      title="Double-click to edit"
      className="group shadow-xs rounded-[var(--radius-lg)] border bg-[var(--panel)] p-4 transition hover:shadow-md"
    >
      <header className="flex items-start justify-between gap-3">
        <h3 className="min-w-0 flex-1 font-serif-display text-[16px] font-medium leading-snug">
          {note.title || "Untitled note"}
        </h3>
        <div className="flex shrink-0 items-center gap-2">
          {note.date && (
            <span className="text-muted-foreground font-mono text-[11.5px]">{fmtD(note.date)}</span>
          )}
          <button
            onClick={async () => {
              if (await confirm({ title: `Delete “${note.title || "this note"}”?` })) {
                del.mutate(note.id, { onError: (e) => toast.error((e as Error).message) });
              }
            }}
            className="text-muted-foreground hover:text-[var(--t-red)] opacity-0 transition group-hover:opacity-100"
            title="Delete note"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </header>

      {note.body && (
        <p className="mt-2 whitespace-pre-wrap text-[13.5px] leading-relaxed">
          <GlossaryText
            text={note.body}
            terms={(ws.project.glossary as { id: string; term: string; definition: string }[]) ?? []}
          />
        </p>
      )}

      {(cat || task) && (
        <footer className="mt-3 flex flex-wrap items-center gap-1.5 border-t pt-2.5">
          {cat && (
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-mono text-[11px] font-medium"
              style={{
                background: `color-mix(in oklch, ${accentVar(cat.color)} 15%, var(--panel))`,
                color: accentVar(cat.color),
              }}
            >
              {catIcon && <catIcon.Icon className="size-3" />}
              {cat.label}
            </span>
          )}
          {task && (
            <span className="text-muted-foreground inline-flex items-center gap-1.5 rounded-full bg-[var(--paper-2)] px-2.5 py-0.5 text-[11.5px]">
              <ListTodo className="size-3" />
              <span className="max-w-[220px] truncate">{task.title || "Untitled task"}</span>
            </span>
          )}
        </footer>
      )}
    </article>
  );
}

// ── module ───────────────────────────────────────────────────────────────────

export function NotesModule({ projectId }: { projectId: string }) {
  const { data: ws } = useProject(projectId);
  const [groupBy, setGroupBy] = useState<GroupBy>(() => {
    if (typeof window === "undefined") return "track";
    try {
      const v = window.localStorage.getItem(GROUP_KEY);
      return v === "track" || v === "task" || v === "date" ? v : "track";
    } catch {
      return "track";
    }
  });
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  function changeGroupBy(v: GroupBy) {
    setGroupBy(v);
    try { window.localStorage.setItem(GROUP_KEY, v); } catch { /* best-effort */ }
  }

  const taskById = useMemo(
    () => new Map((ws?.tasks ?? []).map((t) => [t.id, t])),
    [ws],
  );

  const q = query.trim().toLowerCase();
  const notes = useMemo(() => {
    const all = ws?.notes ?? [];
    const matched = q
      ? all.filter((n) =>
          n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q))
      : all;
    // Newest first within any group.
    return [...matched].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  }, [ws, q]);

  // Group into sections according to the chosen dimension. Notes without the
  // relevant link fall into a trailing "unassigned" section rather than being
  // dropped, so nothing is ever invisible.
  const sections = useMemo(() => {
    if (!ws) return [];
    type Section = { key: string; label: string; color?: string; icon?: string | null; notes: Note[] };
    const out: Section[] = [];

    if (groupBy === "track") {
      const byTrack = new Map<string, Note[]>();
      notes.forEach((n) => {
        const key = trackOf(n, taskById) ?? NO_TRACK;
        byTrack.set(key, [...(byTrack.get(key) ?? []), n]);
      });
      ws.categories.forEach((c) => {
        const list = byTrack.get(c.id);
        if (list?.length) out.push({ key: c.id, label: c.label, color: c.color, icon: c.icon, notes: list });
      });
      const none = byTrack.get(NO_TRACK);
      if (none?.length) out.push({ key: NO_TRACK, label: "No track", notes: none });
      return out;
    }

    if (groupBy === "task") {
      const byTask = new Map<string, Note[]>();
      notes.forEach((n) => {
        const key = n.taskId && taskById.has(n.taskId) ? n.taskId : NO_TASK;
        byTask.set(key, [...(byTask.get(key) ?? []), n]);
      });
      ws.tasks.forEach((t) => {
        const list = byTask.get(t.id);
        if (list?.length) out.push({ key: t.id, label: t.title || "Untitled task", notes: list });
      });
      const none = byTask.get(NO_TASK);
      if (none?.length) out.push({ key: NO_TASK, label: "Not tied to a task", notes: none });
      return out;
    }

    // date — one section per day, newest first
    const byDate = new Map<string, Note[]>();
    notes.forEach((n) => {
      const key = n.date || "";
      byDate.set(key, [...(byDate.get(key) ?? []), n]);
    });
    [...byDate.keys()]
      .sort((a, b) => (b || "").localeCompare(a || ""))
      .forEach((d) => out.push({
        key: d || "__nodate",
        label: d ? fmtD(d) : "No date",
        notes: byDate.get(d)!,
      }));
    return out;
  }, [ws, notes, groupBy, taskById]);

  if (!ws) return null;

  const total = ws.notes.length;

  return (
    <div>
      <ModuleHeader eyebrow="Overview" title="Notes" />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search notes…"
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

          <div className="flex gap-1 rounded-[var(--radius-sm)] border bg-[var(--paper-2)] p-1">
            {([
              { id: "track" as const, label: "Track", Icon: Layers },
              { id: "task" as const, label: "Task", Icon: ListTodo },
              { id: "date" as const, label: "Date", Icon: NotebookPen },
            ]).map(({ id, label, Icon }) => (
              <button
                key={id}
                onClick={() => changeGroupBy(id)}
                className={cn(
                  "flex items-center gap-2 rounded-[6px] px-3 py-1.5 text-[13px] font-semibold transition",
                  groupBy === id ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-3.5" /> {label}
              </button>
            ))}
          </div>
        </div>

        <Button onClick={() => { setAdding(true); setEditingId(null); }}>
          <Plus className="size-4" /> New note
        </Button>
      </div>

      {adding && (
        <div className="mb-6">
          <NoteEditor ws={ws} projectId={projectId} note={null} onDone={() => setAdding(false)} />
        </div>
      )}

      {total === 0 && !adding ? (
        <div className="shadow-xs rounded-[var(--radius-lg)] border bg-[var(--panel)] p-12 text-center">
          <NotebookPen className="text-muted-foreground/40 mx-auto mb-3 size-7" />
          <p className="font-serif-display text-[17px] font-medium">No notes yet</p>
          <p className="text-muted-foreground mt-1 text-[13.5px]">
            Capture anything worth remembering and tie it to a track or a task.
          </p>
        </div>
      ) : sections.length === 0 ? (
        <p className="text-muted-foreground py-12 text-center text-[13.5px]">
          No notes match “{query}”.
        </p>
      ) : (
        <div className="space-y-8">
          {sections.map((s) => {
            const icon = s.icon ? TRACK_ICONS[s.icon] : null;
            return (
              <section key={s.key}>
                <header className="mb-3 flex items-center gap-2">
                  {icon
                    ? <icon.Icon className="size-3.5 shrink-0" style={{ color: s.color ? accentVar(s.color) : undefined }} />
                    : s.color
                      ? <span className="size-2 shrink-0 rounded-full" style={{ background: accentVar(s.color) }} />
                      : null}
                  <h2 className="font-mono text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-soft)]">
                    {s.label}
                  </h2>
                  <span className="text-muted-foreground/70 font-mono text-[11px]">{s.notes.length}</span>
                </header>
                <div className="grid gap-3 lg:grid-cols-2">
                  {s.notes.map((n) => (
                    editingId === n.id ? (
                      <NoteEditor
                        key={n.id} ws={ws} projectId={projectId} note={n}
                        onDone={() => setEditingId(null)}
                      />
                    ) : (
                      <NoteCard
                        key={n.id} ws={ws} projectId={projectId} note={n}
                        onEdit={() => { setEditingId(n.id); setAdding(false); }}
                      />
                    )
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
