import type { WorkingSet } from "@/lib/types";
import { isOngoing } from "@/lib/task-kinds";

/* Noticing when a milestone's last piece of work lands.
 *
 * A milestone is reached because someone says the outcome was achieved, not
 * because a counter hit zero — the comment above the "Mark reached" button in
 * the list view states the same rule, and this file does not change it. What
 * it adds is the prompt: the moment the last task closes is the moment a
 * person can answer the question, and it is the one moment nobody is looking
 * at the milestone header where the button lives.
 *
 * The check runs on the edge, not the state. A milestone that was already
 * complete before this edit is one somebody has already declined to confirm,
 * and asking again on every subsequent edit would be nagging rather than
 * prompting. So the answer is only yes when this particular write is what
 * finished it. */

export interface MilestoneJustCompleted {
  milestoneId: string;
  title: string;
  /** How many tasks the milestone closes with, for the prompt's wording. */
  taskCount: number;
}

/** Tasks that can finish. Ongoing work never does, so a milestone waiting on
 *  maintenance would otherwise stay unconfirmable forever — the same rule
 *  groupByMilestone applies when it computes `complete`. */
function finishable<T extends { kind?: string | null }>(tasks: T[]): T[] {
  return tasks.filter((t) => !isOngoing(t.kind));
}

/**
 * Whether this edit is the one that finished a milestone.
 *
 * @param before the working set as it stood before the write
 * @param after  the working set with the write applied
 * @param taskId the task that was edited
 * @returns the milestone to ask about, or null when there is nothing to ask
 */
export function milestoneJustCompleted(
  before: WorkingSet | undefined,
  after: WorkingSet | undefined,
  taskId: string,
): MilestoneJustCompleted | null {
  if (!before || !after) return null;

  const task = after.tasks.find((t) => t.id === taskId);
  if (!task) return null;

  // A subtask closing does not finish anything on its own: its parent is the
  // task the milestone counts, and the parent's own status change will arrive
  // as its own edit.
  if (task.parentId) return null;

  const milestoneId = task.milestoneId ?? "";
  if (!milestoneId) return null;

  const milestone = after.milestones.find((m) => m.id === milestoneId);
  if (!milestone) return null;

  // Already declared reached — there is nothing left to ask.
  if ((milestone.reachedOn ?? "").trim()) return null;

  const wasComplete = allDone(before, milestoneId);
  const isComplete = allDone(after, milestoneId);

  // Only the transition asks. Steady-state completeness means the question
  // was already put and left unanswered.
  if (wasComplete || !isComplete) return null;

  return {
    milestoneId,
    title: milestone.title || "Untitled milestone",
    taskCount: finishable(
      after.tasks.filter((t) => t.milestoneId === milestoneId && !t.parentId),
    ).length,
  };
}

/** Whether every finishable top-level task under a milestone is done. */
function allDone(ws: WorkingSet, milestoneId: string): boolean {
  const own = ws.tasks.filter(
    (t) => t.milestoneId === milestoneId && !t.parentId,
  );
  const real = finishable(own);
  // A milestone with no finishable work has not been "completed" by anything —
  // there was never work to finish, so closing a task cannot have finished it.
  if (real.length === 0) return false;
  return real.every((t) => t.status === "done");
}
