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
import { Checkbox } from "@/components/ui/checkbox";
import { todayISO, fmtD } from "@/lib/tasks";
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
    category: milestone?.category ?? defaultCategoryId ?? "none",
    note: milestone?.note ?? "",
    reached: !!milestone?.reachedOn,
  }));
  const set = (k: string, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));
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
    // A milestone has no date. It is reached on the day someone checks it
    // off, and keeps that day if it was already checked off before.
    const payload = {
      title: form.title.trim() || (isGate ? "Untitled gate" : "Untitled milestone"),
      type: form.type,
      category: form.category,
      note: form.note,
      reachedOn: form.reached ? milestone?.reachedOn || todayISO() : "",
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
        <div className="-mx-1 space-y-4 overflow-y-auto px-1">
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

          <div className="space-y-1.5">
            <Label>Track <span className="text-[var(--t-red)]">*</span></Label>
            <Select value={form.category === "none" ? undefined : form.category} onValueChange={(v) => set("category", v)}>
              <SelectTrigger><SelectValue placeholder="Pick a track" /></SelectTrigger>
              <SelectContent>
                {ws.categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">
              {milestone && milestone.category !== form.category && form.category !== "none"
                ? "Moving it to another track leaves its tasks where they are, no longer under it."
                : isGate
                  ? "A gate is a decision point in its track. It blocks nothing."
                  : "Every milestone belongs to one track. Tasks in that track can sit under it."}
            </p>
          </div>

          <label className="flex cursor-pointer items-center gap-2.5 rounded-[var(--radius-sm)] border px-3 py-2.5">
            <Checkbox checked={form.reached} onCheckedChange={(v) => set("reached", v === true)} />
            <span className="text-[13.5px] font-medium">
              {isGate ? "Approved" : "Reached"}
            </span>
            <span className="text-muted-foreground ml-auto text-[12px]">
              {form.reached
                ? milestone?.reachedOn ? fmtD(milestone.reachedOn) : "today"
                : "Checked off by a person, not by its last task"}
            </span>
          </label>

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
