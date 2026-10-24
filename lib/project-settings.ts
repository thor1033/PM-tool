/** Project settings, in two kinds.
 *
 *  - VIEW settings decide what a screen shows. Stored per screen as the list
 *    of hidden sections (`settings.views[viewKey].hidden`).
 *  - RULES decide how the tool behaves — what it allows and refuses. Stored
 *    project-wide as on/off flags (`settings.rules[ruleKey]`), and enforced on
 *    the server, so the raw API and the MCP tools follow the same rule.
 *
 *  Both live on the project, so the two founders work with the same setup,
 *  and both are edited from the gear on the screen they affect rather than
 *  from a central settings page. A rule is surfaced on every screen it
 *  touches but stored once.
 *
 *  Only departures from the default are meaningful: a section added later
 *  shows by default, and a rule nobody has touched keeps its default. */

// ── Rules ────────────────────────────────────────────────────────────────────

export type RuleDefinition = {
  label: string;
  /** One line on what switching it off changes. */
  hint: string;
  default: boolean;
};

/** No rules are registered yet. A rule added here appears in the gear of
 *  every view that lists it, and is checked wherever it applies. */
export const RULES: Record<string, RuleDefinition> = {};

export type RuleKey = string;

/** Whether a rule is on, read defensively from the free-form settings blob.
 *  An unknown rule reads as off. */
export function ruleEnabled(settings: unknown, rule: RuleKey): boolean {
  const rules = (settings as { rules?: Record<string, unknown> } | null | undefined)?.rules;
  const v = rules?.[rule];
  return typeof v === "boolean" ? v : RULES[rule]?.default ?? false;
}

/** The full settings blob with one rule switched. Everything else is kept. */
export function withRule(settings: unknown, rule: RuleKey, on: boolean): Record<string, unknown> {
  const base = (settings as Record<string, unknown> | null | undefined) ?? {};
  const rules = (base.rules as Record<string, unknown> | undefined) ?? {};
  return { ...base, rules: { ...rules, [rule]: on } };
}

// ── Views ────────────────────────────────────────────────────────────────────

export type ViewSection = { key: string; label: string };

export type ViewDefinition = {
  /** What the settings popover calls this screen. */
  title: string;
  /** Always shown and not offered as a toggle — the fields the screen is for. */
  fixed: string[];
  toggleable: ViewSection[];
  /** Rules that act on this screen, offered in its gear. */
  rules: RuleKey[];
};

export const VIEWS = {
  task: {
    title: "Task view",
    fixed: ["Title", "Track", "Milestone", "Start and planned end", "Owner"],
    toggleable: [
      { key: "description", label: "Description" },
      { key: "followupReason", label: "Reason for follow-up" },
      { key: "kind", label: "Kind" },
      { key: "meeting", label: "Meeting details" },
      { key: "status", label: "Status" },
      { key: "actualEnd", label: "Actual end" },
      { key: "customFields", label: "Custom fields" },
      { key: "followupChain", label: "Follow-up chain" },
      { key: "dependencies", label: "Dependencies" },
      { key: "files", label: "Files" },
      { key: "subtasks", label: "Subtasks" },
      { key: "risks", label: "Risks" },
      { key: "comments", label: "Comments" },
    ],
    rules: [],
  },
} satisfies Record<string, ViewDefinition>;

export type ViewKey = keyof typeof VIEWS;

type ViewsSetting = Record<string, { hidden?: unknown }>;

/** The hidden section keys for a view, read defensively — settings is a
 *  free-form blob and may hold anything an older build wrote. */
export function hiddenSections(settings: unknown, view: ViewKey): string[] {
  const views = (settings as { views?: ViewsSetting } | null | undefined)?.views;
  const hidden = views?.[view]?.hidden;
  return Array.isArray(hidden) ? hidden.filter((k): k is string => typeof k === "string") : [];
}

/** The full settings blob with one section's visibility changed. Everything
 *  else in settings — nav preferences, nudges, rules, other views — is kept. */
export function withSectionVisibility(
  settings: unknown,
  view: ViewKey,
  section: string,
  shown: boolean,
): Record<string, unknown> {
  const base = (settings as Record<string, unknown> | null | undefined) ?? {};
  const views = (base.views as ViewsSetting | undefined) ?? {};
  const current = hiddenSections(base, view).filter((k) => k !== section);
  const hidden = shown ? current : [...current, section];
  return { ...base, views: { ...views, [view]: { ...views[view], hidden } } };
}

/** The full settings blob with every section of a view shown again. */
export function withAllSectionsShown(settings: unknown, view: ViewKey): Record<string, unknown> {
  const base = (settings as Record<string, unknown> | null | undefined) ?? {};
  const views = (base.views as ViewsSetting | undefined) ?? {};
  return { ...base, views: { ...views, [view]: { ...views[view], hidden: [] } } };
}
