"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Link2, Package, ShieldAlert, Lightbulb, Flag, Layers, Globe, GitBranch,
  ExternalLink, MessageSquare, SlidersHorizontal, FileText, FileSpreadsheet,
  Presentation, Image as ImageIcon, File as FileIcon, Check,
} from "lucide-react";
import { useProject, useUpdateEntity } from "@/lib/api/hooks";
import type { Task, WorkingSet } from "@/lib/types";
import type { TaskComment } from "@/lib/db/schema";
import { accent, accentVar } from "@/lib/colors";
import { initials, fmtD, daysBetween, followupChainOf } from "@/lib/tasks";
import { cn } from "@/lib/utils";
import { peopleOf } from "@/lib/people";
import { ModuleHeader } from "@/components/project/ui";
import { GlossaryText } from "@/components/project/glossary-text";
import { CardModal } from "@/components/project/card-modal";
import { Button } from "@/components/ui/button";

// ── constants ────────────────────────────────────────────────────────────────

const WHO_KEY = "atlas.view";      // per-project: atlas.view.<projectId>
const MODE_KEY = "atlas.ws.mode";  // global

const EVERYONE = "__everyone";

type Mode = "focus" | "timeline";

/** Status groups in the order the hub lists them. */
const STATUS_ORDER = [
  { id: "inprogress", label: "In progress", var: "--hue-progress" },
  { id: "backlog", label: "To do", var: "--hue-backlog" },
  { id: "done", label: "Done", var: "--hue-done" },
] as const;

const statusVarOf = (id: string) =>
  STATUS_ORDER.find((s) => s.id === id)?.var ?? "--hue-backlog";

const RISK_SCORE: Record<string, number> = { high: 3, med: 2, low: 1 };

const FILE_META: Record<string, { color: string; Icon: typeof FileIcon }> = {
  image: { color: "pink", Icon: ImageIcon },
  pdf: { color: "red", Icon: FileText },
  excel: { color: "green", Icon: FileSpreadsheet },
  slides: { color: "amber", Icon: Presentation },
  doc: { color: "blue", Icon: FileIcon },
};
const fileMeta = (type: string) => FILE_META[type] ?? FILE_META.doc;

const DAYW = 5; // px per day on the personal gantt

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function isOverdue(t: Task) {
  return t.status !== "done" && !!t.end && t.end < todayStr();
}

// ── per-task context ─────────────────────────────────────────────────────────

function buildCtx(task: Task, ws: WorkingSet) {
  const today = todayStr();

  const deps = (task.deps ?? [])
    .map((d) => {
      if (d.type === "task" && d.refId) {
        const pred = ws.tasks.find((t) => t.id === d.refId);
        if (!pred) return null;
        const done = pred.status === "done";
        // "blocked" is a real date conflict: this task starts before its
        // predecessor is due to finish. "waiting" is simply not-yet-done.
        const violated = !done && !!task.start && !!pred.end && task.start < pred.end;
        return {
          id: d.id || d.refId, kind: "task" as const, name: pred.title,
          scope: "", state: violated ? "blocked" : !done ? "waiting" : "ready",
        };
      }
      if (d.type === "deliverable" && d.refId) {
        const p = ws.products.find((x) => x.id === d.refId);
        if (!p) return null;
        return {
          id: d.id || d.refId, kind: "deliverable" as const, name: p.name,
          scope: "", state: p.placeholder ? "waiting" : "ready",
        };
      }
      if (d.type === "ext" || d.type === "external") {
        const ext = d.refId ? ws.externals.find((x) => x.id === d.refId) : null;
        return {
          id: d.id || d.refId || d.label || "ext", kind: "ext" as const,
          name: ext?.title || d.label || "External dependency",
          scope: ext?.party || d.scope || "", state: "ok",
        };
      }
      return null;
    })
    .filter(Boolean) as {
      id: string; kind: "task" | "deliverable" | "ext";
      name: string; scope: string; state: string;
    }[];

  const deliverables = ws.products.filter((p) => (p.taskIds ?? []).includes(task.id));
  const linkedRisks = ws.risks.filter((r) => (r.taskIds ?? []).includes(task.id));
  // Findings aren't tied to individual tasks — they're surfaced by track.
  const insights = task.category
    ? ws.findings.filter((f) => f.category && f.category === task.category)
    : [];
  const gate = ws.milestones
    .filter((m) => m.type === "gate" && m.category === task.category && m.date && task.end && m.date >= task.end)
    .sort((a, b) => a.date.localeCompare(b.date))[0] ?? null;
  const subtasks = ws.tasks.filter((t) => t.parentId === task.id);
  // `occurrence` is rendered in the head as follow-up context, so it's kept
  // out of Details to avoid showing the same value twice.
  const custom = Object.entries((task.custom ?? {}) as Record<string, unknown>)
    .filter(([k, v]) => k !== "occurrence" && v !== null && v !== undefined && String(v).trim() !== "");

  // Follow-up lineage: what this was spun off from and what came out of it.
  // Only worth showing when there's more than the task itself.
  const chain = followupChainOf(task, ws.tasks);
  const lineage = chain.length > 1 ? chain : [];

  return { deps, deliverables, linkedRisks, insights, gate, subtasks, custom, lineage, today };
}

