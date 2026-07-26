"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, CalendarDays, GripVertical } from "lucide-react";
import {
  useProject,
  useCreateEntity,
  useUpdateEntity,
  useDeleteEntity,
} from "@/lib/api/hooks";
import type { Task, WorkingSet } from "@/lib/types";
import { accent } from "@/lib/colors";
import { cn } from "@/lib/utils";
import { ModuleHeader } from "@/components/project/ui";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const STATUSES = [
  { id: "backlog", label: "Backlog" },
  { id: "inprogress", label: "In progress" },
  { id: "done", label: "Done" },
];

const PRIORITY: Record<string, { label: string; cls: string }> = {
  high: { label: "High", cls: "bg-red-500" },
  med: { label: "Medium", cls: "bg-amber-500" },
  low: { label: "Low", cls: "bg-slate-400" },
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function TaskCard({
  task,
  ws,
  onEdit,
  onDelete,
  onDragStart,
}: {
  task: Task;
  ws: WorkingSet;
  onEdit: () => void;
  onDelete: () => void;
  onDragStart: (e: React.DragEvent) => void;
}) {
  const tagMap = new Map(ws.tags.map((t) => [t.id, t]));
  const phase = ws.phases.find((p) => p.id === task.phase);
  return (
    <div
      draggable
      onDragStart={onDragStart}
      className="group bg-card rounded-lg border p-3 shadow-sm transition hover:shadow"
    >
      <div className="flex items-start gap-1.5">
        <GripVertical className="text-muted-foreground/40 mt-0.5 size-3.5 cursor-grab" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm leading-snug font-medium">{task.title}</p>
            <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
              <Button variant="ghost" size="icon" className="size-6" onClick={onEdit}>
                <Pencil className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-6"
                onClick={onDelete}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          </div>

          {(task.tags?.length ?? 0) > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {task.tags.map((tid) => {
                const t = tagMap.get(tid);
                if (!t) return null;
                return (
                  <span
                    key={tid}
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[10px] font-medium",
                      accent(t.color).soft,
                    )}
                  >
                    {t.label}
                  </span>
                );
              })}
            </div>
          )}

          <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="flex items-center gap-1">
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  PRIORITY[task.priority]?.cls ?? "bg-slate-400",
                )}
              />
              {PRIORITY[task.priority]?.label ?? task.priority}
            </span>
            {phase && (
              <span className={cn("rounded px-1.5 py-0.5", accent(phase.color).soft)}>
                {phase.label}
              </span>
            )}
            {task.end && (
              <span className="flex items-center gap-1">
                <CalendarDays className="size-3" />
                {task.end}
              </span>
            )}
          </div>

          {(task.assignees?.length ?? 0) > 0 && (
            <div className="mt-2 flex -space-x-1.5">
              {task.assignees.map((a) => (
                <span
                  key={a}
                  title={a}
                  className="bg-muted ring-background flex size-5 items-center justify-center rounded-full text-[9px] font-medium ring-2"
                >
                  {initials(a)}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TaskDialog({
  ws,
  projectId,
  task,
  open,
  onOpenChange,
}: {
  ws: WorkingSet;
  projectId: string;
  task: Task | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const create = useCreateEntity(projectId, "tasks");
  const update = useUpdateEntity(projectId, "tasks");
  const [form, setForm] = useState(() => ({
    title: task?.title ?? "",
    description: task?.description ?? "",
    status: task?.status ?? "backlog",
    priority: task?.priority ?? "med",
    phase: task?.phase ?? "none",
    assignees: (task?.assignees ?? []).join(", "),
    start: task?.start ?? "",
    end: task?.end ?? "",
    tags: task?.tags ?? [],
  }));

  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    const payload = {
      title: form.title.trim() || "Untitled task",
      description: form.description,
      status: form.status,
      priority: form.priority,
      phase: form.phase === "none" ? null : form.phase,
      assignees: form.assignees
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      start: form.start,
      end: form.end,
      tags: form.tags,
    };
    const onError = (e: unknown) => toast.error((e as Error).message);
    if (task) update.mutate({ id: task.id, data: payload }, { onError });
    else create.mutate(payload, { onError });
    onOpenChange(false);
  }

  function toggleTag(id: string) {
    set(
      "tags",
      form.tags.includes(id)
        ? form.tags.filter((t) => t !== id)
        : [...form.tags, id],
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{task ? "Edit task" : "New task"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              rows={3}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => set("status", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select
                value={form.priority}
                onValueChange={(v) => set("priority", v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="med">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Phase</Label>
            <Select value={form.phase} onValueChange={(v) => set("phase", v)}>
              <SelectTrigger>
                <SelectValue placeholder="No phase" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No phase</SelectItem>
                {ws.phases.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {ws.tags.length > 0 && (
            <div className="space-y-1.5">
              <Label>Tags</Label>
              <div className="flex flex-wrap gap-1.5">
                {ws.tags.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => toggleTag(t.id)}
                    className={cn(
                      "rounded px-2 py-0.5 text-xs transition",
                      form.tags.includes(t.id)
                        ? accent(t.color).soft
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Start</Label>
              <Input
                type="date"
                value={form.start}
                onChange={(e) => set("start", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>End</Label>
              <Input
                type="date"
                value={form.end}
                onChange={(e) => set("end", e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Assignees (comma separated)</Label>
            <Input
              value={form.assignees}
              onChange={(e) => set("assignees", e.target.value)}
              placeholder="Dev Patel, Maya Rossi"
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={save}
            disabled={create.isPending || update.isPending}
          >
            {task ? "Save changes" : "Add task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function BoardModule({ projectId }: { projectId: string }) {
  const { data } = useProject(projectId);
  const update = useUpdateEntity(projectId, "tasks");
  const del = useDeleteEntity(projectId, "tasks");
  const [dialog, setDialog] = useState<{ open: boolean; task: Task | null }>({
    open: false,
    task: null,
  });
  const [dragId, setDragId] = useState<string | null>(null);

  const columns = useMemo(() => {
    const tasks = data?.tasks ?? [];
    return STATUSES.map((s) => ({
      ...s,
      tasks: tasks.filter((t) => t.status === s.id),
    }));
  }, [data]);

  if (!data) return null;

  function drop(status: string) {
    if (!dragId) return;
    const task = data!.tasks.find((t) => t.id === dragId);
    setDragId(null);
    if (!task || task.status === status) return;
    update.mutate(
      { id: task.id, data: { status } },
      { onError: (e) => toast.error((e as Error).message) },
    );
  }

  return (
    <div>
      <ModuleHeader
        title="Board"
        description="Tasks across phases — drag between columns to change status."
        actions={
          <Button onClick={() => setDialog({ open: true, task: null })}>
            <Plus className="size-4" /> Add task
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {columns.map((col) => (
          <div
            key={col.id}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => drop(col.id)}
            className="bg-muted/40 flex flex-col rounded-xl p-3"
          >
            <div className="mb-3 flex items-center justify-between px-1">
              <h3 className="text-sm font-semibold">{col.label}</h3>
              <Badge variant="secondary">{col.tasks.length}</Badge>
            </div>
            <div className="space-y-2">
              {col.tasks.map((t) => (
                <TaskCard
                  key={t.id}
                  task={t}
                  ws={data}
                  onEdit={() => setDialog({ open: true, task: t })}
                  onDelete={() => {
                    if (confirm(`Delete "${t.title}"?`))
                      del.mutate(t.id, {
                        onError: (e) => toast.error((e as Error).message),
                      });
                  }}
                  onDragStart={() => setDragId(t.id)}
                />
              ))}
              {col.tasks.length === 0 && (
                <p className="text-muted-foreground px-1 py-6 text-center text-xs">
                  Nothing here yet
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {dialog.open && (
        <TaskDialog
          ws={data}
          projectId={projectId}
          task={dialog.task}
          open={dialog.open}
          onOpenChange={(v) => setDialog((d) => ({ ...d, open: v }))}
        />
      )}
    </div>
  );
}
