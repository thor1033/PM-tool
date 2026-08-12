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
import { cn } from "@/lib/utils";
import type { Task, WorkingSet } from "@/lib/types";
import { DigestFeed } from "@/components/modules/dashboard-digest";

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

const PRIO_COLOR: Record<string, string> = {
  high: "var(--t-red)",
  med: "var(--t-amber)",
  low: "var(--t-green)",
};

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

// ── view box ─────────────────────────────────────────────────────────────────

function ViewBox({
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
    <div className="bg-card shadow-xs w-64 shrink-0 self-start rounded-2xl border p-4">
      <p className="eyebrow mb-2.5">View</p>
      <div className="focus-within:border-primary focus-within:ring-primary/20 relative flex items-center gap-2.5 rounded-[var(--radius-md)] border bg-[var(--paper-2)] px-2.5 py-[7px] transition focus-within:ring-2">
        {personal ? (
          <span className="bg-foreground text-background flex size-[26px] shrink-0 items-center justify-center rounded-full text-[10px] font-bold">
            {initials(who)}
          </span>
        ) : (
          <span className="bg-primary/10 text-primary flex size-[26px] shrink-0 items-center justify-center rounded-full">
            <Users className="size-4" />
          </span>
        )}
        <select
          value={who}
          onChange={(e) => onChange(e.target.value)}
          className="min-w-0 flex-1 cursor-pointer appearance-none bg-transparent text-[13.5px] font-semibold outline-none"
        >
          <option value="">Project view — everything</option>
          {people.length > 0 && <option disabled>──────────</option>}
          {people.map((p) => (
            <option key={p} value={p}>
              {p} — personal
            </option>
          ))}
        </select>
        <ChevronDown className="text-muted-foreground pointer-events-none size-3.5 shrink-0" />
      </div>
      <p className="text-muted-foreground mt-2 text-[11.5px]">
        {personal ? "Only this person's work" : "Everyone's work"}
      </p>
    </div>
  );
}

// ── command bar ("Update the plan") ─────────────────────────────────────────

function CommandBar({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [text, setText] = useState("");

  function submit() {
    const v = text.trim();
    if (v) sessionStorage.setItem(`plan_draft_${projectId}`, v);
    router.push(`/projects/${projectId}/plan`);
  }

  return (
    <section className="border-primary/35 bg-card shadow-xs mb-5 rounded-[18px] border-[1.5px] p-5">
      <div className="mb-4 flex items-start gap-3">
        <div className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-[10px]">
          <Sparkles className="size-5" />
        </div>
        <div>
          <div className="text-[15px] font-bold">Update the plan</div>
          <div className="text-muted-foreground mt-0.5 max-w-xl text-[12.5px] leading-relaxed">
            Tell it what happened — status changes, delays, new risks, decisions, dates —
            and review the changes before anything is applied.
          </div>
        </div>
      </div>
      <div className="rounded-[var(--radius-md)] border bg-[var(--paper-2)] p-1">
        <textarea
          rows={4}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
          }}
          placeholder={
            'e.g. "Mark the API integration done, push everything else to next week, and log a risk about the vendor being slow to respond."'
          }
          className="box-border w-full resize-y bg-transparent px-3.5 py-3 text-[15px] leading-relaxed outline-none placeholder:text-muted-foreground/60"
        />
        <div className="flex items-center justify-between gap-3 px-2.5 pb-1.5 pt-1">
          <span className="text-muted-foreground text-[11.5px]">
            ⌘/Ctrl + Enter to run · nothing changes until you approve it
          </span>
          <button
            onClick={submit}
            className="bg-primary text-primary-foreground hover:bg-[var(--accent-deep)] inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] px-3.5 py-2 text-[13px] font-semibold transition"
          >
            <Sparkles className="size-3.5" /> Update plan
          </button>
        </div>
      </div>
    </section>
  );
}

// ── panel shell ──────────────────────────────────────────────────────────────

