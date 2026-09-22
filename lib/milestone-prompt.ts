"use client";

import { toast } from "sonner";
import { apiFetch } from "@/lib/api/client";
import { todayLocal } from "@/lib/task-dates";
import type { MilestoneJustCompleted } from "@/lib/milestone-completion";

/* Asking whether a finished milestone was actually reached.
 *
 * Deliberately a toast rather than a modal. Reaching a milestone is a claim
 * about an outcome, and the honest answer is sometimes "not yet" — the last
 * task closed, but the thing it was for has not landed. A modal demands an
 * answer to a question the person may not be ready to settle, in the middle
 * of whatever they were doing. A toast offers the shortcut and costs nothing
 * to ignore; the header button stays where it was for anyone who wants to
 * decide later.
 *
 * The confirmation is written straight through apiFetch rather than through a
 * mutation hook: this runs inside another mutation's onSuccess, where hooks
 * cannot be called. The cache is refreshed by the invalidation that mutation
 * already performs. */

/** Milestones already asked about this session. A prompt declined is an
 *  answer — re-asking after the next unrelated edit would be nagging, and the
 *  transition check in milestone-completion cannot see a dismissal. */
const asked = new Set<string>();

/** Resets the session's memory of what has been asked. Test seam. */
export function resetAskedMilestones(): void {
  asked.clear();
}

export function onMilestoneComplete(
  projectId: string,
  hit: MilestoneJustCompleted,
  /** Refreshes the project cache once the milestone is confirmed. Supplied by
   *  the calling hook, which owns the query client. */
  refresh: () => void,
): void {
  if (asked.has(hit.milestoneId)) return;
  asked.add(hit.milestoneId);

  const n = hit.taskCount;
  toast.success(`All ${n} task${n === 1 ? "" : "s"} under “${hit.title}” are done.`, {
    description: "Mark the milestone as reached?",
    duration: 12_000,
    action: {
      label: "Mark reached",
      onClick: () => {
        void apiFetch(`/api/projects/${projectId}/milestones/${hit.milestoneId}`, {
          method: "PATCH",
          body: JSON.stringify({ reachedOn: todayLocal() }),
        })
          .then(() => {
            toast.success(`“${hit.title}” marked as reached.`);
            refresh();
          })
          .catch((e: unknown) => {
            toast.error(
              e instanceof Error ? e.message : "Could not mark the milestone as reached.",
            );
          });
      },
    },
  });
}
