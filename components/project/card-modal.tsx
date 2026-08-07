"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Plus, X, Trash2, MessageSquare, TriangleAlert, Link2, Target, Package, GitBranch,
} from "lucide-react";
import {
  useCreateEntity, useUpdateEntity, useDeleteEntity,
} from "@/lib/api/hooks";
import { resolveDep, wouldConflict, initials, followupChainOf, type ResolvedDep } from "@/lib/tasks";
import type { Task, WorkingSet } from "@/lib/types";
import type { TaskComment, TaskDep } from "@/lib/db/schema";
import { accentVar, ACCENTS } from "@/lib/colors";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// ── status segmented control ────────────────────────────────────────────────

const STATUSES = [
  { id: "backlog", label: "Backlog", var: "--hue-backlog" },
  { id: "inprogress", label: "In Progress", var: "--hue-progress" },
  { id: "done", label: "Done", var: "--hue-done" },
];

function StatusSeg({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-1 rounded-[var(--radius-sm)] border bg-[var(--paper-2)] p-1">
      {STATUSES.map((s) => (
        <button
          key={s.id}
          type="button"
          onClick={() => onChange(s.id)}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-[6px] px-2 py-1.5 text-xs font-semibold transition",
            value === s.id ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <span className="size-1.5 rounded-full" style={{ background: value === s.id ? "currentColor" : `var(${s.var})` }} />
          {s.label}
        </button>
      ))}
    </div>
  );
}

// ── dependency editor ────────────────────────────────────────────────────────

function DepRow({ r, onRemove }: { r: ResolvedDep; onRemove: () => void }) {
  const Icon = r.icon === "task" ? Target : r.icon === "deliverable" ? Package : Link2;
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-[var(--radius-sm)] border px-2.5 py-1.5",
        r.violated
          ? "border-[color-mix(in_oklch,var(--t-red)_45%,transparent)] bg-[color-mix(in_oklch,var(--t-red)_5%,var(--paper-2))]"
          : "bg-[var(--paper-2)]",
        r.external && "border-dashed",
      )}
    >
      <span className={cn("shrink-0", r.violated ? "text-[var(--t-red)]" : "text-muted-foreground")}>
        <Icon className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold">{r.name}</p>
        <p className="text-muted-foreground text-[10.5px]">
          {r.scope}
          {r.due ? ` · due ${r.due}` : ""}
        </p>
      </div>
      {r.violated && (
        <span className="shrink-0 text-[10px] font-bold text-[var(--t-red)]" title="Needs output from this before it can start">
          Blocked
        </span>
      )}
      <button type="button" onClick={onRemove} className="text-muted-foreground hover:text-[var(--t-red)] shrink-0">
        <X className="size-3.5" />
      </button>
    </div>
  );
}

