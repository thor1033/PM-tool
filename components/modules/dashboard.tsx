"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useMemo, useState } from "react";
import {
  TriangleAlert,
  Sparkles,
  ArrowRight,
  Users,
  ChevronDown,
  Link2,
} from "lucide-react";
import { useProject, useUpdateProject } from "@/lib/api/hooks";
import { accent, accentVar } from "@/lib/colors";
import { computeHealth, attentionList } from "@/lib/project-health";
import { cn } from "@/lib/utils";
import type { Task, WorkingSet } from "@/lib/types";
import { DigestFeed } from "@/components/modules/dashboard-digest";
import { HealthStrip, AttentionList } from "@/components/modules/dashboard-health";

/* The overview answers four questions, in this order: are we OK (health
 * strip), what needs me (attention list), what's moving (road ahead and the
 * digest), and then the supporting detail. Everything below the fold is
 * reference; everything above it is a decision. */

// ── helpers ──────────────────────────────────────────────────────────────────

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function fmtD(d: string) {
  if (!d) return "";
  const dt = new Date(d);
  return dt.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function assigneesOf(t: Task): string[] {
  return t.assignees ?? [];
}

// ── stat helper for dependency chips ─────────────────────────────────────────

interface DepStatus {
  needId: string;
  name: string;
  blocked: boolean;
  external: boolean;
}

function depsOf(task: Task, tasks: Task[]): DepStatus[] {
  return (task.deps ?? []).map((d) => {
    if (d.type === "external") {
      return { needId: d.id, name: d.label || "External dependency", blocked: false, external: true };
    }
    const pred = tasks.find((t) => t.id === d.refId);
    if (!pred) return { needId: d.id, name: d.label || "Unknown", blocked: false, external: false };
    return { needId: d.id, name: pred.title, blocked: pred.status !== "done", external: false };
  });
}

// ── view switcher ────────────────────────────────────────────────────────────

/** Inline rather than a 260px card: it's a control, not content, and at card
 *  weight it claimed as much of the fold as the project's own summary. */
function ViewSwitch({
  people,
  who,
  onChange,
}: {
  people: string[];
  who: string;
  onChange: (v: string) => void;
}) {
  const personal = !!who;
  return (
    <div className="focus-within:border-primary focus-within:ring-primary/20 relative flex shrink-0 items-center gap-2 rounded-full border bg-[var(--panel)] py-1.5 pl-1.5 pr-2.5 transition focus-within:ring-2">
      {personal ? (
        <span className="bg-foreground text-background flex size-[24px] shrink-0 items-center justify-center rounded-full text-[9.5px] font-bold">
          {initials(who)}
        </span>
      ) : (
        <span className="bg-primary/10 text-primary flex size-[24px] shrink-0 items-center justify-center rounded-full">
          <Users className="size-3.5" />
        </span>
      )}
      <select
        value={who}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Whose work to show"
        className="min-w-0 cursor-pointer appearance-none bg-transparent pr-1 text-[13px] font-semibold outline-none"
      >
        <option value="">Everyone&rsquo;s work</option>
        {people.length > 0 && <option disabled>──────────</option>}
        {people.map((p) => (
          <option key={p} value={p}>
            {p} — personal
          </option>
        ))}
      </select>
      <ChevronDown className="text-muted-foreground pointer-events-none size-3.5 shrink-0" />
    </div>
  );
}

// ── command bar ("Update the plan") ─────────────────────────────────────────

/** Collapsed to a single line until focused. It's a first-class feature, but
 *  as a permanent four-row form it pushed the project's actual state below
 *  the fold — an overview should open on what is true, not on an input. */
function CommandBar({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);

  function submit() {
    const v = text.trim();
    if (v) sessionStorage.setItem(`plan_draft_${projectId}`, v);
    router.push(`/projects/${projectId}/plan`);
  }

  return (
    <section className="border-primary/30 bg-card shadow-xs mb-4 rounded-[16px] border p-2.5">
      <div className="flex items-center gap-2.5">
        <span className="bg-primary/10 text-primary ml-1 flex size-7 shrink-0 items-center justify-center rounded-[8px]">
          <Sparkles className="size-4" />
        </span>
        <textarea
          rows={open ? 3 : 1}
          value={text}
          onFocus={() => setOpen(true)}
          onBlur={() => !text.trim() && setOpen(false)}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
            if (e.key === "Enter" && !e.shiftKey && !open) e.preventDefault();
          }}
          placeholder="Tell it what happened — status changes, delays, new risks, dates…"
          className="min-w-0 flex-1 resize-none bg-transparent py-1.5 text-[13.5px] leading-relaxed outline-none placeholder:text-muted-foreground/60"
        />
        <button
          onClick={submit}
          className="bg-primary text-primary-foreground hover:bg-[var(--accent-deep)] inline-flex shrink-0 items-center gap-1.5 self-end rounded-[var(--radius-sm)] px-3 py-1.5 text-[12.5px] font-semibold transition"
        >
          Update plan
        </button>
      </div>
      {open && (
        <p className="text-muted-foreground mt-1 pl-[42px] text-[11px]">
          ⌘/Ctrl + Enter to run · nothing changes until you approve it
        </p>
      )}
    </section>
  );
}

