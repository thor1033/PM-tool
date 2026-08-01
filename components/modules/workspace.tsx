"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Link2, Package, ShieldAlert, Lightbulb, Flag, Layers,
  ChevronRight, ExternalLink, AlertTriangle,
} from "lucide-react";
import { useProject, useUpdateEntity } from "@/lib/api/hooks";
import type { Task, WorkingSet } from "@/lib/types";
import { accent } from "@/lib/colors";
import { cn } from "@/lib/utils";
import { ModuleHeader } from "@/components/project/ui";
import { GlossaryText } from "@/components/project/glossary-text";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_ORDER = [
  { id: "inprogress", label: "In progress", dot: "bg-blue-500" },
  { id: "backlog",    label: "To do",        dot: "bg-slate-400" },
  { id: "done",       label: "Done",          dot: "bg-green-500" },
];

const PRIORITY_COLOR: Record<string, string> = {
  high: "bg-red-500",
  med:  "bg-amber-500",
  low:  "bg-slate-400",
};

const RISK_SCORE: Record<string, number> = { high: 3, med: 2, low: 1 };
const RISK_COLOR = (l: string, i: string) => {
  const s = RISK_SCORE[l] * RISK_SCORE[i];
  return s >= 6 ? "bg-red-500" : s >= 4 ? "bg-amber-500" : "bg-green-500";
};