function DepEditor({
  task, ws, projectId, deps, onChange,
}: {
  task: Task | null; ws: WorkingSet; projectId: string; deps: TaskDep[]; onChange: (next: TaskDep[]) => void;
}) {
  const updateProduct = useUpdateEntity(projectId, "products");
  const [open, setOpen] = useState<"task" | "deliverable" | "ext" | "external" | null>(null);
  const [extLabel, setExtLabel] = useState("");
  const [extScope, setExtScope] = useState("");

  const otherTasks = ws.tasks.filter(
    (t) => t.id !== task?.id && !deps.some((d) => d.type === "task" && d.refId === t.id),
  );
  const freeProducts = ws.products.filter((p) => !deps.some((d) => d.type === "deliverable" && d.refId === p.id));
  const freeExternals = ws.externals.filter((e) => !deps.some((d) => d.type === "ext" && d.refId === e.id));

  // Keep product.taskIds in sync — the catalogue reads that reverse index
  // directly rather than scanning every task's deps.
  function syncProductLink(productId: string, linked: boolean) {
    if (!task) return;
    const p = ws.products.find((x) => x.id === productId);
    if (!p) return;
    const ids = p.taskIds ?? [];
    const next = linked ? [...new Set([...ids, task.id])] : ids.filter((id) => id !== task.id);
    updateProduct.mutate({ id: productId, data: { taskIds: next } });
  }

  function addDep(partial: Omit<TaskDep, "id">) {
    onChange([...deps, { id: `d_${Math.random().toString(36).slice(2, 9)}`, ...partial }]);
    if (partial.type === "deliverable" && partial.refId) syncProductLink(partial.refId, true);
    setOpen(null);
  }
  function removeDep(id: string) {
    const removed = deps.find((d) => d.id === id);
    onChange(deps.filter((d) => d.id !== id));
    if (removed?.type === "deliverable" && removed.refId) syncProductLink(removed.refId, false);
  }

  const resolved = deps.map((d) => resolveDep(d, task ?? { start: "" }, { tasks: ws.tasks, products: ws.products, externals: ws.externals }));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="mb-0">Depends on</Label>
        <div className="relative">
          <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => setOpen(open ? null : "task")}>
            <Plus className="size-3" /> Add
          </Button>
          {open && (
            <div className="bg-popover absolute right-0 z-20 mt-1 w-80 rounded-[var(--radius-md)] border p-2 shadow-lg">
              <div className="mb-2 flex gap-1 rounded-[var(--radius-sm)] border bg-[var(--paper-2)] p-1">
                {(["task", "deliverable", "ext", "external"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setOpen(k)}
                    className={cn(
                      "flex-1 rounded-[6px] px-1.5 py-1 text-[10.5px] font-semibold transition",
                      open === k ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {k === "task" ? "Task" : k === "deliverable" ? "Deliverable" : k === "ext" ? "External" : "Free-text"}
                  </button>
                ))}
              </div>

              {open === "task" && (
                <div className="max-h-48 overflow-y-auto">
                  {otherTasks.length === 0 && <p className="text-muted-foreground px-1 py-2 text-xs">No other tasks</p>}
                  {otherTasks.map((t) => {
                    const conflict = task ? wouldConflict(task, t) : false;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => addDep({ type: "task", refId: t.id })}
                        className="hover:bg-muted flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-xs"
                      >
                        <span className="min-w-0 flex-1 truncate">{t.title}</span>
                        {conflict && <span title="Would start before this task ends" className="shrink-0 text-[10px] text-[var(--t-amber)]">⚠</span>}
                      </button>
                    );
                  })}
                </div>
              )}

              {open === "deliverable" && (
                <div className="max-h-48 overflow-y-auto">
                  {freeProducts.length === 0 && <p className="text-muted-foreground px-1 py-2 text-xs">No deliverables yet</p>}
                  {freeProducts.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => addDep({ type: "deliverable", refId: p.id })}
                      className="hover:bg-muted flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-xs"
                    >
                      <Package className="text-muted-foreground size-3 shrink-0" />
                      <span className="min-w-0 flex-1 truncate">{p.name}</span>
                    </button>
                  ))}
                </div>
              )}

              {open === "ext" && (
                <div className="max-h-48 overflow-y-auto">
                  {freeExternals.length === 0 && <p className="text-muted-foreground px-1 py-2 text-xs">No registered external inputs yet — add one from Actions &rsaquo; Externals, or use "Free-text" here.</p>}
                  {freeExternals.map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => addDep({ type: "ext", refId: e.id })}
                      className="hover:bg-muted flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-xs"
                    >
                      <Link2 className="text-muted-foreground size-3 shrink-0" />
                      <span className="min-w-0 flex-1 truncate">{e.title}</span>
                      <span className="text-muted-foreground shrink-0 text-[10px]">{e.status}</span>
                    </button>
                  ))}
                </div>
              )}

              {open === "external" && (
                <div className="space-y-1.5 px-1 pb-1">
                  <Input placeholder="What's needed…" value={extLabel} onChange={(e) => setExtLabel(e.target.value)} className="h-7 text-xs" />
                  <Input placeholder="Owner / scope (optional)" value={extScope} onChange={(e) => setExtScope(e.target.value)} className="h-7 text-xs" />
                  <Button
                    type="button" size="sm" className="h-7 w-full text-xs"
                    disabled={!extLabel.trim()}
                    onClick={() => { addDep({ type: "external", label: extLabel.trim(), scope: extScope.trim() }); setExtLabel(""); setExtScope(""); }}
                  >
                    Add
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {resolved.length === 0 && <p className="text-muted-foreground text-xs">No dependencies — this task can start any time.</p>}
      <div className="space-y-1.5">
        {resolved.map((r) => <DepRow key={r.id} r={r} onRemove={() => removeDep(r.id)} />)}
      </div>

      {resolved.some((r) => r.violated) && (
        <div className="flex items-start gap-2 rounded-[var(--radius-sm)] border border-[color-mix(in_oklch,var(--t-red)_35%,transparent)] bg-[color-mix(in_oklch,var(--t-red)_7%,transparent)] px-3 py-2 text-[12.5px] leading-snug text-[var(--t-red)]">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
          <span>
            Dependency block — needs {resolved.filter((r) => r.violated).map((r) => `"${r.name}"`).join(", ")} first.
            This task is scheduled to start before {resolved.filter((r) => r.violated).length === 1 ? "it's" : "they're"} ready.
          </span>
        </div>
      )}
    </div>
  );
}