// ── small shared bits ────────────────────────────────────────────────────────

// Only the colour is used, so this takes anything that has one — people now
// come from the stakeholder list, which carries no colour of its own.
function Avatar({ name, member, size = 24 }: { name: string; member?: { color?: string }; size?: number }) {
  const a = member?.color ? accent(member.color) : null;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white",
        a ? a.bg : "bg-[var(--ink-ghost)]",
      )}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      title={name}
    >
      {initials(name)}
    </span>
  );
}

function Chip({ children, colorVar, className }: {
  children: React.ReactNode; colorVar?: string; className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-mono text-[11px] font-medium",
        !colorVar && "bg-[var(--paper-2)] text-muted-foreground",
        className,
      )}
      style={colorVar ? {
        background: `color-mix(in oklch, ${colorVar} 15%, var(--panel))`,
        color: colorVar,
      } : undefined}
    >
      {children}
    </span>
  );
}

function HubCard({ title, count, icon: Icon, children }: {
  title: string; count?: number; icon: typeof Link2; children: React.ReactNode;
}) {
  return (
    <section className="shadow-xs rounded-[var(--radius-lg)] border bg-[var(--panel)] p-4">
      <header className="mb-3 flex items-center gap-2">
        <Icon className="text-muted-foreground size-3.5 shrink-0" />
        <h3 className="font-mono text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-soft)]">
          {title}
        </h3>
        {count !== undefined && (
          <span className="text-muted-foreground/70 font-mono text-[11px]">{count}</span>
        )}
      </header>
      {children}
    </section>
  );
}

const DEP_STATE: Record<string, { label: string; v: string }> = {
  blocked: { label: "blocked", v: "--t-red" },
  waiting: { label: "waiting", v: "--t-amber" },
  ready: { label: "ready", v: "--t-green" },
  ok: { label: "ok", v: "--ink-ghost" },
};

// ── the hub: everything tied to one task ─────────────────────────────────────

