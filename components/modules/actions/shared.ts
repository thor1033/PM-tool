import type { Task } from "@/lib/db/schema";

/** Filters shared across every Actions view (List · Kanban · Timeline ·
 *  Calendar) and persisted the same way the reference app does. */
export interface ActionsFilters {
  cat: string[];
  who: string[];
}

export type ActionsView = "list" | "kanban" | "timeline" | "calendar";
export type SortMode = "category" | "sequence";

export const VIEW_STORAGE_KEY = "atlas.actions.mode";
export const SORT_STORAGE_KEY = "atlas.actions.sort";
export const COLLAPSE_STORAGE_KEY_PREFIX = "atlas.actions.expanded.";
export const OPEN_SUBS_STORAGE_KEY_PREFIX = "atlas.actions.opensubs.";

/** A track group used by the List view, plus the two pinned synthetic groups
 *  (Communications / Change management) the reference app always shows last. */
export interface TrackGroup {
  key: string;
  label: string;
  color: string | null;
  tasks: Task[];
  synthetic?: boolean;
}
