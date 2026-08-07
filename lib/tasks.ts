/* Shared task/dependency logic used by the Actions & Timeline module and the
   Kanban board — kept in one place so "blocked"/"dependency block" rules,
   filtering, and small display helpers stay identical across every view. */

import type { LucideIcon } from "lucide-react";
import {
  Rocket, Megaphone, ShieldCheck, Wrench, Palette, Database, Users, Globe,
  Server, TestTube, FileText, BarChart3,
} from "lucide-react";
import type { Task, Product, External, TaskDep } from "@/lib/db/schema";

// ── status / priority constants ─────────────────────────────────────────────

export const COLUMNS = [
  { id: "backlog", label: "Backlog", var: "--hue-backlog" },
  { id: "inprogress", label: "In Progress", var: "--hue-progress" },
  { id: "done", label: "Done", var: "--hue-done" },
] as const;

export const PRIO: Record<string, { label: string; var: string }> = {
  high: { label: "High", var: "--t-red" },
  med: { label: "Med", var: "--t-amber" },
  low: { label: "Low", var: "--t-green" },
};

// ── track icons ──────────────────────────────────────────────────────────────

/** Curated icon set a track can optionally pick in Taxonomy. A track with no
 *  icon set shows none — there is no default/fallback icon. */
export const TRACK_ICONS: Record<string, { label: string; Icon: LucideIcon }> = {
  rocket: { label: "Rocket", Icon: Rocket },
  megaphone: { label: "Megaphone", Icon: Megaphone },
  shield: { label: "Shield", Icon: ShieldCheck },
  wrench: { label: "Wrench", Icon: Wrench },
  palette: { label: "Palette", Icon: Palette },
  database: { label: "Database", Icon: Database },
  users: { label: "Users", Icon: Users },
  globe: { label: "Globe", Icon: Globe },
  server: { label: "Server", Icon: Server },
  test: { label: "Test", Icon: TestTube },
  doc: { label: "Document", Icon: FileText },
  chart: { label: "Chart", Icon: BarChart3 },
};

export function statusVar(id: string): string {
  return `var(${COLUMNS.find((c) => c.id === id)?.var ?? "--hue-backlog"})`;
}

// ── small display helpers ───────────────────────────────────────────────────

export function initials(name: string | null | undefined): string {
  if (!name) return "?";
  return name.split(/\s+/).map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

export function assigneesOf(t: Pick<Task, "assignees">): string[] {
  return Array.isArray(t.assignees) ? t.assignees : [];
}

export function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000);
}

export function fmtD(d: string): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** A task's displayed ID is permanent — assigned by creation order (tiebroken
 *  by the underlying db id) and never recomputed from track/sort/filter
 *  position, so it keeps its number no matter where the task moves. */