function WSHub({ task, ws, projectId, wide, onOpenTask, onSelectTask }: {
  task: Task; ws: WorkingSet; projectId: string; wide?: boolean;
  onOpenTask: (t: Task) => void;
  /** Move the whole workspace selection to another task (chain navigation). */
  onSelectTask: (id: string) => void;
}) {
  const router = useRouter();
  const update = useUpdateEntity(projectId, "tasks");
  const ctx = useMemo(() => buildCtx(task, ws), [task, ws]);
  const cat = ws.categories.find((c) => c.id === task.category);
  const phase = ws.phases.find((p) => p.id === task.phase);
  const overdue = isOverdue(task);
  const catVar = cat ? accentVar(cat.color) : "var(--accent-c)";
  const done = ctx.subtasks.filter((s) => s.status === "done").length;
  const occurrence = String(
    (task.custom as Record<string, unknown> | undefined)?.occurrence ?? "",
  ).trim();

  const [commentText, setCommentText] = useState("");
  const [commentAuthor, setCommentAuthor] = useState(() => peopleOf(ws)[0]?.name ?? "");

  function setStatus(v: string) {
    update.mutate({ id: task.id, data: { status: v } }, {
      onError: (e) => toast.error((e as Error).message),
    });
  }
  function toggleSub(sub: Task) {
    update.mutate(
      { id: sub.id, data: { status: sub.status === "done" ? "backlog" : "done" } },
      { onError: (e) => toast.error((e as Error).message) },
    );
  }
  function addComment() {
    const text = commentText.trim();
    if (!text) return;
    const comment: TaskComment = {
      id: `c_${Math.random().toString(36).slice(2, 9)}`,
      author: commentAuthor || "Anonymous",
      text,
      ts: Date.now(),
    };
    update.mutate(
      { id: task.id, data: { comments: [...(task.comments ?? []), comment] } },
      { onError: (e) => toast.error((e as Error).message) },
    );
    setCommentText("");
  }

  return (
    <div className="space-y-4">
      {/* Head — status/dates + lineage, then title, description, and a footer
          row with the track on the left against the owner on the right.
          Double-click anywhere on the card opens the full task editor. */}
      <section
        onDoubleClick={() => onOpenTask(task)}
        title="Double-click to open the full task card"
        className="shadow-xs rounded-[var(--radius-lg)] border bg-[var(--panel)] p-5"
      >
        {/* Row 1: status + dates (left) · follow-up chain (right) */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            {/* The select is the status display — a separate label alongside
                it would just repeat the selected option. */}
            <span className="inline-flex items-center gap-2 rounded-[var(--radius-sm)] border bg-[var(--panel)] pl-2.5">
              <span className="size-2 shrink-0 rounded-full" style={{ background: `var(${statusVarOf(task.status)})` }} />
              <select
                value={task.status}
                onChange={(e) => setStatus(e.target.value)}
                onDoubleClick={(e) => e.stopPropagation()}
                className="h-7 rounded-r-[var(--radius-sm)] bg-transparent pr-2 text-[12.5px] font-medium outline-none"
                aria-label="Task status"
              >
                <option value="backlog">Backlog</option>
                <option value="inprogress">In Progress</option>
                <option value="done">Done</option>
              </select>
            </span>
            {(task.start || task.end) && (
              <span className={cn(
                "font-mono text-[12.5px]",
                overdue ? "font-bold text-[var(--t-red)]" : "text-muted-foreground",
              )}>
                {task.start && task.end
                  ? `${fmtD(task.start)} → ${fmtD(task.end)}`
                  : `due ${fmtD(task.end || task.start)}`}
                {overdue && " · overdue"}
              </span>
            )}
          </div>

          {ctx.lineage.length > 0 && (
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <GitBranch className="text-muted-foreground size-3.5 shrink-0" />
              {ctx.lineage.map((node, i) => {
                const self = node.direction === "self";
                return (
                  <span key={node.id} className="flex min-w-0 items-center gap-1.5">
                    {i > 0 && <span className="text-muted-foreground/50 shrink-0">→</span>}
                    <button
                      onClick={() => { if (!self) onSelectTask(node.id); }}
                      disabled={self}
                      className={cn(
                        "max-w-[190px] truncate rounded-full border px-2.5 py-0.5 text-[12px] transition",
                        self
                          ? "border-primary bg-primary/10 text-primary cursor-default font-medium"
                          : "hover:bg-[var(--paper-2)]",
                        node.status === "done" && !self && "text-muted-foreground line-through",
                      )}
                      title={self ? "This task" : `Go to “${node.title || "Untitled task"}”`}
                    >
                      {node.title || "Untitled task"}
                    </button>
                  </span>
                );
              })}
            </div>
          )}
        </div>

        {/* Row 2: title */}
        <h2 className="mt-3 font-serif-display text-[22px] font-medium leading-snug tracking-tight">
          {task.title || "Untitled task"}
        </h2>

        {/* Row 3: description */}
        <div className="mt-2.5 text-[14px] leading-relaxed">
          {task.description ? (
            <GlossaryText
              text={task.description}
              terms={(ws.project.glossary as { id: string; term: string; definition: string }[]) ?? []}
            />
          ) : (
            <p className="text-muted-foreground">No description yet — open the task to add one.</p>
          )}
        </div>

        {/* A previously-saved reason for the follow-up is no longer editable
            here, but it still reads as useful context so it stays visible. */}
        {occurrence && (
          <p className="text-muted-foreground mt-2.5 border-l-2 pl-3 text-[13.5px] italic">
            {occurrence}
          </p>
        )}

        {/* Row 4: track (left) · owner (right) */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-3.5">
          <div className="flex flex-wrap items-center gap-1.5">
            {cat && <Chip colorVar={catVar}>{cat.label}</Chip>}
            {phase && <Chip colorVar={accentVar(phase.color)}>{phase.label}</Chip>}
          </div>

          {(task.assignees ?? []).length > 0 && (
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              {task.assignees.map((name) => {
                const m = peopleOf(ws).find((x) => x.name === name);
                return (
                  <span key={name} className="inline-flex items-center gap-1.5 rounded-full bg-[var(--paper-2)] py-0.5 pl-0.5 pr-2.5 text-[12.5px]">
                    <Avatar name={name} member={m} size={20} />
                    {name}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Subtasks */}
      {ctx.subtasks.length > 0 && (
        <HubCard title={`Subtasks ${done}/${ctx.subtasks.length}`} icon={Layers}>
          <ul className="divide-y">
            {ctx.subtasks.map((s) => (
              <li key={s.id} className="flex items-center gap-2.5 py-2">
                <button
                  onClick={() => toggleSub(s)}
                  className={cn(
                    "flex size-4 shrink-0 items-center justify-center rounded-full border transition",
                    s.status === "done"
                      ? "border-[var(--hue-done)] bg-[var(--hue-done)] text-white"
                      : "border-[var(--line-strong)] hover:border-primary",
                  )}
                  title={s.status === "done" ? "Mark as to do" : "Mark as done"}
                >
                  {s.status === "done" && <Check className="size-2.5" strokeWidth={3} />}
                </button>
                <span className={cn(
                  "min-w-0 flex-1 truncate text-[13.5px]",
                  s.status === "done" && "text-muted-foreground line-through",
                )}>
                  {s.title}
                </span>
                {s.end && (
                  <span className="text-muted-foreground shrink-0 font-mono text-[12px]">{fmtD(s.end)}</span>
                )}
              </li>
            ))}
          </ul>
        </HubCard>
      )}

      {/* Context grid */}
      <div className={cn("grid gap-4", wide ? "lg:grid-cols-2" : "xl:grid-cols-2")}>
        {ctx.deps.length > 0 && (
          <HubCard title="Depends on" count={ctx.deps.length} icon={Link2}>
            <ul className="divide-y">
              {ctx.deps.map((d) => {
                const st = DEP_STATE[d.state] ?? DEP_STATE.ok;
                const Icon = d.kind === "deliverable" ? Package : d.kind === "ext" ? ExternalLink : Link2;
                return (
                  <li key={d.id} className="flex items-center gap-2 py-2">
                    <Icon className="text-muted-foreground size-3.5 shrink-0" />
                    <span className="min-w-0 flex-1 truncate text-[13.5px]">
                      {d.name}
                      {d.scope && <span className="text-muted-foreground"> · {d.scope}</span>}
                    </span>
                    <Chip colorVar={`var(${st.v})`}>{st.label}</Chip>
                  </li>
                );
              })}
            </ul>
          </HubCard>
        )}

        {/* Files & links — everything a person needs to actually do the task.
            Today that's the files linked to it. */}
        {ctx.deliverables.length > 0 && (
          <HubCard title="Files & links" count={ctx.deliverables.length} icon={Package}>
            <ul className="divide-y">
              {ctx.deliverables.map((p) => {
                const { color, Icon } = fileMeta(p.type);
                return (
                  <li key={p.id}>
                    <button
                      onClick={() => { if (p.url) window.open(p.url, "_blank", "noopener,noreferrer"); }}
                      disabled={!p.url}
                      className="flex w-full items-center gap-2 py-2 text-left transition enabled:hover:text-primary disabled:cursor-default"
                    >
                      <Icon className="size-3.5 shrink-0" style={{ color: accentVar(color) }} />
                      <span className="min-w-0 flex-1 truncate text-[13.5px]">{p.name}</span>
                      <Chip>{p.url ? "Drive" : "none"}</Chip>
                    </button>
                  </li>
                );
              })}
            </ul>
          </HubCard>
        )}

        {ctx.linkedRisks.length > 0 && (
          <HubCard title="Risks this mitigates" count={ctx.linkedRisks.length} icon={ShieldAlert}>
            <ul className="divide-y">
              {ctx.linkedRisks.map((r) => {
                const score = (RISK_SCORE[r.likelihood] ?? 2) * (RISK_SCORE[r.impact] ?? 2);
                const v = score >= 6 ? "--t-red" : score >= 4 ? "--t-amber" : "--t-green";
                return (
                  <li key={r.id}>
                    <button
                      onClick={() => router.push(`/projects/${projectId}/risks`)}
                      className="hover:text-primary flex w-full items-center gap-2.5 py-2 text-left transition"
                    >
                      <span
                        className="flex size-5 shrink-0 items-center justify-center rounded font-mono text-[10px] font-bold text-white"
                        style={{ background: `var(${v})` }}
                      >
                        {score}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[13.5px]">{r.title}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </HubCard>
        )}

        {ctx.insights.length > 0 && (
          <HubCard title="Insights from pre-analysis" count={ctx.insights.length} icon={Lightbulb}>
            <ul className="divide-y">
              {ctx.insights.map((f) => (
                <li key={f.id}>
                  <button
                    onClick={() => router.push(`/projects/${projectId}/preanalysis`)}
                    className="hover:text-primary flex w-full items-center gap-2 py-2 text-left transition"
                  >
                    <span className="min-w-0 flex-1 truncate text-[13.5px]">{f.title}</span>
                    {f.source && (
                      <span className="text-muted-foreground shrink-0 text-[12px]">{f.source}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </HubCard>
        )}

        {ctx.gate && (
          <HubCard title="Gate ahead" icon={Flag}>
            <div className="flex items-center gap-2.5 py-1">
              <Flag className="size-4 shrink-0 text-[var(--t-red)]" />
              <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">{ctx.gate.title}</span>
              <span className="text-muted-foreground shrink-0 font-mono text-[12px]">{fmtD(ctx.gate.date)}</span>
            </div>
          </HubCard>
        )}

        {ctx.custom.length > 0 && (
          <HubCard title="Details" count={ctx.custom.length} icon={SlidersHorizontal}>
            <dl className="divide-y">
              {ctx.custom.map(([k, v]) => (
                <div key={k} className="flex items-baseline gap-3 py-2">
                  <dt className="text-muted-foreground shrink-0 font-mono text-[11px] uppercase tracking-wide">{k}</dt>
                  <dd className="min-w-0 flex-1 text-[13.5px]">{String(v)}</dd>
                </div>
              ))}
            </dl>
          </HubCard>
        )}
      </div>

      {/* Discussion */}
      <HubCard title="Discussion" count={(task.comments ?? []).length} icon={MessageSquare}>
        <div className="space-y-3">
          {(task.comments ?? []).length > 0 ? (
            <ul className="space-y-3">
              {(task.comments ?? []).map((c) => {
                const m = peopleOf(ws).find((x) => x.name === c.author);
                return (
                  <li key={c.id} className="flex gap-2.5">
                    <Avatar name={c.author} member={m} size={26} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="text-[13px] font-semibold">{c.author}</span>
                        <span className="text-muted-foreground/70 font-mono text-[11px]">
                          {new Date(c.ts).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                        </span>
                      </div>
                      <p className="mt-0.5 whitespace-pre-wrap text-[13.5px] leading-relaxed">{c.text}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-muted-foreground text-[13.5px]">No comments yet.</p>
          )}
          <div className="flex items-center gap-2 border-t pt-3">
            <select
              value={commentAuthor}
              onChange={(e) => setCommentAuthor(e.target.value)}
              className="h-8 shrink-0 rounded-[var(--radius-sm)] border bg-[var(--panel)] px-2 text-[12.5px]"
              aria-label="Comment as"
            >
              {peopleOf(ws).map((m) => <option key={m.id} value={m.name}>{m.name}</option>)}
              {peopleOf(ws).length === 0 && <option value="">Anonymous</option>}
            </select>
            <input
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addComment(); } }}
              placeholder="Write a comment…"
              className="focus:border-primary min-w-0 flex-1 rounded-[var(--radius-sm)] border bg-[var(--panel)] px-2.5 py-1.5 text-[13.5px] outline-none"
            />
            <Button size="sm" className="h-8 shrink-0" onClick={addComment} disabled={!commentText.trim()}>
              Post
            </Button>
          </div>
        </div>
      </HubCard>
    </div>
  );
}

// ── focus mode: task list ────────────────────────────────────────────────────

function WSList({ ws, myTasks, selId, everyone, onSelect, onToggleSub, onOpenTask }: {
  ws: WorkingSet; myTasks: Task[]; selId: string | null; everyone: boolean;
  onSelect: (id: string) => void;
  onToggleSub: (sub: Task) => void;
  onOpenTask: (t: Task) => void;
}) {
  // Grouped once rather than filtering the full task list per row.
  const subsByParent = useMemo(() => {
    const map = new Map<string, Task[]>();
    ws.tasks.forEach((t) => {
      if (!t.parentId) return;
      map.set(t.parentId, [...(map.get(t.parentId) ?? []), t]);
    });
    return map;
  }, [ws.tasks]);

  const groups = STATUS_ORDER
    .map((s) => ({ ...s, tasks: myTasks.filter((t) => t.status === s.id) }))
    .filter((g) => g.tasks.length > 0);

  // How many tasks each row's follow-up chain spans. Built once per render
  // by grouping tasks into lineages, rather than walking the chain per row.
  const chainSizes = useMemo(() => {
    const parentOf = (t: Task) =>
      (t.deps ?? []).find((d) => d.type === "followup")?.refId ?? null;
    const byId = new Map(ws.tasks.map((t) => [t.id, t]));

    // Walk each task up to its lineage root, then count members per root.
    const rootOf = new Map<string, string>();
    const resolveRoot = (t: Task): string => {
      const cached = rootOf.get(t.id);
      if (cached) return cached;
      const seen = new Set<string>([t.id]);
      let cur = t;
      while (true) {
        const pid = parentOf(cur);
        const prev = pid ? byId.get(pid) : undefined;
        if (!prev || seen.has(prev.id)) break; // cycle-safe
        seen.add(prev.id);
        cur = prev;
      }
      seen.forEach((id) => rootOf.set(id, cur.id));
      return cur.id;
    };

    const perRoot = new Map<string, number>();
    ws.tasks.forEach((t) => {
      const root = resolveRoot(t);
      perRoot.set(root, (perRoot.get(root) ?? 0) + 1);
    });
    return new Map(ws.tasks.map((t) => [t.id, perRoot.get(resolveRoot(t)) ?? 1]));
  }, [ws.tasks]);

  return (
    <div className="space-y-5">
      {groups.map((g) => (
        <div key={g.id}>
          <div className="mb-2 flex items-center gap-2 px-1">
            <span className="size-2 shrink-0 rounded-full" style={{ background: `var(${g.var})` }} />
            <span className="font-mono text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-soft)]">
              {g.label}
            </span>
            <span className="text-muted-foreground/70 font-mono text-[11px]">{g.tasks.length}</span>
          </div>
          <ul className="space-y-1.5">
            {g.tasks.map((t) => {
              const overdue = isOverdue(t);
              // A "followup" dep is provenance, not a blocking dependency —
              // it gets its own chain marker instead of inflating this count.
              const nDeps = (t.deps ?? []).filter((d) => d.type !== "followup").length;
              const nLinks = ws.products.filter((p) => (p.taskIds ?? []).includes(t.id)).length;
              const nRisks = ws.risks.filter((r) => (r.taskIds ?? []).includes(t.id)).length;
              const nCmt = (t.comments ?? []).length;
              const chainLen = chainSizes.get(t.id) ?? 1;
              const who = t.assignees ?? [];
              const selected = t.id === selId;
              return (
                <li key={t.id}>
                  <button
                    onClick={() => onSelect(t.id)}
                    onDoubleClick={() => onOpenTask(t)}
                    title="Double-click to open the full task card"
                    className={cn(
                      "flex w-full items-start gap-2.5 rounded-[var(--radius-md)] border px-3 py-2.5 text-left transition",
                      selected
                        ? "border-primary bg-primary/5"
                        : "hover:bg-[var(--paper-2)] border-transparent",
                    )}
                  >
                    <span
                      className="mt-1.5 size-1.5 shrink-0 rounded-full"
                      style={{ background: `var(${statusVarOf(t.status)})` }}
                      title={t.status}
                    />
                    <span className="min-w-0 flex-1">
                      <span className={cn(
                        "block truncate text-[13.5px] font-medium",
                        t.status === "done" && "text-muted-foreground line-through",
                      )}>
                        {t.title || "Untitled task"}
                      </span>
                      <span className="text-muted-foreground/80 mt-1 flex flex-wrap items-center gap-2 font-mono text-[11px]">
                        {everyone && who.length > 0 && (
                          <span className="truncate">
                            {who[0]}{who.length > 1 ? ` +${who.length - 1}` : ""}
                          </span>
                        )}
                        {t.end && (
                          <span className={cn(overdue && "font-bold text-[var(--t-red)]")}>
                            {fmtD(t.end)}
                          </span>
                        )}
                        {nDeps > 0 && <span className="inline-flex items-center gap-0.5"><Link2 className="size-3" />{nDeps}</span>}
                        {nLinks > 0 && <span className="inline-flex items-center gap-0.5"><Package className="size-3" />{nLinks}</span>}
                        {nRisks > 0 && <span className="inline-flex items-center gap-0.5 text-[var(--t-red)]"><ShieldAlert className="size-3" />{nRisks}</span>}
                        {nCmt > 0 && <span className="inline-flex items-center gap-0.5"><MessageSquare className="size-3" />{nCmt}</span>}
                        {chainLen > 1 && (
                          <span
                            className="inline-flex items-center gap-0.5 text-[var(--accent-c)]"
                            title={`Part of a follow-up chain of ${chainLen} tasks`}
                          >
                            <GitBranch className="size-3" />{chainLen}
                          </span>
                        )}
                      </span>
                    </span>
                  </button>

                  {/* Subtasks nested under their parent, so the list shows the
                      work breakdown rather than only top-level rows. */}
                  {subsByParent.get(t.id)?.length ? (
                    <ul className="mt-1 space-y-0.5 pl-6">
                      {subsByParent.get(t.id)!.map((s) => (
                        <li key={s.id} className="flex items-center gap-2 rounded-[var(--radius-sm)] py-1 pl-1 pr-2">
                          <button
                            onClick={() => onToggleSub(s)}
                            className={cn(
                              "flex size-3.5 shrink-0 items-center justify-center rounded-full border transition",
                              s.status === "done"
                                ? "border-[var(--hue-done)] bg-[var(--hue-done)] text-white"
                                : "border-[var(--line-strong)] hover:border-primary",
                            )}
                            title={s.status === "done" ? "Mark as to do" : "Mark as done"}
                          >
                            {s.status === "done" && <Check className="size-2" strokeWidth={3} />}
                          </button>
                          <span className={cn(
                            "min-w-0 flex-1 truncate text-[12.5px]",
                            s.status === "done" && "text-muted-foreground line-through",
                          )}>
                            {s.title || "Untitled subtask"}
                          </span>
                          {s.end && (
                            <span className="text-muted-foreground/80 shrink-0 font-mono text-[11px]">
                              {fmtD(s.end)}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

// ── timeline mode: a personal gantt ──────────────────────────────────────────

function WSTimeline({ ws, myTasks, selId, onSelect }: {
  ws: WorkingSet; myTasks: Task[]; selId: string | null; onSelect: (id: string) => void;
}) {
  const dated = myTasks.filter((t) => t.start && t.end);
  const undated = myTasks.filter((t) => !t.start || !t.end);

  if (dated.length === 0) {
    return (
      <div className="shadow-xs rounded-[var(--radius-lg)] border bg-[var(--panel)] p-10 text-center">
        <GitBranch className="text-muted-foreground/40 mx-auto mb-3 size-7" />
        <p className="font-serif-display text-[17px] font-medium">No scheduled tasks</p>
        <p className="text-muted-foreground mt-1 text-[13.5px]">
          Add start and end dates to see them on the timeline.
        </p>
        {undated.length > 0 && (
          <div className="mt-5 flex flex-wrap justify-center gap-1.5">
            {undated.map((t) => (
              <button
                key={t.id}
                onClick={() => onSelect(t.id)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[12.5px] transition",
                  t.id === selId ? "border-primary bg-primary/10 text-primary" : "hover:bg-[var(--paper-2)]",
                )}
              >
                {t.title || "Untitled task"}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  const minStr = dated.reduce((m, t) => (t.start < m ? t.start : m), dated[0].start);
  const maxStr = dated.reduce((m, t) => (t.end > m ? t.end : m), dated[0].end);
  const totalDays = Math.max(1, daysBetween(minStr, maxStr));
  const totalW = totalDays * DAYW;
  const LABEL_W = 200;
  const today = todayStr();
  const todayLeft = today >= minStr && today <= maxStr ? daysBetween(minStr, today) * DAYW : null;

  // month ticks across the span
  const months: { left: number; label: string }[] = [];
  const cur = new Date(minStr);
  cur.setDate(1);
  const end = new Date(maxStr);
  while (cur <= end) {
    const iso = cur.toISOString().slice(0, 10);
    if (iso >= minStr) {
      months.push({
        left: daysBetween(minStr, iso) * DAYW,
        label: cur.toLocaleDateString("en-GB", { month: "short", year: "2-digit" }),
      });
    }
    cur.setMonth(cur.getMonth() + 1);
  }

  return (
    <div className="space-y-3">
      <div className="shadow-xs overflow-x-auto rounded-[var(--radius-lg)] border bg-[var(--panel)]">
        <div className="relative" style={{ minWidth: LABEL_W + totalW }}>
          {/* axis */}
          <div className="sticky top-0 z-20 flex border-b bg-[var(--paper-2)]">
            <div
              className="sticky left-0 z-10 shrink-0 border-r bg-[var(--paper-2)] px-4 py-2.5 font-mono text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-soft)]"
              style={{ width: LABEL_W }}
            >
              Task
            </div>
            <div className="relative flex-1" style={{ width: totalW, height: 38 }}>
              {months.map((m, i) => (
                <span
                  key={i}
                  className="text-muted-foreground absolute top-2.5 whitespace-nowrap border-l pl-2 font-mono text-[11px]"
                  style={{ left: m.left }}
                >
                  {m.label}
                </span>
              ))}
            </div>
          </div>

          {/* rows */}
          <div className="relative">
            {todayLeft !== null && (
              <div
                className="border-primary pointer-events-none absolute bottom-0 top-0 z-10 border-l-[2px]"
                style={{ left: LABEL_W + todayLeft }}
                title="Today"
              />
            )}
            {dated.map((t) => {
              const cat = ws.categories.find((c) => c.id === t.category);
              const barVar = cat ? accentVar(cat.color) : "var(--accent-c)";
              const left = daysBetween(minStr, t.start) * DAYW;
              const width = Math.max(DAYW, daysBetween(t.start, t.end) * DAYW);
              const overdue = isOverdue(t);
              return (
                <button
                  key={t.id}
                  onClick={() => onSelect(t.id)}
                  className={cn(
                    "flex w-full border-b text-left transition last:border-b-0",
                    t.id === selId ? "bg-primary/5" : "hover:bg-[var(--paper-2)]",
                  )}
                  style={{ height: 34 }}
                >
                  <span
                    className={cn(
                      "sticky left-0 z-10 flex shrink-0 items-center truncate border-r bg-[var(--panel)] px-4 text-[12.5px]",
                      t.id === selId && "bg-primary/5",
                    )}
                    style={{ width: LABEL_W }}
                  >
                    {t.title || "Untitled task"}
                  </span>
                  <span className="relative flex-1" style={{ width: totalW }}>
                    <span
                      className={cn(
                        "absolute top-[7px] flex h-[20px] items-center overflow-hidden rounded-[5px] px-2",
                        t.status === "done" && "opacity-50",
                        overdue && "ring-1 ring-[var(--t-red)]",
                      )}
                      style={{
                        left, width,
                        background: `color-mix(in oklch, ${barVar} 88%, white)`,
                      }}
                      title={`${t.title} · ${fmtD(t.start)} → ${fmtD(t.end)}${overdue ? " · overdue" : ""}`}
                    >
                      <span className="truncate text-[11px] font-semibold text-white [text-shadow:0_1px_2px_rgba(0,0,0,.2)]">
                        {width > 40 ? t.title : ""}
                      </span>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {undated.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-muted-foreground font-mono text-[11px] font-semibold uppercase tracking-wide">
            Undated
          </span>
          {undated.map((t) => (
            <button
              key={t.id}
              onClick={() => onSelect(t.id)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-[12.5px] transition",
                t.id === selId ? "border-primary bg-primary/10 text-primary" : "hover:bg-[var(--paper-2)]",
              )}
            >
              {t.title || "Untitled task"}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── module ───────────────────────────────────────────────────────────────────

export function WorkspaceModule({ projectId }: { projectId: string }) {
  const { data: ws } = useProject(projectId);
  const updateTask = useUpdateEntity(projectId, "tasks");
  const [who, setWho] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>(() => {
    if (typeof window === "undefined") return "focus";
    try {
      const m = window.localStorage.getItem(MODE_KEY);
      return m === "focus" || m === "timeline" ? m : "focus";
    } catch {
      return "focus";
    }
  });
  const [selId, setSelId] = useState<string | null>(null);
  const [openTask, setOpenTask] = useState<Task | null>(null);

  // The default person depends on loaded data (it must not land on an empty
  // view), so it's resolved during render rather than in an effect: `who`
  // stays null until the user picks someone, and `activeWho` fills in the
  // saved-or-derived default in the meantime.
  const activeWho = useMemo(() => {
    if (who !== null) return who;
    if (!ws) return EVERYONE;
    let savedWho: string | null = null;
    try {
      savedWho = window.localStorage.getItem(`${WHO_KEY}.${projectId}`);
    } catch { /* best-effort */ }

    const names = new Set(peopleOf(ws).map((m) => m.name));
    const hasTasks = (name: string) =>
      ws.tasks.some((t) => !t.parentId && (t.assignees ?? []).includes(name));

    // saved person → "You" if they actually have tasks → Everyone. A saved
    // person who has since lost all their tasks falls through too, so a
    // restored selection can't drop you on an empty view either.
    if (savedWho === EVERYONE) return EVERYONE;
    if (savedWho && names.has(savedWho) && hasTasks(savedWho)) return savedWho;
    if (names.has("You") && hasTasks("You")) return "You";
    return EVERYONE;
  }, [who, ws, projectId]);

  function toggleSubtask(sub: Task) {
    updateTask.mutate(
      { id: sub.id, data: { status: sub.status === "done" ? "backlog" : "done" } },
      { onError: (e) => toast.error((e as Error).message) },
    );
  }

  function changeWho(v: string) {
    setWho(v);
    setSelId(null);
    try { window.localStorage.setItem(`${WHO_KEY}.${projectId}`, v); } catch { /* best-effort */ }
  }
  function changeMode(v: Mode) {
    setMode(v);
    try { window.localStorage.setItem(MODE_KEY, v); } catch { /* best-effort */ }
  }

  const everyone = activeWho === EVERYONE;

  const myTasks = useMemo(() => {
    if (!ws) return [];
    const top = ws.tasks.filter((t) => !t.parentId);
    return everyone ? top : top.filter((t) => (t.assignees ?? []).includes(activeWho));
  }, [ws, activeWho, everyone]);

  if (!ws) return null;

  const selTask = myTasks.find((t) => t.id === selId) ?? myTasks[0] ?? null;
  const member = peopleOf(ws).find((m) => m.name === activeWho);

  return (
    <div>
      <ModuleHeader eyebrow="Overview" title="Workspace" />

      {/* ws-bar */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          {everyone ? (
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--paper-2)]">
              <Globe className="text-muted-foreground size-4" />
            </span>
          ) : (
            <Avatar name={activeWho} member={member} size={32} />
          )}
          <select
            value={activeWho}
            onChange={(e) => changeWho(e.target.value)}
            className="focus:border-primary h-10 rounded-[var(--radius-sm)] border bg-[var(--panel)] px-3 text-[14px] outline-none"
            aria-label="Show tasks for"
          >
            <option value={EVERYONE}>Everyone — all tasks</option>
            {peopleOf(ws).map((m) => <option key={m.id} value={m.name}>{m.name}</option>)}
          </select>
          <p className="text-muted-foreground hidden min-w-0 truncate text-[13.5px] md:block">
            {everyone
              ? "Every task and everything tied to it, in one place."
              : `${activeWho}'s tasks and everything needed to do them — in one place.`}
          </p>
        </div>

        {/* seg-toggle */}
        <div className="flex shrink-0 gap-1 rounded-[var(--radius-sm)] border bg-[var(--paper-2)] p-1">
          {([
            { id: "focus" as const, label: "Focus", Icon: Layers },
            { id: "timeline" as const, label: "Timeline", Icon: GitBranch },
          ]).map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => changeMode(id)}
              className={cn(
                "flex items-center gap-2 rounded-[6px] px-3.5 py-1.5 text-[13px] font-semibold transition",
                mode === id ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-3.5" /> {label}
            </button>
          ))}
        </div>
      </div>

      {myTasks.length === 0 ? (
        <div className="shadow-xs rounded-[var(--radius-lg)] border bg-[var(--panel)] p-12 text-center">
          <Layers className="text-muted-foreground/40 mx-auto mb-3 size-7" />
          <p className="font-serif-display text-[17px] font-medium">
            {everyone ? "No tasks yet" : `Nothing assigned to ${activeWho}`}
          </p>
          <p className="text-muted-foreground mt-1 text-[13.5px]">
            {everyone
              ? "Add tasks from the Tasks page to see them here."
              : "Assign them on a task card and it'll show up here."}
          </p>
        </div>
      ) : mode === "focus" ? (
        <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
          <div className="lg:max-h-[calc(100dvh-16rem)] lg:overflow-y-auto lg:pr-1">
            <WSList
              ws={ws} myTasks={myTasks} selId={selTask?.id ?? null}
              everyone={everyone} onSelect={setSelId}
              onToggleSub={toggleSubtask} onOpenTask={setOpenTask}
            />
          </div>
          <div className="min-w-0">
            {selTask && (
              <WSHub task={selTask} ws={ws} projectId={projectId} onOpenTask={setOpenTask} onSelectTask={setSelId} />
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <WSTimeline ws={ws} myTasks={myTasks} selId={selTask?.id ?? null} onSelect={setSelId} />
          {selTask && (
            <WSHub task={selTask} ws={ws} projectId={projectId} wide onOpenTask={setOpenTask} onSelectTask={setSelId} />
          )}
        </div>
      )}

      {openTask && (
        <CardModal
          ws={ws}
          projectId={projectId}
          task={openTask}
          open
          onOpenChange={(v) => { if (!v) setOpenTask(null); }}
        />
      )}
    </div>
  );
}
