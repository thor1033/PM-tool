import type { EntityName } from "@/lib/entities";

/* Turns a mutation into the sentence the digest shows.
 *
 * The point of the feed is that someone can read what happened without
 * opening the app, so these read as plain statements ("Marked X done"),
 * not as field diffs ("status: inprogress -> done"). Anything we can't
 * describe usefully returns null and simply isn't recorded — a feed full
 * of "Updated task" lines is worse than a shorter, honest one. */

export type ActivityKind = "done" | "create" | "delete" | "edit" | "reopen";

export interface DescribedEvent {
  kind: ActivityKind;
  text: string;
  /** Collapses repeats: the same key within 5 minutes updates one entry
   *  rather than filling the feed while someone drags a slider. */
  key: string;
}

/** Human label for an entity, singular. */
const ENTITY_LABEL: Record<string, string> = {
  tasks: "task",
  risks: "risk",
  stakeholders: "stakeholder",
  members: "team member",
  findings: "finding",
  products: "deliverable",
  milestones: "milestone",
  categories: "track",
  externals: "dependency",
  notes: "note",
  tags: "tag",
  phases: "phase",
};

/** Fields whose change is worth a line of its own on a task. */
const NAMED_FIELDS: Record<string, string> = {
  title: "renamed",
  start: "rescheduled",
  end: "rescheduled",
  assignees: "reassigned",
  category: "moved",
  priority: "reprioritised",
  description: "updated the description of",
};

function label(entity: EntityName): string {
  return ENTITY_LABEL[entity] ?? "item";
}

/** Quotes a name, trimming runaway titles so one entry can't dominate. */
function quote(name: unknown): string {
  const s = String(name ?? "").trim();
  if (!s) return "";
  return `“${s.length > 60 ? `${s.slice(0, 57)}…` : s}”`;
}

export function describeCreate(
  entity: EntityName,
  data: Record<string, unknown>,
  id: string,
): DescribedEvent | null {
  const name = quote(data.title ?? data.name ?? data.label);
  // A blank new row is a placeholder the user hasn't filled in yet; the
  // rename that follows is the event worth showing.
  if (!name) return null;
  return {
    kind: "create",
    text: `Added ${label(entity)} ${name}`,
    key: `create:${entity}:${id}`,
  };
}

export function describeDelete(
  entity: EntityName,
  name: string,
  id: string,
): DescribedEvent | null {
  const q = quote(name);
  return {
    kind: "delete",
    text: q ? `Deleted ${label(entity)} ${q}` : `Deleted a ${label(entity)}`,
    key: `delete:${entity}:${id}`,
  };
}

export function describeUpdate(
  entity: EntityName,
  data: Record<string, unknown>,
  before: Record<string, unknown> | undefined,
  id: string,
): DescribedEvent | null {
  const name = quote(before?.title ?? before?.name ?? before?.label ?? data.title ?? data.name);

  // Status changes on a task are the headline of any digest, so they get
  // their own phrasing rather than the generic "updated".
  if (entity === "tasks" && "status" in data && data.status !== before?.status) {
    if (data.status === "done") {
      return { kind: "done", text: `Completed ${name || "a task"}`, key: `done:${id}` };
    }
    if (before?.status === "done") {
      return { kind: "reopen", text: `Reopened ${name || "a task"}`, key: `reopen:${id}` };
    }
    if (data.status === "inprogress") {
      return { kind: "edit", text: `Started ${name || "a task"}`, key: `start:${id}` };
    }
  }

  // Only report fields that actually changed — optimistic updates resend
  // whole objects, and unchanged fields would otherwise look like edits.
  const changed = Object.keys(data).filter((k) => {
    if (k === "completedOn" || k === "position") return false;
    if (!before) return false;
    return JSON.stringify(data[k]) !== JSON.stringify(before[k]);
  });
  if (changed.length === 0) return null;

  const named = changed.find((k) => k in NAMED_FIELDS);
  if (named && entity === "tasks") {
    // A rename reads better with the new title than the old one.
    const shown = named === "title" ? quote(data.title) : name;
    return {
      kind: "edit",
      text: `${NAMED_FIELDS[named]} ${shown || "a task"}`.replace(/^./, (c) => c.toUpperCase()),
      key: `edit:${named}:${id}`,
    };
  }

  return {
    kind: "edit",
    text: name ? `Updated ${label(entity)} ${name}` : `Updated a ${label(entity)}`,
    key: `edit:${entity}:${id}`,
  };
}

/** Human names for the project-level document sections, so an edit to the
 *  business case reads as that rather than as "businessCase". */
const SECTION_LABEL: Record<string, string> = {
  name: "project name",
  code: "project code",
  color: "project colour",
  businessCase: "business case",
  scope: "scope",
  assessment: "assessment",
  commPlan: "communications plan",
  changePlan: "change plan",
  orgChart: "org chart",
  glossary: "glossary",
  kpis: "KPIs",
  financials: "financials",
  forecast: "forecast settings",
  startup: "start-up",
  settings: "page settings",
};

/** Describes an edit to one of the project's document sections. These are
 *  whole-blob writes, so there is no field-level diff to report — the section
 *  that changed is the useful unit. */
export function describeProjectPatch(
  patch: Record<string, unknown>,
): DescribedEvent | null {
  const keys = Object.keys(patch).filter((k) => k in SECTION_LABEL);
  if (keys.length === 0) return null;

  // A rename carries its new value, which is worth showing.
  if (keys.length === 1 && keys[0] === "name" && typeof patch.name === "string") {
    return {
      kind: "edit",
      text: `Renamed the project to ${quote(patch.name)}`,
      key: "edit:project:name",
    };
  }

  const named = keys.map((k) => SECTION_LABEL[k]);
  const text =
    named.length === 1
      ? `Updated the ${named[0]}`
      : `Updated ${named.slice(0, -1).join(", ")} and ${named[named.length - 1]}`;
  return { kind: "edit", text, key: `edit:project:${keys.sort().join(",")}` };
}
