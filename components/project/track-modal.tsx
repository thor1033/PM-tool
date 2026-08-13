"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Trash2, X, CheckCircle2, AlertTriangle, Flag, StickyNote,
  Milestone as MilestoneIcon, ArrowRight,
} from "lucide-react";
import {
  useProject,
  useCreateEntity,
  useUpdateEntity,
  useDeleteEntity,
} from "@/lib/api/hooks";
import { ACCENTS, accent, accentVar } from "@/lib/colors";
import { TRACK_ICONS } from "@/lib/tasks";
import { computeHealth } from "@/lib/project-health";
import type { Category, Milestone } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useConfirm } from "@/components/project/confirm";

/* The track editor. Mirrors the task editor's shape — one modal, editable
 * fields on the left, read-only context on the right — but a track is a
 * container rather than a piece of work, so the right side answers "what is
 * in here and how is it doing" instead of listing dependencies. */

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-[var(--radius-md)] border p-2.5">
      <p className="text-muted-foreground text-[11px]">{label}</p>
      <p
        className="mt-0.5 text-[17px] font-semibold tabular-nums"
        style={tone ? { color: `color-mix(in oklch, ${tone} 76%, var(--ink))` } : undefined}
      >
        {value}
      </p>
    </div>
  );
}

export function TrackModal({
  projectId,
  track,
  open,
  onOpenChange,
  onEditMilestone,
}: {
  projectId: string;
  /** null when creating a new track. */
  track: Category | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Opens the project's milestone editor, so this modal doesn't grow a
   *  second one. Called with the track pre-selected. */
  onEditMilestone: (
    m: Milestone | null,
    defaultCategoryId?: string | null,
    defaultType?: "milestone" | "gate",
  ) => void;
}) {
  const { data: ws } = useProject(projectId);
  const create = useCreateEntity(projectId, "categories");
  const update = useUpdateEntity(projectId, "categories");
  const del = useDeleteEntity(projectId, "categories");
  const updateTask = useUpdateEntity(projectId, "tasks");
  const confirm = useConfirm();

  interface TrackForm {
    label: string;
    color: string;
    icon: string | null;
    owner: string | null;
  }
  const seed: TrackForm = {
    label: track?.label ?? "",
    color: track?.color ?? "purple",
    icon: track?.icon ?? null,
    owner: track?.owner ?? null,
  };

  // Edits are held as a diff over the track being edited, so opening a
  // different track re-seeds without an effect writing state during render.
  const [edits, setEdits] = useState<Partial<TrackForm>>({});
  const [editingId, setEditingId] = useState<string | null>(track?.id ?? null);
  if (editingId !== (track?.id ?? null)) {
    setEditingId(track?.id ?? null);
    setEdits({});
  }
  const form: TrackForm = { ...seed, ...edits };
  const set = <K extends keyof TrackForm>(k: K, v: TrackForm[K]) =>
    setEdits((p) => ({ ...p, [k]: v }));

  const tasksIn = useMemo(
    () => (track ? (ws?.tasks ?? []).filter((t) => t.category === track.id) : []),
    [ws, track],
  );
  const milestonesIn = useMemo(
    () => (track ? (ws?.milestones ?? []).filter((m) => m.category === track.id) : []),
    [ws, track],
  );
  const gatesIn = useMemo(() => milestonesIn.filter((m) => m.type === "gate"), [milestonesIn]);
  const marksIn = useMemo(() => milestonesIn.filter((m) => m.type !== "gate"), [milestonesIn]);

  // Anything not already in this track: work sitting elsewhere, or with no
  // track at all. Done tasks are excluded — moving finished work between
  // tracks rewrites history rather than planning anything.
  const movable = useMemo(
    () =>
      (ws?.tasks ?? []).filter(
        (t) => !t.parentId && t.status !== "done" && t.category !== (track?.id ?? null),
      ),
    [ws, track],
  );

  const notesIn = useMemo(
    () => (track ? (ws?.notes ?? []).filter((n) => n.category === track.id) : []),
    [ws, track],
  );
  const health = useMemo(
    () => computeHealth(tasksIn, ws?.tasks ?? []),
    [tasksIn, ws],
  );

  const otherTracks = useMemo(
    () => (ws?.categories ?? []).filter((c) => c.id !== track?.id),
    [ws, track],
  );

  if (!ws) return null;

  async function save() {
    const label = form.label.trim();
    if (!label) {
      toast.error("A track needs a name.");
      return;
    }
    const payload = { label, color: form.color, icon: form.icon, owner: form.owner };
    const onError = (e: unknown) => toast.error((e as Error).message);
    if (track) update.mutate({ id: track.id, data: payload }, { onError });
    else create.mutate(payload, { onError });
    onOpenChange(false);
  }

  async function remove() {
    if (!track) return;
    // A track cannot simply vanish while it still holds work — the tasks have
    // to land somewhere, so the choice is made explicitly.
    if (tasksIn.length > 0) {
      if (otherTracks.length === 0) {
        toast.error("This is the only track and it still holds tasks. Create another one first.");
        return;
      }
      const target = otherTracks[0];
      const ok = await confirm({
        title: `Delete the “${track.label}” track?`,
        body: `Its ${tasksIn.length} task${tasksIn.length === 1 ? "" : "s"} will move to “${target.label}”.`,
        confirmLabel: "Move & delete",
        destructive: true,
      });
      if (!ok) return;
      tasksIn.forEach((t) => updateTask.mutate({ id: t.id, data: { category: target.id } }));
    } else {
      const ok = await confirm({
        title: `Delete the “${track.label}” track?`,
        body: "It holds no tasks, so nothing else changes.",
        confirmLabel: "Delete",
        destructive: true,
      });
      if (!ok) return;
    }
    del.mutate(track.id, { onError: (e) => toast.error((e as Error).message) });
    onOpenChange(false);
  }

  function moveHere(taskId: string) {
    if (!track) return;
    updateTask.mutate(
      { id: taskId, data: { category: track.id } },
      { onError: (e) => toast.error((e as Error).message) },
    );
  }

  const ownerName = form.owner
    ? ws.stakeholders.find((p) => p.id === form.owner)?.name ?? null
    : null;
  const PreviewIcon = form.icon ? TRACK_ICONS[form.icon]?.Icon : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85dvh] w-[90vw] max-w-[900px] sm:max-w-[900px] flex-col overflow-hidden p-0">
        <DialogHeader className="flex-row items-center justify-between space-y-0 border-b px-6 py-4">
          <DialogTitle className="font-serif-display font-medium">
            {track ? "Edit track" : "New track"}
          </DialogTitle>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 grid-cols-1 divide-x overflow-hidden sm:grid-cols-[1fr_300px]">
          {/* Left — what the track is */}
          <div className="space-y-4 overflow-y-auto p-6">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={form.label}
                onChange={(e) => set("label", e.target.value)}
                placeholder="e.g. Discovery"
                autoFocus
                onKeyDown={(e) => { if (e.key === "Enter") save(); }}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Responsible</Label>
              <Select
                value={form.owner ?? "none"}
                onValueChange={(v) => set("owner", v === "none" ? null : v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nobody yet</SelectItem>
                  {ws.stakeholders.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}{p.title ? ` · ${p.title}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {ws.stakeholders.length === 0 && (
                <p className="text-muted-foreground text-[11.5px]">
                  Add people on the Stakeholders page to assign one here.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Colour</Label>
              <div className="flex flex-wrap gap-1.5">
                {ACCENTS.map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => set("color", a)}
                    aria-label={a}
                    className={cn(
                      "size-6 rounded-full transition",
                      accent(a).dot,
                      form.color === a && "ring-primary ring-2 ring-offset-2",
                    )}
                  />
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Icon</Label>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => set("icon", null)}
                  title="No icon"
                  className={cn(
                    "text-muted-foreground hover:text-foreground flex size-8 items-center justify-center rounded-[var(--radius-sm)] border transition",
                    !form.icon && "border-primary bg-primary/10 text-primary",
                  )}
                >
                  <X className="size-4" />
                </button>
                {Object.entries(TRACK_ICONS).map(([key, { label, Icon }]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => set("icon", key)}
                    title={label}
                    className={cn(
                      "text-muted-foreground hover:text-foreground flex size-8 items-center justify-center rounded-[var(--radius-sm)] border transition",
                      form.icon === key && "border-primary bg-primary/10 text-primary",
                    )}
                  >
                    <Icon className="size-4" />
                  </button>
                ))}
              </div>
            </div>

            {track && (
              <>
                <div className="space-y-1.5 border-t pt-4">
                  <div className="flex items-center justify-between gap-2">
                    <Label>Milestones &amp; gates</Label>
                    <div className="flex gap-1.5">
                      <Button
                        variant="outline" size="sm" className="h-7 text-[12px]"
                        onClick={() => onEditMilestone(null, track.id, "milestone")}
                      >
                        <MilestoneIcon className="size-3.5" /> Milestone
                      </Button>
                      <Button
                        variant="outline" size="sm"
                        className="h-7 border-[var(--t-red)]/40 text-[12px] text-[var(--t-red)] hover:bg-[var(--t-red)]/10 hover:text-[var(--t-red)]"
                        onClick={() => onEditMilestone(null, track.id, "gate")}
                      >
                        <Flag className="size-3.5" /> Gate
                      </Button>
                    </div>
                  </div>
                  {milestonesIn.length === 0 ? (
                    <p className="text-muted-foreground text-[12.5px]">
                      None yet. Milestones mark a moment; gates are decisions the track must pass.
                    </p>
                  ) : (
                    <ul className="divide-y rounded-[var(--radius-md)] border">
                      {milestonesIn
                        .slice()
                        .sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999"))
                        .map((m) => (
                          <li key={m.id}>
                            <button
                              type="button"
                              onClick={() => onEditMilestone(m, track.id, m.type === "gate" ? "gate" : "milestone")}
                              className="flex w-full items-center gap-2 px-2.5 py-2 text-left transition hover:bg-[var(--paper-2)]"
                            >
                              {m.type === "gate" ? (
                                <Flag className="size-3.5 shrink-0 text-[var(--t-red)]" />
                              ) : (
                                <MilestoneIcon className="text-muted-foreground size-3.5 shrink-0" />
                              )}
                              <span className="min-w-0 flex-1 truncate text-[13px]">
                                {m.title || "Untitled"}
                              </span>
                              <span className="text-muted-foreground shrink-0 font-mono text-[11.5px]">
                                {m.date || "no date"}
                              </span>
                            </button>
                          </li>
                        ))}
                    </ul>
                  )}
                </div>

                <div className="space-y-1.5 border-t pt-4">
                  <Label>Bring work into this track</Label>
                  {movable.length === 0 ? (
                    <p className="text-muted-foreground text-[12.5px]">
                      No unfinished work sits outside this track.
                    </p>
                  ) : (
                    <>
                      <p className="text-muted-foreground text-[12px]">
                        Moves a task out of its current track and into this one.
                      </p>
                      <ul className="max-h-[190px] divide-y overflow-y-auto rounded-[var(--radius-md)] border">
                        {movable.map((t) => {
                          const from = t.category
                            ? ws.categories.find((c) => c.id === t.category)?.label ?? "Unknown"
                            : "No track";
                          return (
                            <li
                              key={t.id}
                              className="flex items-center gap-2 px-2.5 py-1.5 transition hover:bg-[var(--paper-2)]"
                            >
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-[13px]">{t.title}</span>
                                <span className="text-muted-foreground block truncate text-[11px]">
                                  {from}
                                </span>
                              </span>
                              <Button
                                variant="ghost" size="sm"
                                className="h-7 shrink-0 text-[12px]"
                                onClick={() => moveHere(t.id)}
                                title={`Move “${t.title}” into ${form.label || "this track"}`}
                              >
                                <ArrowRight className="size-3.5" /> Move
                              </Button>
                            </li>
                          );
                        })}
                      </ul>
                    </>
                  )}
                </div>
              </>
            )}

            {/* How the track will actually read on the board. */}
            <div className="space-y-1.5">
              <Label>Preview</Label>
              <div className="flex items-center gap-2 rounded-[var(--radius-md)] border bg-[var(--paper-2)] px-3 py-2.5">
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ background: accentVar(form.color) }}
                />
                {PreviewIcon && <PreviewIcon className="text-muted-foreground size-4 shrink-0" />}
                <span className="font-serif-display text-[17px] font-semibold">
                  {form.label.trim() || "Untitled track"}
                </span>
                {ownerName && (
                  <span className="text-muted-foreground ml-auto text-[12px]">{ownerName}</span>
                )}
              </div>
            </div>
          </div>

          {/* Right — what the track holds. Read-only: this is context for the
              decisions on the left, not a second place to edit the work. */}
          <div className="space-y-4 overflow-y-auto bg-[var(--paper-2)] p-5">
            {!track ? (
              <p className="text-muted-foreground text-[13px] leading-relaxed">
                Once the track exists, its progress and contents appear here.
              </p>
            ) : (
              <>
                <div>
                  <p className="eyebrow mb-2">Progress</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Stat label="Tasks" value={String(health.total)} />
                    <Stat
                      label="Done"
                      value={health.total ? `${health.pctDone}%` : "—"}
                      tone={health.pctDone === 100 ? "var(--hue-done)" : undefined}
                    />
                    <Stat
                      label="Overdue"
                      value={String(health.overdue.length)}
                      tone={health.overdue.length ? "var(--t-red)" : "var(--hue-done)"}
                    />
                    <Stat
                      label="Blocked"
                      value={String(health.blocked.length)}
                      tone={health.blocked.length ? "var(--t-amber)" : "var(--hue-done)"}
                    />
                  </div>
                </div>

                <div className="border-t pt-3">
                  <p className="eyebrow mb-2">In this track</p>
                  <ul className="space-y-1.5 text-[12.5px]">
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="size-3.5 shrink-0 text-[var(--hue-done)]" />
                      {health.done} of {health.total} task{health.total === 1 ? "" : "s"} complete
                    </li>
                    {health.overdue.length > 0 && (
                      <li className="flex items-center gap-2">
                        <AlertTriangle className="size-3.5 shrink-0 text-[var(--t-red)]" />
                        {health.overdue.length} overdue
                      </li>
                    )}
                    <li className="flex items-center gap-2">
                      <MilestoneIcon className="text-muted-foreground size-3.5 shrink-0" />
                      {marksIn.length} milestone{marksIn.length === 1 ? "" : "s"}
                    </li>
                    <li className="flex items-center gap-2">
                      <Flag className="size-3.5 shrink-0 text-[var(--t-red)]" />
                      {gatesIn.length} gate{gatesIn.length === 1 ? "" : "s"}
                    </li>
                    <li className="flex items-center gap-2">
                      <StickyNote className="text-muted-foreground size-3.5 shrink-0" />
                      {notesIn.length} note{notesIn.length === 1 ? "" : "s"}
                    </li>
                  </ul>
                </div>

                {tasksIn.length > 0 && (
                  <div className="border-t pt-3">
                    <p className="eyebrow mb-2">Tasks</p>
                    <ul className="space-y-1">
                      {tasksIn.slice(0, 8).map((t) => (
                        <li key={t.id} className="flex items-center gap-2 text-[12.5px]">
                          <span
                            className="size-1.5 shrink-0 rounded-full"
                            style={{
                              background:
                                t.status === "done" ? "var(--hue-done)"
                                : t.status === "inprogress" ? "var(--hue-progress)"
                                : "var(--hue-backlog)",
                            }}
                          />
                          <span className={cn("truncate", t.status === "done" && "text-muted-foreground line-through")}>
                            {t.title}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {tasksIn.length > 8 && (
                      <p className="text-muted-foreground mt-1.5 text-[11.5px]">
                        and {tasksIn.length - 8} more
                      </p>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <DialogFooter className="bg-muted/50 flex items-center justify-between rounded-b-xl border-t px-6 py-4 sm:justify-between">
          {track ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={remove}
              className="text-muted-foreground hover:text-[var(--t-red)]"
            >
              <Trash2 className="size-3.5" /> Delete
            </Button>
          ) : (
            <span />
          )}
          <Button onClick={save} disabled={create.isPending || update.isPending}>
            {track ? "Save changes" : "Add track"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