function Panel({
  title,
  action,
  children,
  className,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("bg-card shadow-xs rounded-2xl border p-5", className)}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <span className="text-[13px] font-bold tracking-tight">{title}</span>
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
        .slice(0, 8),
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
      <Panel title="Upcoming — the road ahead" className="mb-5">
        <DashEmpty>
          Nothing scheduled ahead. Add dates to tasks or milestones to see the road ahead.
        </DashEmpty>
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
  const catColor = (id: string | null) => {
    const c = categories.find((x) => x.id === id);
    return accentVar(c?.color);
  };

  const ticks: { label: string; left: number }[] = [];
  const cur = new Date(min);
  cur.setDate(1);
  while (+cur <= max) {
    ticks.push({ label: cur.toLocaleDateString("en-GB", { month: "short" }), left: ((+cur - min) / DAYMS / span) * 100 });
    cur.setMonth(cur.getMonth() + 1);
  }

  const gates = futureMs.filter((m) => m.type === "gate");
  const miles = futureMs.filter((m) => m.type !== "gate");
  const ownerOf: Record<string, string> = {};
  futureMs.forEach((m) => {
    const sameCat = upcoming.filter((t) => t.category && t.category === m.category);
    if (!sameCat.length) return;
    let best: Task | null = null;
    let bd = Infinity;
    sameCat.forEach((t) => {
      const d = Math.abs(+new Date(t.end) - +new Date(m.date));
      if (d < bd) {
        bd = d;
        best = t;
      }
    });
    if (best) ownerOf[m.id] = (best as Task).id;
  });

  return (
    <Panel
      title="Upcoming — the road ahead"
      action={<PanelLink href={`/projects/${projectId}/actions`} label="Full timeline" />}
      className="mb-5 overflow-hidden"
    >
      <div className="relative mb-1.5 ml-[190px] h-[22px] border-b">
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
        {gates.map(
          (m) =>
            pct(m.date) >= 0 &&
            pct(m.date) <= 100 && (
              <span
                key={m.id}
                className="absolute top-0.5 z-[3] -translate-x-1/2 text-[12px] leading-none text-[var(--t-red)]"
                title={`${m.title} (gate) — ${fmtD(m.date)}`}
              >
                ▐
              </span>
            ),
        )}
        {miles.map(
          (m) =>
            pct(m.date) >= 0 &&
            pct(m.date) <= 100 && (
              <span
                key={m.id}
                className="absolute top-0 z-[3] -translate-x-1/2 text-[13px] leading-none"
                style={{ left: `${pct(m.date)}%`, color: catColor(m.category) }}
                title={`${m.title} — ${fmtD(m.date)}`}
              >
                ◆
              </span>
            ),
        )}
        {todayPct >= 0 && todayPct <= 100 && (
          <span className="border-primary absolute -top-1 bottom-0 z-[4] border-l-[2.5px]" style={{ left: `${todayPct}%` }}>
            <span className="bg-primary text-primary-foreground absolute -top-0.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wide">
              Today
            </span>
          </span>
        )}
      </div>

      <div className="relative flex flex-col gap-[5px]">
        {todayPct >= 0 && todayPct <= 100 && (
          <div className="pointer-events-none absolute bottom-0 left-[190px] right-0 top-0 z-0">
            <span className="border-primary absolute bottom-0 top-0 border-l-[2.5px]" style={{ left: `${todayPct}%` }} />
          </div>
        )}
        {upcoming.map((t) => {
          const left = Math.max(0, pct(t.start));
          const width = Math.max(2.5, pct(t.end) - pct(t.start));
          const deps = depsOf(t, tasks);
          const blockers = deps.filter((d) => d.blocked && !d.external);
          const risky = blockers.length > 0;
          const rowGates = gates.filter((m) => ownerOf[m.id] === t.id);
          const rowMiles = miles.filter((m) => ownerOf[m.id] === t.id);
          return (
            <div
              key={t.id}
              onClick={() => onOpen(t)}
              className={cn(
                "grid cursor-pointer grid-cols-[190px_1fr] items-center gap-0 rounded-[var(--radius-sm)] px-1.5 py-[5px] transition hover:bg-[var(--paper-2)]",
                risky && "bg-[color-mix(in_oklch,var(--t-red)_5%,transparent)]",
              )}
            >
              <div className="flex min-w-0 items-center gap-1.5 pr-3">
                <span className="size-[7px] shrink-0 rounded-full" style={{ background: PRIO_COLOR[t.priority] }} />
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{t.title}</span>
                {risky && (
                  <span
                    className="inline-flex shrink-0 items-center gap-0.5 text-[10.5px] font-bold text-[var(--t-red)]"
                    title={`Waiting on: ${blockers.map((b) => b.name).join(", ")}`}
                  >
                    <TriangleAlert className="size-3" /> {blockers.length}
                  </span>
                )}
              </div>
              <div className="relative h-6">
                <span
                  className={cn(
                    "absolute top-0.5 flex h-5 min-w-0 items-center overflow-hidden rounded-md border",
                    t.status === "inprogress"
                      ? "bg-primary border-primary"
                      : "border-primary/35 bg-[color-mix(in_oklch,var(--accent-c)_20%,var(--panel))]",
                  )}
                  style={{ left: `${left}%`, width: `${width}%` }}
                >
                  <span
                    className={cn(
                      "whitespace-nowrap px-1.5 font-mono text-[9.5px] pointer-events-none",
                      t.status === "inprogress" ? "text-primary-foreground" : "text-[var(--accent-deep)]",
                    )}
                  >
                    {fmtD(t.start)} → {fmtD(t.end)}
                  </span>
                </span>
                {rowGates.map((m) => (
                  <span key={m.id} className="absolute -bottom-1 -top-1 z-[3]" style={{ left: `${pct(m.date)}%` }} title={`${m.title} (gate)`}>
                    <span className="absolute -top-[5px] left-1/2 -translate-x-1/2 text-[9px] text-[var(--t-red)]">◆</span>
                  </span>
                ))}
                {rowMiles.map((m) => (
                  <span
                    key={m.id}
                    className="absolute top-1/2 z-[3] -translate-x-1/2 -translate-y-1/2 text-[13px]"
                    style={{ left: `${pct(m.date)}%`, color: catColor(m.category) }}
                    title={m.title}
                  >
                    ◆
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="text-muted-foreground mt-3.5 flex flex-wrap gap-4 border-t pt-3 text-[11.5px]">
        <span className="inline-flex items-center gap-1.5">
          <span className="bg-primary border-primary inline-block h-2.5 w-[18px] rounded-[3px] border" /> In progress
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="border-primary/35 inline-block h-2.5 w-[18px] rounded-[3px] border bg-[color-mix(in_oklch,var(--accent-c)_20%,var(--panel))]" /> Upcoming
        </span>
        <span className="inline-flex items-center gap-1.5" style={{ color: "var(--accent-deep)" }}>◆ Milestone</span>
        <span className="inline-flex items-center gap-1.5" style={{ color: "var(--t-red)" }}>▐ Gate</span>
        <span className="inline-flex items-center gap-1.5 text-[var(--t-red)]">
          <TriangleAlert className="size-3" /> Waiting on an unfinished task
        </span>
      </div>
    </Panel>
  );
}

// ── task line (used in "In progress now" / personal) ────────────────────────

function TaskLine({ t, onOpen }: { t: Task; onOpen: (t: Task) => void }) {
  return (
    <div
      onClick={() => onOpen(t)}
      className="flex cursor-pointer items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-[7px] transition hover:bg-[var(--paper-2)]"
    >
      <span className="size-[7px] shrink-0 rounded-full" style={{ background: PRIO_COLOR[t.priority] }} />
      <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">{t.title}</span>
    </div>
  );
}

// ── module ────────────────────────────────────────────────────────────────────

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
        rows={3}
        placeholder="What is this project for?"
        className="font-serif-display focus:border-primary mt-3 w-full max-w-[560px] resize-y rounded-[var(--radius-sm)] border bg-[var(--panel)] px-3 py-2 text-[17px] leading-[1.55] outline-none"
      />
    );
  }

  return (
    <p
      onDoubleClick={() => { setDraft(purpose); setEditing(true); }}
      title="Double-click to edit"
      className={cn(
        "font-serif-display mt-3 max-w-[560px] cursor-text rounded-[var(--radius-sm)] text-[17px] leading-[1.55] transition",
        "hover:bg-[var(--paper-2)] -mx-1 px-1",
        purpose ? "text-muted-foreground" : "text-muted-foreground/60 italic",
      )}
    >
      {purpose || "Add a business purpose to summarise this project here."}
    </p>
  );
}

export function DashboardModule({ projectId }: { projectId: string }) {
  const { data } = useProject(projectId);
  const [openTask, setOpenTask] = useState<Task | null>(null);
  const [who, setWho] = useState("");

  if (!data) return null;
  const { project, tasks, risks, milestones, members, categories } = data;

  const people = useMemo(
    () => [...new Set(members.map((m) => m.name).filter((n) => n && n !== "You"))].sort((a, b) => a.localeCompare(b)),
    [members],
  );
  const personal = who && people.includes(who);
  const firstName = personal ? who.split(/\s+/)[0] : "";

  const viewTasks = personal ? tasks.filter((t) => assigneesOf(t).includes(who)) : tasks;
  const viewRisks = personal
    ? risks.filter((r) => (r.taskIds ?? []).some((id) => viewTasks.some((t) => t.id === id)))
    : risks;

  const active = viewTasks.filter((t) => t.status === "inprogress");

  const byPerson = useMemo(() => {
    const out: { name: string; tasks: Task[] }[] = [];
    const idx: Record<string, number> = {};
    active.forEach((t) => {
      const keys = assigneesOf(t).length ? assigneesOf(t) : ["— Unassigned"];
      keys.forEach((n) => {
        if (idx[n] == null) {
          idx[n] = out.length;
          out.push({ name: n, tasks: [] });
        }
        out[idx[n]].tasks.push(t);
      });
    });
    out.sort(
      (a, b) => (a.name.startsWith("—") ? 1 : 0) - (b.name.startsWith("—") ? 1 : 0) || b.tasks.length - a.tasks.length,
    );
    return out;
  }, [active]);

  const STATUS_ORDER = [
    { id: "inprogress", label: "In progress" },
    { id: "backlog", label: "To do" },
    { id: "done", label: "Done" },
  ];
  const byStatus = useMemo(
    () => STATUS_ORDER.map((st) => ({ ...st, tasks: viewTasks.filter((t) => t.status === st.id) })).filter((g) => g.tasks.length),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [viewTasks],
  );

  const depTasks = viewTasks.filter((t) => (t.deps ?? []).length && t.status !== "done");
  let blockedCount = 0;
  let extCount = 0;
  depTasks.forEach((t) => {
    depsOf(t, tasks).forEach((d) => {
      if (d.external) extCount++;
      else if (d.blocked) blockedCount++;
    });
  });

  const LVL: Record<string, number> = { low: 1, med: 2, high: 3 };
  const topRisks = [...viewRisks]
    .sort((a, b) => LVL[b.likelihood] * LVL[b.impact] - LVL[a.likelihood] * LVL[a.impact])
    .slice(0, 5);

  return (
    <div>
      {/* Hero */}
      <section className="mb-6 flex items-center gap-10 py-1 max-lg:flex-col-reverse max-lg:items-start">
        <div className="min-w-0 flex-1">
          <p className="eyebrow mb-3.5">{personal ? "Personal view" : "Project overview"}</p>
          <h1 className="font-serif-display max-w-[14ch] text-[44px] font-medium leading-[1.12] tracking-[-0.025em] text-balance">
            {project.name}
          </h1>
          {project.code && (
            <p className="text-muted-foreground mt-1 font-mono text-[12.5px] tracking-wide">{project.code}</p>
          )}
          <PurposeLine
            projectId={projectId}
            businessCase={project.businessCase as Record<string, unknown> | null}
          />
          {personal && (
            <p className="text-muted-foreground mt-2 text-[13.5px] italic">
              Showing only {who}&rsquo;s tasks and the risks on work they&rsquo;re assigned to.
            </p>
          )}
        </div>
        <ViewBox people={people} who={who} onChange={setWho} />
      </section>

      <CommandBar projectId={projectId} />

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
        className="mb-5"
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

      <div className="mb-5 grid gap-4 lg:grid-cols-2">
        <Panel
          title={personal ? `${firstName}'s tasks` : "In progress now"}
          action={
            <PanelLink href={`/projects/${projectId}/actions`} label={personal ? "Tasks" : "Board"} />
          }
        >
          {!personal && (
            <div className="flex flex-col gap-4">
              {active.length === 0 && (
                <DashEmpty>
                  Nothing in progress. Move a card into <b>In Progress</b> to see who&rsquo;s working on what.
                </DashEmpty>
              )}
              {byPerson.map((grp) => (
                <div key={grp.name}>
                  <div className="mb-1.5 flex items-center gap-2">
                    <span
                      className={cn(
                        "flex size-[26px] items-center justify-center rounded-full text-[10px] font-bold text-background",
                        grp.name.startsWith("—") ? "bg-muted-foreground" : "bg-foreground",
                      )}
                    >
                      {grp.name.startsWith("—") ? "?" : initials(grp.name)}
                    </span>
                    <span className="text-[14px] font-bold">
                      {grp.name.startsWith("—") ? "Unassigned" : grp.name}
                    </span>
                    <span className="text-muted-foreground ml-auto rounded-full border bg-[var(--paper-2)] px-2 py-0.5 font-mono text-[11px]">
                      {grp.tasks.length}
                    </span>
                  </div>
                  <div className="ml-3 flex flex-col gap-0.5 border-l-2 pl-2.5">
                    {grp.tasks.map((t) => (
                      <TaskLine key={t.id} t={t} onOpen={setOpenTask} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          {personal && (
            <div className="flex flex-col gap-4">
              {viewTasks.length === 0 && (
                <DashEmpty>{who} isn&rsquo;t assigned to any tasks yet. Assign them on a task card.</DashEmpty>
              )}
              {byStatus.map((g) => (
                <div key={g.id}>
                  <div className="mb-1.5 flex items-center gap-2">
                    <span
                      className="size-2.5 rounded-full"
                      style={{
                        background:
                          g.id === "done" ? "var(--hue-done)" : g.id === "inprogress" ? "var(--hue-progress)" : "var(--hue-backlog)",
                      }}
                    />
                    <span className="text-[14px] font-bold">{g.label}</span>
                    <span className="text-muted-foreground ml-auto rounded-full border bg-[var(--paper-2)] px-2 py-0.5 font-mono text-[11px]">
                      {g.tasks.length}
                    </span>
                  </div>
                  <div className="ml-3 flex flex-col gap-0.5 border-l-2 pl-2.5">
                    {g.tasks.map((t) => (
                      <TaskLine key={t.id} t={t} onOpen={setOpenTask} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel
          title={personal ? `${firstName}'s risks` : "Top risks"}
          action={<PanelLink href={`/projects/${projectId}/risks`} label="All risks" />}
        >
          <div className="flex flex-col gap-1">
            {topRisks.length === 0 && (
              <DashEmpty>{personal ? "No risks linked to their tasks." : "No risks captured yet."}</DashEmpty>
            )}
            {topRisks.map((r) => {
              const score = LVL[r.likelihood] * LVL[r.impact];
              const scoreColor = score >= 6 ? "var(--t-red)" : score >= 3 ? "var(--t-amber)" : "var(--t-green)";
              return (
                <Link
                  key={r.id}
                  href={`/projects/${projectId}/risks`}
                  className="flex items-center gap-2.5 rounded-[var(--radius-sm)] px-1.5 py-[5px] text-[13.5px] transition hover:bg-[var(--paper-2)]"
                >
                  <span
                    className="flex size-6 shrink-0 items-center justify-center rounded-md text-[11px] font-bold text-white"
                    style={{ background: scoreColor }}
                  >
                    {score}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{r.title}</span>
                </Link>
              );
            })}
          </div>
        </Panel>
      </div>

      <Panel title="Dependencies & blockers">
        <div className="mb-3 flex items-center gap-2">
          {blockedCount > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[color-mix(in_oklch,var(--t-red)_14%,var(--panel))] px-2.5 py-1 text-[11.5px] font-semibold text-[color-mix(in_oklch,var(--t-red)_70%,var(--ink))]">
              ● {blockedCount} blocking
            </span>
          )}
          {extCount > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[color-mix(in_oklch,var(--t-indigo)_14%,var(--panel))] px-2.5 py-1 text-[11.5px] font-semibold text-[color-mix(in_oklch,var(--t-indigo)_70%,var(--ink))]">
              <Link2 className="size-3" /> {extCount} external
            </span>
          )}
          {blockedCount + extCount === 0 && (
            <span className="text-muted-foreground text-[12.5px]">No open dependencies</span>
          )}
        </div>
        {depTasks.length === 0 && (
          <DashEmpty>
            {personal ? "None of their tasks have open dependencies." : "No open dependencies. Add them on any task card."}
          </DashEmpty>
        )}
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
          {depTasks.map((t) => (
            <div
              key={t.id}
              onClick={() => setOpenTask(t)}
              className="cursor-pointer rounded-[var(--radius-md)] border bg-[var(--paper-2)] p-3.5 transition hover:border-[var(--line-strong)] hover:shadow-sm"
            >
              <div className="mb-2 flex items-center gap-2 text-[13.5px] font-semibold">
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{
                    background:
                      t.status === "done" ? "var(--hue-done)" : t.status === "inprogress" ? "var(--hue-progress)" : "var(--hue-backlog)",
                  }}
                />
                {t.title}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {depsOf(t, tasks).map((d) => (
                  <span
                    key={d.needId}
                    className={cn(
                      "inline-flex max-w-full items-center gap-1 rounded-md border px-2 py-0.5 text-[11.5px] font-medium",
                      d.blocked
                        ? "border-[color-mix(in_oklch,var(--t-red)_30%,transparent)] bg-[color-mix(in_oklch,var(--t-red)_9%,var(--panel))] text-[color-mix(in_oklch,var(--t-red)_68%,var(--ink))]"
                        : d.external
                          ? "text-muted-foreground border-dashed"
                          : "border-[color-mix(in_oklch,var(--t-green)_28%,transparent)] bg-[color-mix(in_oklch,var(--t-green)_9%,var(--panel))] text-[color-mix(in_oklch,var(--t-green)_60%,var(--ink))]",
                    )}
                  >
                    {d.name}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Panel>

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