export function taskIdMap(tasks: Task[]): Map<string, number> {
  const map = new Map<string, number>();
  const ordered = [...tasks].sort((a, b) => {
    const at = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    if (at !== bt) return at - bt;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  ordered.forEach((t, i) => map.set(t.id, i + 1));
  return map;
}

// ── filtering ────────────────────────────────────────────────────────────────

/** Shared task filter: category (track) + assignee. `"__unassigned"` in
 *  `fWho` matches tasks with no assignees, mirroring the reference app. */
export function taskMatchesFilter(t: Task, fCat: string[], fWho: string[]): boolean {
  if (fCat.length && !(t.category && fCat.includes(t.category))) return false;
  if (fWho.length) {
    const who = assigneesOf(t);
    const ok = fWho.some((w) => (w === "__unassigned" ? who.length === 0 : who.includes(w)));
    if (!ok) return false;
  }
  return true;
}

// ── dependency resolution ───────────────────────────────────────────────────

export interface ResolvedDep {
  id: string;
  type: TaskDep["type"];
  icon: "task" | "deliverable" | "external";
  name: string;
  scope: string;
  external: boolean;
  /** The referenced thing isn't done/received yet. */
  blocked: boolean;
  /** "Dependency block": blocked AND the dependent is scheduled to start
   *  before the predecessor can finish/arrive. */
  violated: boolean;
  status?: string;
  due?: string;
  overdue?: boolean;
}

/** Resolve one task dependency to a display descriptor. Needs the full,
 *  unfiltered task/product/external lists so blocks keep resolving correctly
 *  even when the current view is filtered down to a subset. */
export function resolveDep(
  dep: TaskDep,
  self: Pick<Task, "start">,
  lookups: { tasks: Task[]; products: Product[]; externals: External[] },
): ResolvedDep {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (dep.type === "task") {
    const t = lookups.tasks.find((x) => x.id === dep.refId);
    const blocked = !!t && t.status !== "done";
    const violated = !!(blocked && self.start && t?.end && new Date(self.start) < new Date(t.end));
    return {
      id: dep.id, type: dep.type, icon: "task",
      name: t ? t.title : "(removed task)",
      scope: "Task", external: false, blocked, violated, status: t?.status,
    };
  }

  if (dep.type === "deliverable") {
    const p = lookups.products.find((x) => x.id === dep.refId);
    return {
      id: dep.id, type: dep.type, icon: "deliverable",
      name: p ? p.name : "(removed deliverable)",
      scope: "Deliverable", external: false, blocked: false, violated: false,
    };
  }

  if (dep.type === "followup") {
    // Provenance, not a dependency — callers should filter these out before
    // reaching here (see depsOf), but resolve to something inert rather than
    // silently falling through to the free-text "external" case below.
    const t = lookups.tasks.find((x) => x.id === dep.refId);
    return {
      id: dep.id, type: dep.type, icon: "task",
      name: t ? t.title : "(removed task)",
      scope: "Follow-up of", external: false, blocked: false, violated: false,
    };
  }

  if (dep.type === "ext") {
    const e = lookups.externals.find((x) => x.id === dep.refId);
    if (!e) {
      return {
        id: dep.id, type: dep.type, icon: "external",
        name: "(removed external input)", scope: "External",
        external: true, blocked: false, violated: false,
      };
    }
    const blocked = e.status !== "received";
    const overdue = !!(blocked && e.due && new Date(e.due) < today);
    const startsBefore = !!(blocked && self.start && e.due && new Date(self.start) < new Date(e.due));
    return {
      id: dep.id, type: dep.type, icon: "external",
      name: e.title || "External input",
      scope: e.party || "External party",
      external: true, blocked, violated: overdue || startsBefore,
      status: e.status, due: e.due, overdue,
    };
  }

  // free-text external
  return {
    id: dep.id, type: "external", icon: "external",
    name: dep.label || "External dependency",
    scope: dep.scope || "External",
    external: true, blocked: false, violated: false,
  };
}

export function depsOf(
  task: Pick<Task, "deps" | "start">,
  lookups: { tasks: Task[]; products: Product[]; externals: External[] },
): ResolvedDep[] {
  // "followup" is provenance, not a blocking dependency — never surfaced in
  // the dependency/blocking UI, only via followupChainOf.
  return (task.deps ?? []).filter((d) => d.type !== "followup").map((d) => resolveDep(d, task, lookups));
}

// ── follow-up lineage ────────────────────────────────────────────────────────

export interface FollowupChainNode {
  id: string;
  title: string;
  status: string;
  /** This node's position relative to the task the chain was built for. */
  direction: "before" | "self" | "after";
}

/** Walks a task's full follow-up lineage in both directions: what it was
 *  spun off from (backward, via its own `followup` dep), and what's been
 *  spun off from it (forward, via other tasks' `followup` deps pointing at
 *  this one). Cycle-safe — a malformed chain just stops instead of looping. */
export function followupChainOf(task: Task, allTasks: Task[]): FollowupChainNode[] {
  const byId = new Map(allTasks.map((t) => [t.id, t]));
  const before: FollowupChainNode[] = [];
  const seen = new Set<string>([task.id]);

  let cur = task;
  while (true) {
    const dep = (cur.deps ?? []).find((d) => d.type === "followup");
    const prev = dep?.refId ? byId.get(dep.refId) : undefined;
    if (!prev || seen.has(prev.id)) break;
    before.unshift({ id: prev.id, title: prev.title, status: prev.status, direction: "before" });
    seen.add(prev.id);
    cur = prev;
  }

  const after: FollowupChainNode[] = [];
  seen.clear();
  seen.add(task.id);
  let curId = task.id;
  while (true) {
    const next = allTasks.find((t) => !seen.has(t.id) && (t.deps ?? []).some((d) => d.type === "followup" && d.refId === curId));
    if (!next) break;
    after.push({ id: next.id, title: next.title, status: next.status, direction: "after" });
    seen.add(next.id);
    curId = next.id;
  }

  return [...before, { id: task.id, title: task.title, status: task.status, direction: "self" }, ...after];
}

/** Would adding `otherId` as a task-dependency of `task` create an immediate
 *  conflict (the dependent already starts before the candidate ends)? Used
 *  to warn in dependency pickers before the user commits to it. */
export function wouldConflict(task: Pick<Task, "start">, other: Task | undefined): boolean {
  if (!other || other.status === "done" || !task.start || !other.end) return false;
  return new Date(task.start) < new Date(other.end);
}

// ── "Sequence" ordering (List + Timeline share this) ────────────────────────

/** Orders tasks by start date, then by dependency (predecessors sort before
 *  their dependents even when dates tie), undated tasks last. This is the
 *  "Sequence" sort option — the counterpart to grouping by Category. */
export function sequenceTasks(tasks: Task[]): Task[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const dateKey = (t: Task) => t.start || "9999-99-99";
  const dated = tasks.filter((t) => t.start).sort((a, b) => dateKey(a).localeCompare(dateKey(b)));
  const undated = tasks.filter((t) => !t.start);

  // Stable-sort the dated group so a predecessor never lands after its
  // dependent when they share (or nearly share) a start date.
  const out = [...dated];
  let moved = true;
  let guard = 0;
  while (moved && guard++ < out.length * 2) {
    moved = false;
    for (let i = 0; i < out.length; i++) {
      const t = out[i];
      (t.deps ?? []).forEach((d) => {
        if (d.type !== "task" || !d.refId || !byId.has(d.refId)) return;
        const predIdx = out.findIndex((x) => x.id === d.refId);
        if (predIdx > i) {
          // predecessor is after its dependent — swap them forward
          const [pred] = out.splice(predIdx, 1);
          out.splice(i, 0, pred);
          moved = true;
        }
      });
    }
  }
  return [...out, ...undated];
}