function initials(name: string) {
  return name.split(/\s+/).map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

function fmtDate(d: string) {
  if (!d) return "";
  return new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

// ── Context builder ───────────────────────────────────────────────────────────

function buildCtx(task: Task, ws: WorkingSet) {
  const today = new Date(); today.setHours(0, 0, 0, 0);

  // Deps with ready/waiting/blocked status
  const deps = (task.deps ?? [])
    .filter((d) => d.type === "task" && d.refId)
    .map((d) => {
      const pred = ws.tasks.find((t) => t.id === d.refId);
      if (!pred) return null;
      const done = pred.status === "done";
      const violated = !done && !!task.start && !!pred.end && new Date(task.start) < new Date(pred.end);
      return {
        id: d.id || d.refId!,
        title: pred.title,
        status: pred.status,
        end: pred.end,
        done,
        violated,
        blocked: !done && !!pred.end && new Date(pred.end) > today,
      };
    })
    .filter(Boolean) as {
      id: string; title: string; status: string; end: string;
      done: boolean; violated: boolean; blocked: boolean;
    }[];

  // Deliverables linked to this task
  const deliverables = ws.products.filter((p) => (p.taskIds ?? []).includes(task.id));

  // Risks this task mitigates
  const linkedRisks = ws.risks.filter((r) => (r.taskIds ?? []).includes(task.id));

  // Pre-analysis insights from the same track
  const insights = ws.findings.filter((f) => f.category && f.category === task.category);

  // Gates ahead (type=gate, same category, date >= task.end)
  const gates = ws.milestones.filter(
    (m) => m.type === "gate" && m.category === task.category &&
      m.date && task.end && new Date(m.date) >= new Date(task.end),
  );

  // Subtasks
  const subtasks = ws.tasks.filter((t) => t.parentId === task.id);

  return { deps, deliverables, linkedRisks, insights, gates, subtasks };
}

// ── Left panel: task list ─────────────────────────────────────────────────────

function TaskList({
  ws, myTasks, selId, onSelect,
}: {
  ws: WorkingSet; myTasks: Task[]; selId: string | null; onSelect: (id: string) => void;
}) {
  const today = new Date(); today.setHours(0, 0, 0, 0);

  const groups = STATUS_ORDER.map((s) => ({
    ...s,
    tasks: myTasks.filter((t) => t.status === s.id),
  })).filter((g) => g.tasks.length > 0);

  return (
    <div className="flex flex-col gap-3">
      {groups.map((g) => (
        <div key={g.id}>
          <div className="mb-1 flex items-center gap-2 px-1">
            <span className={cn("size-2 rounded-full", g.dot)} />
            <span className="text-xs font-semibold text-muted-foreground">{g.label}</span>
            <span className="text-xs text-muted-foreground">{g.tasks.length}</span>
          </div>
          <div className="space-y-1">
            {g.tasks.map((t) => {
              const overdue = t.status !== "done" && t.end && new Date(t.end) < today;
              const nDeps = (t.deps ?? []).filter((d) => d.type === "task").length;
              const nLinks = ws.products.filter((p) => (p.taskIds ?? []).includes(t.id)).length;
              const nRisks = ws.risks.filter((r) => (r.taskIds ?? []).includes(t.id)).length;
              const nCmt = (t.comments ?? []).length;
              const isSelected = t.id === selId;
              return (
                <button
                  key={t.id}
                  onClick={() => onSelect(t.id)}
                  className={cn(
                    "flex w-full items-start gap-2 rounded-lg border px-3 py-2 text-left transition",
                    isSelected ? "border-indigo-300 bg-indigo-50 dark:border-indigo-700 dark:bg-indigo-950/40" : "hover:bg-muted/50",
                  )}
                >
                  <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", PRIORITY_COLOR[t.priority] ?? "bg-slate-400")} />
                  <div className="min-w-0 flex-1">
                    <p className={cn("truncate text-sm font-medium", t.status === "done" && "line-through text-muted-foreground")}>
                      {t.title}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                      {t.end && (
                        <span className={cn("flex items-center gap-0.5", overdue && "text-red-600 dark:text-red-400 font-medium")}>
                          {overdue && <AlertTriangle className="size-2.5" />}
                          {fmtDate(t.end)}{overdue ? " · overdue" : ""}
                        </span>
                      )}
                      {nDeps > 0 && <span className="flex items-center gap-0.5"><Link2 className="size-2.5" />{nDeps}</span>}
                      {nLinks > 0 && <span className="flex items-center gap-0.5"><Package className="size-2.5" />{nLinks}</span>}
                      {nRisks > 0 && <span className="flex items-center gap-0.5 text-red-500"><ShieldAlert className="size-2.5" />{nRisks}</span>}
                      {nCmt > 0 && <span>{nCmt} 💬</span>}
                    </div>
                  </div>
                  {isSelected && <ChevronRight className="mt-0.5 size-3.5 shrink-0 text-indigo-500" />}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {myTasks.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">No tasks assigned.</p>
      )}
    </div>
  );
}

// ── Right panel: task hub ─────────────────────────────────────────────────────

function HubCard({ title, count, icon: Icon, children, className }: {
  title: string; count?: number; icon: typeof Link2; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={cn("rounded-xl border bg-card p-3", className)}>
      <div className="mb-2 flex items-center gap-2">
        <Icon className="size-3.5 text-muted-foreground" />
        <span className="text-xs font-semibold">{title}</span>
        {count !== undefined && <Badge variant="secondary" className="text-[10px]">{count}</Badge>}
      </div>
      {children}
    </div>
  );
}

function HubLine({ label, tag, tagCls, dim }: {
  label: string; tag?: string; tagCls?: string; dim?: string;
}) {
  return (
    <div className="flex items-center gap-2 py-1 text-sm">
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {dim && <span className="shrink-0 text-xs text-muted-foreground">{dim}</span>}
      {tag && <span className={cn("shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium", tagCls)}>{tag}</span>}
    </div>
  );
}

function TaskHub({ task, ws, projectId }: { task: Task; ws: WorkingSet; projectId: string }) {
  const update = useUpdateEntity(projectId, "tasks");
  const ctx = useMemo(() => buildCtx(task, ws), [task, ws]);
  const cat = ws.categories.find((c) => c.id === task.category);
  const phase = ws.phases.find((p) => p.id === task.phase);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const overdue = task.status !== "done" && task.end && new Date(task.end) < today;
  const a = cat ? accent(cat.color) : null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-xl border bg-card p-4">
        <div className="mb-1 flex items-center gap-2">
          <span className={cn("text-xs font-medium", task.status === "done" ? "text-green-600" : task.status === "inprogress" ? "text-blue-600" : "text-muted-foreground")}>
            {task.status === "inprogress" ? "In progress" : task.status === "done" ? "Done" : "To do"}
          </span>
          {overdue && (
            <Badge variant="destructive" className="text-[10px]">Overdue</Badge>
          )}
        </div>
        <h2 className="mb-2 text-lg font-semibold leading-snug">{task.title}</h2>
        <div className="flex flex-wrap items-center gap-1.5">
          {cat && <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", a!.soft)}>{cat.label}</span>}
          {phase && <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", accent(phase.color).soft)}>{phase.label}</span>}
          <span className="flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-muted">
            <span className={cn("size-1.5 rounded-full", PRIORITY_COLOR[task.priority])} />
            {task.priority} priority
          </span>
        </div>
        {task.start || task.end ? (
          <p className={cn("mt-2 text-xs", overdue ? "text-red-600" : "text-muted-foreground")}>
            {task.start ? `${fmtDate(task.start)} → ` : "Due "}
            {fmtDate(task.end)}
          </p>
        ) : null}
        {task.description && (
          <p className="mt-2 text-sm text-muted-foreground">
            <GlossaryText
              text={task.description}
              terms={(ws.project.glossary as { id: string; term: string; definition: string }[]) ?? []}
            />
          </p>
        )}
        {(task.assignees ?? []).length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {task.assignees.map((name) => {
              const m = ws.members.find((x) => x.name === name);
              const mAccent = m ? accent(m.color) : null;
              return (
                <span key={name} className={cn("flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs", mAccent ? mAccent.soft : "bg-muted")}>
                  <span className={cn("flex size-4 items-center justify-center rounded-full text-[8px] font-bold text-white", mAccent ? mAccent.bg : "bg-slate-400")}>
                    {initials(name)}
                  </span>
                  {name}
                </span>
              );
            })}
          </div>
        )}
        <div className="mt-3 flex items-center gap-2">
          <Select
            value={task.status}
            onValueChange={(v) => update.mutate(
              { id: task.id, data: { status: v } },
              { onError: (e) => toast.error((e as Error).message) },
            )}
          >
            <SelectTrigger className="h-7 w-36 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="backlog">To do</SelectItem>
              <SelectItem value="inprogress">In progress</SelectItem>
              <SelectItem value="done">Done</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Subtasks */}
      {ctx.subtasks.length > 0 && (
        <HubCard title="Subtasks" count={ctx.subtasks.length} icon={Layers}>
          {ctx.subtasks.map((s) => (
            <HubLine
              key={s.id}
              label={s.title}
              tag={s.status === "done" ? "done" : s.status === "inprogress" ? "in progress" : "to do"}
              tagCls={s.status === "done" ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300" : s.status === "inprogress" ? "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300" : "bg-muted text-muted-foreground"}
              dim={s.end ? fmtDate(s.end) : undefined}
            />
          ))}
        </HubCard>
      )}

      {/* Dependencies */}
      {ctx.deps.length > 0 && (
        <HubCard title="Depends on" count={ctx.deps.length} icon={Link2}>
          {ctx.deps.map((d) => (
            <HubLine
              key={d.id}
              label={d.title}
              dim={d.end ? fmtDate(d.end) : undefined}
              tag={d.violated ? "blocked" : d.blocked ? "waiting" : d.done ? "ready" : "ok"}
              tagCls={
                d.violated ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" :
                d.blocked ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" :
                "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300"
              }
            />
          ))}
        </HubCard>
      )}

      {/* Deliverables */}
      {ctx.deliverables.length > 0 && (
        <HubCard title="Deliverables & links" count={ctx.deliverables.length} icon={Package}>
          {ctx.deliverables.map((p) => (
            <div key={p.id} className="flex items-center gap-2 py-1">
              <span className="min-w-0 flex-1 truncate text-sm">{p.name}</span>
              {p.url ? (
                <a href={p.url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-muted-foreground hover:text-foreground">
                  <ExternalLink className="size-3.5" />
                </a>
              ) : (
                <span className="text-xs text-muted-foreground">no link</span>
              )}
            </div>
          ))}
        </HubCard>
      )}

      {/* Risks */}
      {ctx.linkedRisks.length > 0 && (
        <HubCard title="Risks this mitigates" count={ctx.linkedRisks.length} icon={ShieldAlert}>
          {ctx.linkedRisks.map((r) => (
            <div key={r.id} className="flex items-center gap-2 py-1">
              <span className={cn("flex size-5 shrink-0 items-center justify-center rounded text-[10px] font-bold text-white", RISK_COLOR(r.likelihood, r.impact))}>
                {RISK_SCORE[r.likelihood] * RISK_SCORE[r.impact]}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm">{r.title}</span>
              <Badge variant="outline" className="text-[10px]">{r.status}</Badge>
            </div>
          ))}
        </HubCard>
      )}

      {/* Pre-analysis insights */}
      {ctx.insights.length > 0 && (
        <HubCard title="Insights from pre-analysis" count={ctx.insights.length} icon={Lightbulb}>
          {ctx.insights.slice(0, 4).map((f) => (
            <HubLine key={f.id} label={f.title} dim={f.category || undefined} />
          ))}
        </HubCard>
      )}

      {/* Gates ahead */}
      {ctx.gates.length > 0 && (
        <HubCard title="Gate ahead" count={ctx.gates.length} icon={Flag}>
          {ctx.gates.map((g) => (
            <HubLine
              key={g.id}
              label={g.title}
              tag={g.date}
              tagCls="bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
            />
          ))}
        </HubCard>
      )}
    </div>
  );
}

// ── Module ────────────────────────────────────────────────────────────────────

export function WorkspaceModule({ projectId }: { projectId: string }) {
  const { data: ws } = useProject(projectId);
  const [who, setWho] = useState<string>("");
  const [selId, setSelId] = useState<string | null>(null);

  if (!ws) return null;

  const { tasks, members } = ws;

  const myTasks = useMemo(
    () => (who ? tasks.filter((t) => (t.assignees ?? []).includes(who) && !t.parentId) : tasks.filter((t) => !t.parentId)),
    [tasks, who],
  );

  // Auto-select first task if selection is gone
  const selTask = myTasks.find((t) => t.id === selId) ?? myTasks[0] ?? null;

  const people = useMemo(
    () => [...new Set(members.map((m) => m.name).filter(Boolean))].sort(),
    [members],
  );

  const selectedMember = members.find((m) => m.name === who);
  const memberAccent = selectedMember ? accent(selectedMember.color) : null;

  return (
    <div>
      <ModuleHeader
        title="Workspace"
        description="A person's tasks and everything needed to do them — in one place."
      />

      {/* Person picker */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          {selectedMember && (
            <span className={cn("flex size-8 items-center justify-center rounded-full text-xs font-bold text-white", memberAccent!.bg)}>
              {initials(selectedMember.name)}
            </span>
          )}
          <Select value={who} onValueChange={setWho}>
            <SelectTrigger className="w-52">
              <SelectValue placeholder="Everyone — all tasks" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Everyone — all tasks</SelectItem>
              {people.map((p) => (
                <SelectItem key={p} value={p}>{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p className="text-sm text-muted-foreground">
          {who
            ? `${who}'s tasks and everything needed to do them.`
            : "Every task and everything tied to it, in one place."}
        </p>
      </div>

      {myTasks.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {who
            ? `${who} isn't assigned to any tasks. Assign them on a task card.`
            : "No tasks in this project yet."}
        </p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          {/* Left: task list */}
          <div className="overflow-y-auto">
            <TaskList ws={ws} myTasks={myTasks} selId={selTask?.id ?? null} onSelect={setSelId} />
          </div>
          {/* Right: hub */}
          <div>
            {selTask ? (
              <TaskHub task={selTask} ws={ws} projectId={projectId} />
            ) : (
              <p className="text-sm text-muted-foreground">Select a task to see its full context.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