// ── risk linker ──────────────────────────────────────────────────────────────

function RiskLinker({
  task, ws, projectId,
}: {
  task: Task; ws: WorkingSet; projectId: string;
}) {
  const updateRisk = useUpdateEntity(projectId, "risks");
  const [open, setOpen] = useState(false);

  const linked = ws.risks.filter((r) => (r.taskIds ?? []).includes(task.id));
  const unlinked = ws.risks.filter((r) => !(r.taskIds ?? []).includes(task.id));

  function link(riskId: string) {
    const r = ws.risks.find((x) => x.id === riskId);
    if (!r) return;
    updateRisk.mutate({ id: riskId, data: { taskIds: [...(r.taskIds ?? []), task.id] } });
    setOpen(false);
  }
  function unlink(riskId: string) {
    const r = ws.risks.find((x) => x.id === riskId);
    if (!r) return;
    updateRisk.mutate({ id: riskId, data: { taskIds: (r.taskIds ?? []).filter((id) => id !== task.id) } });
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="mb-0">Risks this remediates</Label>
        <div className="relative">
          <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => setOpen((o) => !o)} disabled={unlinked.length === 0}>
            <Plus className="size-3" /> Link
          </Button>
          {open && (
            <div className="bg-popover absolute right-0 z-20 mt-1 w-64 rounded-[var(--radius-md)] border p-2 shadow-lg">
              <div className="max-h-48 overflow-y-auto">
                {unlinked.map((r) => (
                  <button key={r.id} type="button" onClick={() => link(r.id)} className="hover:bg-muted flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-xs">
                    <TriangleAlert className="size-3 shrink-0 text-[var(--t-amber)]" />
                    <span className="min-w-0 flex-1 truncate">{r.title}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      {linked.length === 0 && <p className="text-muted-foreground text-xs">No risks linked.</p>}
      <div className="space-y-1.5">
        {linked.map((r) => (
          <div key={r.id} className="flex items-center gap-2 rounded-[var(--radius-sm)] bg-[var(--paper-2)] px-2.5 py-1.5">
            <TriangleAlert className="size-3.5 shrink-0 text-[var(--t-amber)]" />
            <span className="min-w-0 flex-1 truncate text-xs font-semibold">{r.title}</span>
            <button type="button" onClick={() => unlink(r.id)} className="text-muted-foreground hover:text-[var(--t-red)] shrink-0">
              <X className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── "create a track first" gate ─────────────────────────────────────────────
// Every task must belong to a track. If a project has none yet, task
// creation is blocked here until one exists — the modal reopens the normal
// form immediately afterward.

function CreateTrackPrompt({
  projectId, onCreated,
}: {
  projectId: string; onCreated: (categoryId: string) => void;
}) {
  const createCat = useCreateEntity(projectId, "categories");
  const [label, setLabel] = useState("");
  const [color, setColor] = useState(ACCENTS[0]);

  function submit() {
    const name = label.trim();
    if (!name) return;
    createCat.mutate(
      { label: name, color },
      {
        onSuccess: (row) => onCreated((row as { id: string }).id),
        onError: (e) => toast.error((e as Error).message),
      },
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-semibold">This project has no tracks yet</p>
        <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
          Every task belongs to a track — create the first one to continue.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label>Track name</Label>
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          placeholder="e.g. Discovery, Build, Launch"
          autoFocus
        />
      </div>
      <div className="space-y-1.5">
        <Label>Color</Label>
        <div className="flex flex-wrap gap-1.5">
          {ACCENTS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              title={c}
              className={cn(
                "size-6 rounded-full border-2 transition",
                color === c ? "border-foreground" : "border-transparent",
              )}
              style={{ background: accentVar(c) }}
            />
          ))}
        </div>
      </div>
      <Button onClick={submit} disabled={!label.trim() || createCat.isPending} className="w-full">
        Create track & continue
      </Button>
    </div>
  );
}

// ── main card modal ──────────────────────────────────────────────────────────

export function CardModal({
  ws, projectId, task, defaultCategoryId, defaultStatus, open, onOpenChange,
}: {
  ws: WorkingSet; projectId: string; task: Task | null;
  defaultCategoryId?: string | null; defaultStatus?: string;
  open: boolean; onOpenChange: (v: boolean) => void;
}) {
  const create = useCreateEntity(projectId, "tasks");
  const update = useUpdateEntity(projectId, "tasks");
  const del = useDeleteEntity(projectId, "tasks");

  // Which task this modal instance is actually showing — starts as the
  // `task` prop, but "+ Follow-up" and clicking a chain node swap this
  // in-place (no close/reopen) once a followup has been created and the
  // parent's working-set cache has the new row.
  const [activeTaskId, setActiveTaskId] = useState<string | null>(task?.id ?? null);
  const activeTask = activeTaskId ? ws.tasks.find((t) => t.id === activeTaskId) ?? task : task;

  const [form, setForm] = useState(() => ({
    title: activeTask?.title ?? "",
    description: activeTask?.description ?? "",
    occurrence: (activeTask?.custom as Record<string, unknown> | undefined)?.occurrence as string ?? "",
    status: activeTask?.status ?? defaultStatus ?? "backlog",
    priority: activeTask?.priority ?? "med",
    category: activeTask?.category ?? defaultCategoryId ?? ws.categories[0]?.id ?? "none",
    assignees: (activeTask?.assignees ?? []).join(", "),
    start: activeTask?.start ?? "",
    end: activeTask?.end ?? "",
    deps: activeTask?.deps ?? ([] as TaskDep[]),
  }));
  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  // Re-sync the form whenever the modal swaps to a different task in-place.
  useEffect(() => {
    setForm({
      title: activeTask?.title ?? "",
      description: activeTask?.description ?? "",
      occurrence: (activeTask?.custom as Record<string, unknown> | undefined)?.occurrence as string ?? "",
      status: activeTask?.status ?? defaultStatus ?? "backlog",
      priority: activeTask?.priority ?? "med",
      category: activeTask?.category ?? defaultCategoryId ?? ws.categories[0]?.id ?? "none",
      assignees: (activeTask?.assignees ?? []).join(", "),
      start: activeTask?.start ?? "",
      end: activeTask?.end ?? "",
      deps: activeTask?.deps ?? ([] as TaskDep[]),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTaskId]);

  const [commentText, setCommentText] = useState("");
  const [commentAuthor, setCommentAuthor] = useState(() => ws.members[0]?.name ?? "");

  function createFollowup() {
    if (!activeTask) return;
    create.mutate(
      {
        title: "",
        description: `Follow-up task from ${activeTask.title || "Untitled task"}`,
        status: "inprogress", priority: "med",
        category: activeTask.category, origin: null,
        parentId: null, assignees: [...(activeTask.assignees ?? [])], tags: [],
        // Starts where the originating task ends — end is left for the user
        // to set once the follow-up's own scope is known.
        start: activeTask.end ?? "", end: "",
        // No risks/dependencies/comments carried over — those belong to the
        // task that generated them, not the new one.
        deps: [{ id: `d_${Math.random().toString(36).slice(2, 9)}`, type: "followup", refId: activeTask.id }],
        comments: [], custom: {},
      },
      {
        onSuccess: (row) => setActiveTaskId((row as { id: string }).id),
        onError: (e) => toast.error((e as Error).message),
      },
    );
  }

  function addComment() {
    if (!activeTask || !commentText.trim()) return;
    const comment: TaskComment = {
      id: `c_${Math.random().toString(36).slice(2, 9)}`,
      author: commentAuthor || "Anonymous",
      text: commentText.trim(),
      ts: Date.now(),
    };
    update.mutate(
      { id: activeTask.id, data: { comments: [...(activeTask.comments ?? []), comment] } },
      { onError: (e) => toast.error((e as Error).message) },
    );
    setCommentText("");
  }

  function save() {
    if (form.category === "none") {
      toast.error("Every task needs a track.");
      return;
    }
    const payload = {
      title: form.title.trim() || "Untitled task",
      description: form.description,
      status: form.status,
      priority: form.priority,
      category: form.category,
      // Phase/Tags aren't editable from this form anymore — pass through
      // whatever the task already had so save doesn't wipe them.
      phase: activeTask?.phase ?? null,
      assignees: form.assignees.split(",").map((s) => s.trim()).filter(Boolean),
      start: form.start, end: form.end, tags: activeTask?.tags ?? [], deps: form.deps,
      comments: activeTask?.comments ?? [],
      custom: (() => {
        const next = { ...(activeTask?.custom as Record<string, unknown> ?? {}) };
        if (form.occurrence.trim()) next.occurrence = form.occurrence.trim();
        else delete next.occurrence;
        return next;
      })(),
    };
    const onError = (e: unknown) => toast.error((e as Error).message);
    if (activeTask) update.mutate({ id: activeTask.id, data: payload }, { onError });
    else create.mutate(payload, { onError });
    onOpenChange(false);
  }

  function remove() {
    if (!activeTask) return;
    if (!confirm(`Delete "${activeTask.title}"?`)) return;
    del.mutate(activeTask.id, { onError: (e) => toast.error((e as Error).message) });
    onOpenChange(false);
  }

  // Every task must belong to a track. New tasks in a project with no
  // tracks yet are blocked here until one is created.
  if (!activeTask && ws.categories.length === 0) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle className="font-serif-display font-medium">New task</DialogTitle></DialogHeader>
          <CreateTrackPrompt projectId={projectId} onCreated={(categoryId) => set("category", categoryId)} />
        </DialogContent>
      </Dialog>
    );
  }

  const chain = activeTask ? followupChainOf(activeTask, ws.tasks) : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[85dvh] max-h-[1050px] w-[90vw] max-w-[1400px] sm:max-w-[1400px] flex-col overflow-hidden p-0">
        <DialogHeader className="flex-row items-center justify-between border-b px-6 py-4 space-y-0">
          <DialogTitle className="font-serif-display font-medium">{activeTask ? "Edit task" : "New task"}</DialogTitle>
          {activeTask && (
            <Button
              variant="outline" size="sm" className="mr-8"
              onClick={createFollowup}
              disabled={create.isPending}
              title="Create a new task linked back to this one"
            >
              <GitBranch className="size-3.5" /> Follow-up
            </Button>
          )}
        </DialogHeader>

        <div className="grid min-h-0 flex-1 grid-cols-2 divide-x overflow-hidden">
          {/* Left column — core, directly-editable fields */}
          <div className="space-y-4 overflow-y-auto p-6">
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input value={form.title} onChange={(e) => set("title", e.target.value)} autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={3} />
            </div>
            <div className="space-y-1.5">
              <Label>Reason for follow-up</Label>
              <Textarea
                value={form.occurrence}
                onChange={(e) => set("occurrence", e.target.value)}
                rows={2}
                placeholder="Why did this follow-up become necessary?"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Status</Label>
              <StatusSeg value={form.status} onChange={(v) => set("status", v)} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Select value={form.priority} onValueChange={(v) => set("priority", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="med">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Track <span className="text-[var(--t-red)]">*</span></Label>
                <Select value={form.category} onValueChange={(v) => set("category", v)}>
                  <SelectTrigger><SelectValue placeholder="Choose a track" /></SelectTrigger>
                  <SelectContent>
                    {ws.categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Start</Label>
                <Input type="date" value={form.start} onChange={(e) => set("start", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>End</Label>
                <Input type="date" value={form.end} onChange={(e) => set("end", e.target.value)} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Assignees (comma-separated)</Label>
              <Input value={form.assignees} onChange={(e) => set("assignees", e.target.value)} placeholder="Dev Patel, Maya Rossi" />
            </div>

            {/* custom fields — "occurrence" has its own dedicated field above */}
            {activeTask && Object.entries(activeTask.custom ?? {}).filter(([k]) => k !== "occurrence").length > 0 && (
              <div className="space-y-1.5 border-t pt-4">
                <Label>Custom fields</Label>
                <div className="space-y-1">
                  {Object.entries(activeTask.custom as Record<string, unknown>)
                    .filter(([k]) => k !== "occurrence")
                    .map(([k, v]) => (
                      <div key={k} className="flex items-center justify-between rounded-[var(--radius-sm)] bg-[var(--paper-2)] px-2.5 py-1.5 text-xs">
                        <span className="text-muted-foreground font-medium">{k}</span>
                        <span>{String(v)}</span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>

          {/* Right column — relational content: lineage, dependencies, risks, comments */}
          <div className="space-y-4 overflow-y-auto p-6">
            {chain.length > 1 && (
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5"><GitBranch className="size-3.5" /> Follow-up chain</Label>
                <div className="flex flex-wrap items-center gap-1.5">
                  {chain.map((node, i) => (
                    <span key={node.id} className="flex items-center gap-1.5">
                      {i > 0 && <span className="text-muted-foreground/50">→</span>}
                      <button
                        type="button"
                        onClick={() => { if (node.direction !== "self") setActiveTaskId(node.id); }}
                        disabled={node.direction === "self"}
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-xs font-medium transition",
                          node.direction === "self"
                            ? "border-primary bg-primary/10 text-primary cursor-default"
                            : "hover:bg-muted",
                          node.status === "done" && "line-through opacity-60",
                        )}
                        title={node.direction === "self" ? "This task" : `Jump to "${node.title}"`}
                      >
                        {node.title || "Untitled task"}
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            <DepEditor
              task={activeTask} ws={ws} projectId={projectId}
              deps={form.deps.filter((d) => d.type !== "followup")}
              onChange={(next) => set("deps", [...next, ...form.deps.filter((d) => d.type === "followup")])}
            />

            {activeTask && (
              <div className="border-t pt-4">
                <RiskLinker task={activeTask} ws={ws} projectId={projectId} />
              </div>
            )}

            {activeTask && (
              <div className="border-t pt-4">
                <h4 className="mb-3 flex items-center gap-1.5 text-sm font-medium">
                  <MessageSquare className="text-muted-foreground size-4" />
                  Comments
                  {(activeTask.comments?.length ?? 0) > 0 && (
                    <span className="bg-muted text-muted-foreground rounded-full px-1.5 py-0.5 text-xs">{activeTask.comments.length}</span>
                  )}
                </h4>
                {(activeTask.comments ?? []).length === 0 && <p className="text-muted-foreground mb-3 text-xs">No comments yet.</p>}
                {(activeTask.comments ?? []).map((c) => (
                  <div key={c.id} className="mb-2.5 flex gap-2.5">
                    <span className="bg-foreground text-background mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold">
                      {initials(c.author)}
                    </span>
                    <div className="flex-1 rounded-lg bg-[var(--paper-2)] px-3 py-2">
                      <div className="mb-0.5 flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold">{c.author}</span>
                        <span className="text-muted-foreground text-[10px]">
                          {new Date(c.ts).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      <p className="text-xs leading-snug">{c.text}</p>
                    </div>
                  </div>
                ))}
                <div className="mt-3 space-y-2">
                  {ws.members.length > 1 && (
                    <Select value={commentAuthor} onValueChange={setCommentAuthor}>
                      <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Author" /></SelectTrigger>
                      <SelectContent>
                        {ws.members.map((m) => <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                  <div className="flex gap-2">
                    <Input
                      placeholder="Add a comment…"
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addComment(); } }}
                      className="h-8 text-xs"
                    />
                    <Button size="sm" onClick={addComment} disabled={!commentText.trim()}>Post</Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="-mx-0 -mb-0 flex items-center justify-between rounded-b-xl border-t bg-muted/50 px-6 py-4 sm:justify-between">
          {activeTask ? (
            <Button variant="ghost" size="sm" onClick={remove} className="text-muted-foreground hover:text-[var(--t-red)]">
              <Trash2 className="size-3.5" /> Delete
            </Button>
          ) : <span />}
          <Button onClick={save} disabled={create.isPending || update.isPending}>
            {activeTask ? "Save changes" : "Add task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
