"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { useCreateEntity, useUpdateEntity, useDeleteEntity } from "@/lib/api/hooks";
import type { WorkingSet, Category } from "@/lib/types";
import { ACCENTS, accent, accentVar } from "@/lib/colors";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

function ColorPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {ACCENTS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          title={c}
          className={cn("size-6 rounded-full border-2 transition", value === c ? "border-foreground" : "border-transparent")}
          style={{ background: accentVar(c) }}
        />
      ))}
    </div>
  );
}

function CategoryRow({
  cat, projectId, tasksIn, otherCategories, onDeleted,
}: {
  cat: Category; projectId: string; tasksIn: { id: string }[]; otherCategories: Category[]; onDeleted: () => void;
}) {
  const update = useUpdateEntity(projectId, "categories");
  const updateTask = useUpdateEntity(projectId, "tasks");
  const del = useDeleteEntity(projectId, "categories");
  const [confirming, setConfirming] = useState(false);
  const [reassignTo, setReassignTo] = useState(otherCategories[0]?.id ?? "");
  const taskCount = tasksIn.length;

  function startDelete() {
    if (taskCount === 0) {
      del.mutate(cat.id, { onError: (e) => toast.error((e as Error).message) });
      onDeleted();
      return;
    }
    setConfirming(true);
  }

  function confirmDelete() {
    if (!reassignTo) return;
    // Reassign every task in this category before removing it — categories
    // are mandatory, so a task can never be left without one.
    tasksIn.forEach((t) => updateTask.mutate({ id: t.id, data: { category: reassignTo } }));
    del.mutate(cat.id, { onError: (e) => toast.error((e as Error).message) });
    onDeleted();
  }

  return (
    <div className="rounded-[var(--radius-md)] border bg-[var(--paper-2)] p-2.5">
      <div className="flex items-center gap-2">
        <ColorPicker value={cat.color} onChange={(c) => update.mutate({ id: cat.id, data: { color: c } })} />
        <Input
          defaultValue={cat.label}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v && v !== cat.label) update.mutate({ id: cat.id, data: { label: v } });
          }}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          className="h-8 flex-1"
        />
        <span className="text-muted-foreground shrink-0 font-mono text-[11px]">{taskCount} task{taskCount === 1 ? "" : "s"}</span>
        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-[var(--t-red)] size-8 shrink-0" onClick={startDelete}>
          <Trash2 className="size-4" />
        </Button>
      </div>

      {confirming && (
        <div className="mt-2.5 space-y-2 border-t pt-2.5">
          {otherCategories.length === 0 ? (
            <p className="text-xs text-[var(--t-red)]">
              This is the only category and it has {taskCount} task{taskCount === 1 ? "" : "s"} — create another category first so they have somewhere to go.
            </p>
          ) : (
            <>
              <p className="text-muted-foreground text-xs">
                {taskCount} task{taskCount === 1 ? "" : "s"} in "{cat.label}" will move to:
              </p>
              <div className="flex items-center gap-2">
                <Select value={reassignTo} onValueChange={setReassignTo}>
                  <SelectTrigger className="h-8 flex-1 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {otherCategories.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button size="sm" variant="destructive" onClick={confirmDelete} disabled={!reassignTo}>
                  Move &amp; delete
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>Cancel</Button>
              </div>
            </>
          )}
          {otherCategories.length === 0 && (
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>Cancel</Button>
          )}
        </div>
      )}
    </div>
  );
}

export function CategoriesModal({
  ws, projectId, open, onOpenChange,
}: {
  ws: WorkingSet; projectId: string; open: boolean; onOpenChange: (v: boolean) => void;
}) {
  const create = useCreateEntity(projectId, "categories");
  const [label, setLabel] = useState("");
  const [color, setColor] = useState<string>(ACCENTS[0]);

  function add() {
    const name = label.trim();
    if (!name) return;
    create.mutate(
      { label: name, color },
      { onSuccess: () => setLabel(""), onError: (e) => toast.error((e as Error).message) },
    );
  }

  const tasksInCategory = (catId: string) => ws.tasks.filter((t) => t.category === catId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif-display font-medium">Categories</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-muted-foreground text-xs leading-relaxed">
            Categories (tracks) group work in every view. Every task belongs to exactly one —
            deleting a category that still has tasks moves them to another category first.
          </p>

          <div className="space-y-2">
            {ws.categories.length === 0 && (
              <p className="text-muted-foreground py-4 text-center text-sm">No categories yet — add the first one below.</p>
            )}
            {ws.categories.map((c) => (
              <CategoryRow
                key={c.id}
                cat={c}
                projectId={projectId}
                tasksIn={tasksInCategory(c.id)}
                otherCategories={ws.categories.filter((x) => x.id !== c.id)}
                onDeleted={() => {}}
              />
            ))}
          </div>

          <div className="flex items-center gap-2 border-t pt-3">
            <ColorPicker value={color} onChange={setColor} />
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") add(); }}
              placeholder="New category name…"
              className="h-8 flex-1"
            />
            <Button size="icon" className="size-8 shrink-0" onClick={add} disabled={!label.trim()}>
              <Plus className="size-4" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