// ── panel shell ──────────────────────────────────────────────────────────────

function Panel({
  title,
  action,
  children,
  className,
  tone = "plain",
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** "lead" gives a panel more visual weight than its neighbours; used once,
   *  for the list the page most wants read. */
  tone?: "plain" | "lead";
}) {
  return (
    <section
      className={cn(
        "bg-card shadow-xs rounded-2xl border p-5",
        tone === "lead" && "border-[var(--line-strong)] shadow-sm",
        className,
      )}
    >
      <div className="mb-3.5 flex items-center justify-between gap-3">
        <span className={cn("font-bold tracking-tight", tone === "lead" ? "text-[14px]" : "text-[13px]")}>
          {title}
        </span>
        {action}
      </div>
      {children}
    </section>
  );
}

function PanelLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-[12px] font-semibold transition"
    >
      {label} <ArrowRight className="size-3" />
    </Link>
  );
}

function DashEmpty({ children }: { children: React.ReactNode }) {
  return <p className="text-muted-foreground py-3 text-[13px] leading-relaxed">{children}</p>;
}

// ── road-ahead timeline ──────────────────────────────────────────────────────

function RoadAhead({
  viewTasks,
  tasks,
  milestones,
  categories,
  onOpen,
  projectId,
}: {
  viewTasks: Task[];
  tasks: Task[];
  milestones: WorkingSet["milestones"];
  categories: WorkingSet["categories"];
  onOpen: (t: Task) => void;
  projectId: string;
}) {
  const DAYMS = 86_400_000;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const upcoming = useMemo(
    () =>
      viewTasks
        .filter((t) => t.status !== "done" && t.start && t.end && new Date(t.end) >= today)
        .sort((a, b) => +new Date(a.start) - +new Date(b.start))
        .slice(0, 6),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [viewTasks],
  );

  const futureMs = useMemo(
    () => milestones.filter((m) => m.date && new Date(m.date) >= today),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [milestones],
  );

  if (!upcoming.length && !futureMs.length) {
    return (
      <Panel
        title="The road ahead"
        action={<PanelLink href={`/projects/${projectId}/actions`} label="Timeline" />}
      >
        <DashEmpty>Nothing scheduled ahead. Add dates to tasks or milestones to see them here.</DashEmpty>
      </Panel>
    );
  }

  let min = Infinity;
  let max = -Infinity;
  upcoming.forEach((t) => {
    min = Math.min(min, +new Date(t.start));
    max = Math.max(max, +new Date(t.end));
  });
  futureMs.forEach((m) => {
    min = Math.min(min, +new Date(m.date));
    max = Math.max(max, +new Date(m.date));
  });
  min = Math.min(min, +today);
  max = Math.max(max, +today + 7 * DAYMS);
  const span = Math.max(1, (max - min) / DAYMS);
  const pct = (d: string) => ((+new Date(d) - min) / DAYMS / span) * 100;
  const todayPct = ((+today - min) / DAYMS / span) * 100;
  const catColor = (id: string | null) => accentVar(categories.find((x) => x.id === id)?.color);

  const ticks: { label: string; left: number }[] = [];
  const cur = new Date(min);
  cur.setDate(1);
  while (+cur <= max) {
    ticks.push({
      label: cur.toLocaleDateString("en-GB", { month: "short" }),
      left: ((+cur - min) / DAYMS / span) * 100,
    });
    cur.setMonth(cur.getMonth() + 1);
  }

  const gates = futureMs.filter((m) => m.type === "gate");
  const miles = futureMs.filter((m) => m.type !== "gate");

  return (
    <Panel
      title="The road ahead"
      action={<PanelLink href={`/projects/${projectId}/actions`} label="Timeline" />}
      className="overflow-hidden"
    >
      <div className="relative mb-1.5 ml-[140px] h-[18px] border-b">
        {ticks.map(
          (tk, i) =>
            tk.left >= 0 &&
            tk.left <= 100 && (
              <span
                key={i}
                className="font-mono text-muted-foreground/70 absolute top-0 translate-x-0.5 text-[10px]"
                style={{ left: `${tk.left}%` }}
              >
                {tk.label}
              </span>
            ),
        )}
        {todayPct >= 0 && todayPct <= 100 && (
          <span className="border-primary absolute -top-1 bottom-0 z-[4] border-l-2" style={{ left: `${todayPct}%` }}>
            <span className="bg-primary text-primary-foreground absolute -top-0.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wide">
              Today
            </span>
          </span>
        )}
      </div>

      <div className="relative flex flex-col gap-[3px]">
        {todayPct >= 0 && todayPct <= 100 && (
          <div className="pointer-events-none absolute bottom-0 left-[140px] right-0 top-0 z-0">
            <span className="border-primary absolute bottom-0 top-0 border-l-2" style={{ left: `${todayPct}%` }} />
          </div>
        )}
        {upcoming.map((t) => {
          const left = Math.max(0, pct(t.start));
          const width = Math.max(2.5, pct(t.end) - pct(t.start));
          const blockers = depsOf(t, tasks).filter((d) => d.blocked && !d.external);
          return (
            <div
              key={t.id}
              onClick={() => onOpen(t)}
              className="grid cursor-pointer grid-cols-[140px_1fr] items-center rounded-[var(--radius-sm)] px-1.5 py-1 transition hover:bg-[var(--paper-2)]"
            >
              <div className="flex min-w-0 items-center gap-1.5 pr-3">
                <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">{t.title}</span>
                {blockers.length > 0 && (
                  <TriangleAlert
                    className="size-3 shrink-0 text-[var(--t-red)]"
                    aria-label={`Blocked: waiting on ${blockers.map((b) => b.name).join(", ")}`}
                  />
                )}
              </div>
              <div className="relative h-5">
                <span
                  className={cn(
                    "absolute top-0.5 flex h-4 min-w-0 items-center overflow-hidden rounded",
                    t.status === "inprogress"
                      ? "bg-[var(--hue-progress)]"
                      : "bg-[color-mix(in_oklch,var(--hue-progress)_22%,var(--panel))]",
                  )}
                  style={{ left: `${left}%`, width: `${width}%` }}
                  title={`${t.title} · ${fmtD(t.start)} → ${fmtD(t.end)}`}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="text-muted-foreground mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t pt-2.5 text-[11px]">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-4 rounded-[2px] bg-[var(--hue-progress)]" /> In progress
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-4 rounded-[2px] bg-[color-mix(in_oklch,var(--hue-progress)_22%,var(--panel))]" /> Scheduled
        </span>
        {(gates.length > 0 || miles.length > 0) && (
          <span className="inline-flex items-center gap-1.5">
            {miles.length} milestone{miles.length === 1 ? "" : "s"} ahead
            {gates.length > 0 && ` · ${gates.length} gate${gates.length === 1 ? "" : "s"}`}
          </span>
        )}
      </div>
    </Panel>
  );
}

// ── purpose ─────────────────────────────────────────────────────────────────

/** The project's business purpose, editable in place. Writes to the same
 *  `businessCase.purpose` the Business case page edits, so the two stay in
 *  sync through the shared working-set cache. */
function PurposeLine({ projectId, businessCase }: {
  projectId: string; businessCase: Record<string, unknown> | null;
}) {
  const update = useUpdateProject(projectId);
  const purpose = (businessCase as { purpose?: string } | null)?.purpose ?? "";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(purpose);

  function commit() {
    setEditing(false);
    const next = draft.trim();
    if (next === purpose) return;
    update.mutate(
      { businessCase: { ...(businessCase ?? {}), purpose: next } },
      { onError: (e) => toast.error((e as Error).message) },
    );
  }

  if (editing) {
    return (
      <textarea
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commit(); }
          if (e.key === "Escape") { setDraft(purpose); setEditing(false); }
        }}
        rows={2}
        placeholder="What is this project for?"
        className="font-serif-display focus:border-primary mt-1.5 w-full max-w-[620px] resize-y rounded-[var(--radius-sm)] border bg-[var(--panel)] px-3 py-2 text-[15px] leading-[1.5] outline-none"
      />
    );
  }

  return (
    <p
      onDoubleClick={() => { setDraft(purpose); setEditing(true); }}
      title="Double-click to edit"
      className={cn(
        "font-serif-display -mx-1 mt-1.5 max-w-[620px] cursor-text rounded-[var(--radius-sm)] px-1 text-[15px] leading-[1.5] transition hover:bg-[var(--paper-2)]",
        purpose ? "text-muted-foreground" : "text-muted-foreground/60 italic",
      )}
    >
      {purpose || "Add a business purpose to summarise this project here."}
    </p>
  );
}

// ── module ────────────────────────────────────────────────────────────────────

export function DashboardModule({ projectId }: { projectId: string }) {
  const { data } = useProject(projectId);
  const [openTask, setOpenTask] = useState<Task | null>(null);
  const [who, setWho] = useState("");

  // Every hook runs before the loading guard below. These used to sit after
  // an early `return null`, which changes hook order between renders as soon
  // as the query resolves.
  const members = data?.members;
  const people = useMemo(
    () => [...new Set((members ?? []).map((m) => m.name).filter((n) => n && n !== "You"))]
      .sort((a, b) => a.localeCompare(b)),
    [members],
  );

  const tasks = useMemo(() => data?.tasks ?? [], [data]);
  const risks = useMemo(() => data?.risks ?? [], [data]);
  const personal = !!who && people.includes(who);

  const viewTasks = useMemo(
    () => (personal ? tasks.filter((t) => assigneesOf(t).includes(who)) : tasks),
    [personal, tasks, who],
  );
  const viewRisks = useMemo(
    () => (personal
      ? risks.filter((r) => (r.taskIds ?? []).some((id) => viewTasks.some((t) => t.id === id)))
      : risks),
    [personal, risks, viewTasks],
  );

  const health = useMemo(() => computeHealth(viewTasks, tasks), [viewTasks, tasks]);
  const attention = useMemo(
    () => attentionList(viewTasks, tasks, viewRisks),
    [viewTasks, tasks, viewRisks],
  );

  const depTasks = useMemo(
    () => viewTasks.filter((t) => (t.deps ?? []).length && t.status !== "done"),
    [viewTasks],
  );

  const LVL: Record<string, number> = useMemo(() => ({ low: 1, med: 2, high: 3 }), []);
  const topRisks = useMemo(
    () => [...viewRisks]
      .sort((a, b) => LVL[b.likelihood] * LVL[b.impact] - LVL[a.likelihood] * LVL[a.impact])
      .slice(0, 5),
    [viewRisks, LVL],
  );

  if (!data) return null;
  const { project, milestones, categories } = data;
  const firstName = personal ? who.split(/\s+/)[0] : "";

  let extCount = 0;
  depTasks.forEach((t) => {
    depsOf(t, tasks).forEach((d) => { if (d.external) extCount++; });
  });

  return (
    <div>
      {/* Masthead — identity and scope, compressed so the numbers below sit
          within the first screen rather than under it. */}
      <section className="mb-4 flex flex-wrap items-start justify-between gap-4 pt-1">
        <div className="min-w-0 flex-1">
          <p className="eyebrow mb-2">{personal ? "Personal view" : "Project overview"}</p>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="font-serif-display text-[30px] font-medium leading-[1.15] tracking-[-0.02em]">
              {project.name}
            </h1>
            {project.code && (
              <span className="text-muted-foreground font-mono text-[12px] tracking-wide">{project.code}</span>
            )}
          </div>
          <PurposeLine
            projectId={projectId}
            businessCase={project.businessCase as Record<string, unknown> | null}
          />
          {personal && (
            <p className="text-muted-foreground mt-1.5 text-[12.5px] italic">
              Only {who}&rsquo;s tasks, and the risks on work they&rsquo;re assigned to.
            </p>
          )}
        </div>
        <ViewSwitch people={people} who={who} onChange={setWho} />
      </section>

      <HealthStrip health={health} projectId={projectId} />

      {/* The page's lead: one ranked list replacing the old scatter of
          warning triangles, a risk panel and a dependency grid. */}
      <Panel
        title={personal ? `What needs ${firstName}` : "Needs attention"}
        tone="lead"
        action={<PanelLink href={`/projects/${projectId}/actions`} label="All tasks" />}
        className="mb-4"
      >
        <AttentionList items={attention} categories={categories} onOpen={setOpenTask} />
      </Panel>

      <CommandBar projectId={projectId} />

      <div className="mb-4 grid items-start gap-4 lg:grid-cols-2">
        <RoadAhead
          viewTasks={viewTasks}
          tasks={tasks}
          milestones={milestones}
          categories={categories}
          onOpen={setOpenTask}
          projectId={projectId}
        />

        <Panel
          title="What's happened"
          action={<PanelLink href={`/projects/${projectId}/audit`} label="Full history" />}
        >
          <DigestFeed
            projectId={projectId}
            tasks={tasks}
            milestones={milestones}
            categories={categories}
            onOpenTask={(taskId) => {
              const t = tasks.find((x) => x.id === taskId);
              if (t) setOpenTask(t);
            }}
          />
        </Panel>
      </div>

      <div className="mb-4 grid items-start gap-4 lg:grid-cols-2">
        <Panel
          title={personal ? `${firstName}'s risks` : "Top risks"}
          action={<PanelLink href={`/projects/${projectId}/risks`} label="All risks" />}
        >
          <div className="-mx-1.5 flex flex-col">
            {topRisks.length === 0 && (
              <DashEmpty>{personal ? "No risks linked to their tasks." : "No risks captured yet."}</DashEmpty>
            )}
            {topRisks.map((r) => {
              const score = LVL[r.likelihood] * LVL[r.impact];
              const tone = score >= 6 ? "var(--t-red)" : score >= 3 ? "var(--t-amber)" : "var(--t-green)";
              return (
                <Link
                  key={r.id}
                  href={`/projects/${projectId}/risks`}
                  className="flex items-center gap-2.5 rounded-[var(--radius-sm)] px-1.5 py-[6px] text-[13px] transition hover:bg-[var(--paper-2)]"
                >
                  <span
                    className="flex size-[22px] shrink-0 items-center justify-center rounded-md text-[10.5px] font-bold"
                    style={{
                      color: `color-mix(in oklch, ${tone} 74%, var(--ink))`,
                      background: `color-mix(in oklch, ${tone} 14%, var(--panel))`,
                    }}
                    title={`Likelihood ${r.likelihood} × impact ${r.impact}`}
                  >
                    {score}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{r.title}</span>
                </Link>
              );
            })}
          </div>
        </Panel>

        <Panel
          title="Dependencies"
          action={
            extCount > 0 ? (
              <span className="text-muted-foreground inline-flex items-center gap-1.5 text-[11.5px] font-semibold">
                <Link2 className="size-3" /> {extCount} external
              </span>
            ) : undefined
          }
        >
          {depTasks.length === 0 ? (
            <DashEmpty>
              {personal ? "None of their tasks have open dependencies." : "No open dependencies."}
            </DashEmpty>
          ) : (
            <div className="-mx-1.5 flex flex-col">
              {depTasks.slice(0, 6).map((t) => (
                <div
                  key={t.id}
                  onClick={() => setOpenTask(t)}
                  className="cursor-pointer rounded-[var(--radius-sm)] px-1.5 py-[7px] transition hover:bg-[var(--paper-2)]"
                >
                  <div className="mb-1 truncate text-[13px] font-medium">{t.title}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {depsOf(t, tasks).map((d) => (
                      <span
                        key={d.needId}
                        className={cn(
                          "inline-flex max-w-full items-center gap-1 truncate rounded-md border px-1.5 py-0.5 text-[11px] font-medium",
                          d.blocked
                            ? "border-[color-mix(in_oklch,var(--t-red)_30%,transparent)] bg-[color-mix(in_oklch,var(--t-red)_9%,var(--panel))] text-[color-mix(in_oklch,var(--t-red)_68%,var(--ink))]"
                            : d.external
                              ? "text-muted-foreground border-dashed"
                              : "border-[color-mix(in_oklch,var(--t-green)_28%,transparent)] bg-[color-mix(in_oklch,var(--t-green)_9%,var(--panel))] text-[color-mix(in_oklch,var(--t-green)_60%,var(--ink))]",
                        )}
                      >
                        {d.blocked && <TriangleAlert className="size-2.5 shrink-0" />}
                        {d.name}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
              {depTasks.length > 6 && (
                <p className="text-muted-foreground mt-1 px-1.5 text-[12px]">
                  and {depTasks.length - 6} more
                </p>
              )}
            </div>
          )}
        </Panel>
      </div>

      {openTask && (
        <TaskPeekDialog task={openTask} onClose={() => setOpenTask(null)} accent={accent} />
      )}
    </div>
  );
}

// ── minimal task peek (click-through from dashboard rows) ───────────────────

function TaskPeekDialog({
  task,
  onClose,
}: {
  task: Task;
  onClose: () => void;
  accent: typeof accent;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[oklch(0.22_0.02_285/0.42)] p-14 backdrop-blur-[3px]"
      onClick={onClose}
    >
      <div
        className="shadow-xl w-full max-w-lg rounded-[22px] bg-[var(--panel)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b p-5">
          <p className="eyebrow mb-1.5">Task</p>
          <h3 className="font-serif-display text-xl font-medium">{task.title}</h3>
        </div>
        {task.description && (
          <div className="p-5 text-sm leading-relaxed">{task.description}</div>
        )}
        <div className="flex justify-end gap-2 border-t bg-[var(--paper-2)] p-4">
          <button
            onClick={onClose}
            className="shadow-xs rounded-[var(--radius-sm)] border bg-[var(--panel)] px-3.5 py-2 text-[13px] font-semibold"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
