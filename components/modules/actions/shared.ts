import type { Task } from "@/lib/db/schema";

/** Filters shared across every Actions view (List · Timeline · Calendar) and
 *  persisted the same way the reference app does. List view's own "By track /
 *  By date" toggle (formerly a separate Sequence view) lives in list-view.tsx. */
export interface ActionsFilters {
  cat: string[];
  who: string[];
}

export type ActionsView = "list" | "timeline" | "calendar";

export const VIEW_STORAGE_KEY = "atlas.actions.view";
export const COLLAPSE_STORAGE_KEY_PREFIX = "atlas.actions.collapsed.";

/** A track group used by the List view, plus the two pinned synthetic groups
 *  (Communications / Change management) the reference app always shows last. */
export interface TrackGroup {
  key: string;
  label: string;
  color: string | null;
  tasks: Task[];
  synthetic?: boolean;
}
