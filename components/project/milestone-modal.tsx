"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { useCreateEntity, useUpdateEntity, useDeleteEntity } from "@/lib/api/hooks";
import type { Milestone, WorkingSet } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useConfirm } from "@/components/project/confirm";

export function MilestoneModal({
  ws, projectId, milestone, defaultCategoryId, defaultType, open, onOpenChange,
}: {
  ws: WorkingSet; projectId: string; milestone: Milestone | null;
  defaultCategoryId?: string | null; defaultType?: "milestone" | "gate";
  open: boolean; onOpenChange: (v: boolean) => void;
}) {
  const create = useCreateEntity(projectId, "milestones");
  const confirm = useConfirm();
  const update = useUpdateEntity(projectId, "milestones");
  const del = useDeleteEntity(projectId, "milestones");

  const [form, setForm] = useState(() => ({
    title: milestone?.title ?? "",
    type: milestone?.type ?? defaultType ?? "milestone",
    date: milestone?.date ?? "",
    category: milestone?.category ?? defaultCategoryId ?? "none",
    note: milestone?.note ?? "",
  }));
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const isGate = form.type === "gate";

  function save() {
    if (form.category === "none") {
      toast.error(
        isGate
          ? "A gate validates a track's work — pick the track it gates."
          : "A milestone must belong to a track — pick one.",
      );
      return;
    }
    const payload = {
      title: form.title.trim() || (isGate ? "Untitled gate" : "Untitled milestone"),
      type: form.type,
      date: form.date,
      category: form.category,
      note: form.note,
    };
    const onError = (e: unknown) => toast.error((e as Error).message);
    if (milestone) update.mutate({ id: milestone.id, data: payload }, { onError });
    else create.mutate(payload, { onError });
    onOpenChange(false);
  }

  async function remove() {
    if (!milestone) return;
    if (!(await confirm({ title: `Delete “${milestone.title || "this milestone"}”?` }))) return;
    del.mutate(milestone.id, { onError: (e) => toast.error((e as Error).message) });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-serif-display font-medium">
            {milestone ? "Edit" : "New"} {isGate ? "gate" : "milestone"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Type</Label>
            <div className="flex gap-1 rounded-[var(--radius-sm)] border bg-[var(--paper-2)] p-1">
              <button
                type="button"
                onClick={() => set("type", "milestone")}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-[6px] px-3 py-1.5 text-xs font-semibold transition",
                  !isGate ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
                )}
              >
                ◆ Milestone
              </button>
              <button
                type="button"
                onClick={() => set("type", "gate")}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-[6px] px-3 py-1.5 text-xs font-semibold transition",
                  isGate ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
                )}
              >
                ┃ Gate
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input value={form.title} onChange={(e) => set("title", e.target.value)} autoFocus />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Track <span className="text-[var(--t-red)]">*</span></Label>
              <Select value={form.category} onValueChange={(v) => set("category", v)}>
                <SelectTrigger><SelectValue placeholder="Pick a track" /></SelectTrigger>
                <SelectContent>
                  {ws.categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-muted-foreground -mt-2 text-xs">
            {isGate
              ? "A gate validates a track’s work — pick the track it gates."
              : "Every milestone belongs to a track, so it anchors that track’s work."}
          </p>

          <div className="space-y-1.5">
            <Label>Note</Label>
            <Textarea value={form.note} onChange={(e) => set("note", e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter className="flex items-center justify-between sm:justify-between">
          {milestone ? (
            <Button variant="ghost" size="sm" onClick={remove} className="text-muted-foreground hover:text-[var(--t-red)]">
              <Trash2 className="size-3.5" /> Delete
            </Button>
          ) : <span />}
          <Button onClick={save} disabled={create.isPending || update.isPending}>
            {milestone ? "Save changes" : `Add ${isGate ? "gate" : "milestone"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
