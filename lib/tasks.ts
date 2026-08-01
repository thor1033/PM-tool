/* Shared task/dependency logic used by the Actions & Timeline module and the
   Kanban board — kept in one place so "blocked"/"dependency block" rules,
   filtering, and small display helpers stay identical across every view. */

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
  return (task.deps ?? []).map((d) => resolveDep(d, task, lookups));
}

/** Would adding `otherId` as a task-dependency of `task` create an immediate
 *  conflict (the dependent already starts before the candidate ends)? Used
 *  to warn in dependency pickers before the user commits to it. */
export function wouldConflict(task: Pick<Task, "start">, other: Task | undefined): boolean {
  if (!other || other.status === "done" || !task.start || !other.end) return false;
  return new Date(task.start) < new Date(other.end);
}
