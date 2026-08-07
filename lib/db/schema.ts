/* ============================================================
   Drizzle schema — Atlas PM Hub
   Multi-tenant: every project belongs to an organization.
   Core list-like entities are normalized into tables keyed by
   (project_id, id) where `id` is the app-level string id (e.g.
   "t_ab12cd", "tg_fe"), unique within a project. Whole-document
   sections (business case, scope, org chart, plans, glossary…)
   live as JSONB columns on `projects`.
   RLS policies + pgvector are applied via drizzle/9999_rls.sql.
   ============================================================ */
import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  jsonb,
  timestamp,
  primaryKey,
  index,
} from "drizzle-orm/pg-core";
import type { InferSelectModel } from "drizzle-orm";

// ---------- tenancy ----------
export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  workosOrgId: text("workos_org_id").unique(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  workosUserId: text("workos_user_id").unique().notNull(),
  orgId: uuid("org_id")
    .references(() => organizations.id, { onDelete: "cascade" })
    .notNull(),
  email: text("email").notNull(),
  name: text("name"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------- projects (root of the working set) ----------
export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    name: text("name").notNull(),
    code: text("code").default("").notNull(),
    color: text("color").default("indigo").notNull(),
    parentId: uuid("parent_id"),
    // whole-document sections (edited wholesale in the UI)
    businessCase: jsonb("business_case").default({}).notNull(),
    scope: jsonb("scope").default({ inScope: [], outScope: [] }).notNull(),
    assessment: jsonb("assessment").default([]).notNull(),
    commPlan: jsonb("comm_plan").default([]).notNull(),
    changePlan: jsonb("change_plan").default({ groups: [] }).notNull(),
    orgChart: jsonb("org_chart").default([]).notNull(),
    glossary: jsonb("glossary").default([]).notNull(),
    kpis: jsonb("kpis").default([]).notNull(),
    financials: jsonb("financials").default({}).notNull(),
    forecast: jsonb("forecast").default({ bufferPct: 15, weighting: "duration" }).notNull(),
    startup: jsonb("startup").default({}).notNull(),
    settings: jsonb("settings").default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("projects_org_idx").on(t.orgId)],
);

// ---------- per-project entity tables ----------
// Shared columns: orgId (denormalized for fast RLS), projectId, id (app string id).

export const tasks = pgTable(
  "tasks",
  {
    orgId: uuid("org_id").notNull(),
    projectId: uuid("project_id")
      .references(() => projects.id, { onDelete: "cascade" })
      .notNull(),
    id: text("id").notNull(),
    title: text("title").default("").notNull(),
    status: text("status").default("backlog").notNull(),
    phase: text("phase"),
    category: text("category"),
    /** Non-track provenance for tasks spun up from comms/change-management
     *  flows — the List view pins these into their own synthetic groups. */
    origin: text("origin"),
    priority: text("priority").default("med").notNull(),
    description: text("description").default("").notNull(),
    start: text("start").default("").notNull(),
    end: text("end").default("").notNull(),
    position: integer("position").default(0).notNull(),
    tags: jsonb("tags").$type<string[]>().default([]).notNull(),
    assignees: jsonb("assignees").$type<string[]>().default([]).notNull(),
    deps: jsonb("deps").$type<TaskDep[]>().default([]).notNull(),
    parentId: text("parent_id"),
    comments: jsonb("comments").$type<TaskComment[]>().default([]).notNull(),
    custom: jsonb("custom").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.projectId, t.id] }),
    index("tasks_project_idx").on(t.projectId),
  ],
);

export const risks = pgTable(
  "risks",
  {
    orgId: uuid("org_id").notNull(),
    projectId: uuid("project_id")
      .references(() => projects.id, { onDelete: "cascade" })
      .notNull(),
    id: text("id").notNull(),
    title: text("title").default("").notNull(),
    likelihood: text("likelihood").default("med").notNull(),
    impact: text("impact").default("med").notNull(),
    mitigation: text("mitigation").default("").notNull(),
    owner: text("owner").default("").notNull(),
    status: text("status").default("open").notNull(),
    taskIds: jsonb("task_ids").$type<string[]>().default([]).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.projectId, t.id] }),
    index("risks_project_idx").on(t.projectId),
  ],
);

export const stakeholders = pgTable(
  "stakeholders",
  {
    orgId: uuid("org_id").notNull(),
    projectId: uuid("project_id")
      .references(() => projects.id, { onDelete: "cascade" })
      .notNull(),
    id: text("id").notNull(),
    name: text("name").default("").notNull(),
    title: text("title").default("").notNull(),
    role: text("role").default("").notNull(),
    responsibility: text("responsibility").default("").notNull(),
    influence: text("influence").default("med").notNull(),
    interest: text("interest").default("med").notNull(),
    contact: text("contact").default("").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.projectId, t.id] }),
    index("stakeholders_project_idx").on(t.projectId),
  ],
);

export const members = pgTable(
  "members",
  {
    orgId: uuid("org_id").notNull(),
    projectId: uuid("project_id")
      .references(() => projects.id, { onDelete: "cascade" })
      .notNull(),
    id: text("id").notNull(),
    name: text("name").default("").notNull(),
    role: text("role").default("").notNull(),
    email: text("email").default("").notNull(),
    color: text("color").default("blue").notNull(),
    capacityHours: integer("capacity_hours").default(30).notNull(),
    availability: jsonb("availability").$type<Record<string, number>>().default({}).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.projectId, t.id] }),
    index("members_project_idx").on(t.projectId),
  ],
);

export const findings = pgTable(
  "findings",
  {
    orgId: uuid("org_id").notNull(),
    projectId: uuid("project_id")
      .references(() => projects.id, { onDelete: "cascade" })
      .notNull(),
    id: text("id").notNull(),
    title: text("title").default("").notNull(),
    category: text("category").default("").notNull(),
    summary: text("summary").default("").notNull(),
    source: text("source").default("").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.projectId, t.id] }),
    index("findings_project_idx").on(t.projectId),
  ],
);

export const products = pgTable(
  "products",
  {
    orgId: uuid("org_id").notNull(),
    projectId: uuid("project_id")
      .references(() => projects.id, { onDelete: "cascade" })
      .notNull(),
    id: text("id").notNull(),
    name: text("name").default("").notNull(),
    type: text("type").default("pdf").notNull(),
    url: text("url").default("").notNull(),
    taskIds: jsonb("task_ids").$type<string[]>().default([]).notNull(),
    phase: text("phase"),
    date: text("date").default("").notNull(),
    note: text("note").default("").notNull(),
    placeholder: boolean("placeholder").default(true).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.projectId, t.id] }),
    index("products_project_idx").on(t.projectId),
  ],
);

export const milestones = pgTable(
  "milestones",
  {
    orgId: uuid("org_id").notNull(),
    projectId: uuid("project_id")
      .references(() => projects.id, { onDelete: "cascade" })
      .notNull(),
    id: text("id").notNull(),
    title: text("title").default("").notNull(),
    type: text("type").default("milestone").notNull(),
    date: text("date").default("").notNull(),
    category: text("category"),
    note: text("note").default("").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.projectId, t.id] }),
    index("milestones_project_idx").on(t.projectId),
  ],
);

/** Externally-owned inputs a task can depend on (dep.type === "ext"). */
export const externals = pgTable(
  "externals",
  {
    orgId: uuid("org_id").notNull(),
    projectId: uuid("project_id")
      .references(() => projects.id, { onDelete: "cascade" })
      .notNull(),
    id: text("id").notNull(),
    title: text("title").default("").notNull(),
    party: text("party").default("").notNull(),
    owner: text("owner").default("").notNull(),
    due: text("due").default("").notNull(),
    status: text("status").default("pending").notNull(),
    note: text("note").default("").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.projectId, t.id] }),
    index("externals_project_idx").on(t.projectId),
  ],
);

// ---------- taxonomy (per-project tags / phases / categories) ----------
export const tags = pgTable(
  "tags",
  {
    orgId: uuid("org_id").notNull(),
    projectId: uuid("project_id")
      .references(() => projects.id, { onDelete: "cascade" })
      .notNull(),
    id: text("id").notNull(),
    label: text("label").default("").notNull(),
    color: text("color").default("blue").notNull(),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.id] })],
);

export const phases = pgTable(
  "phases",
  {
    orgId: uuid("org_id").notNull(),
    projectId: uuid("project_id")
      .references(() => projects.id, { onDelete: "cascade" })
      .notNull(),
    id: text("id").notNull(),
    label: text("label").default("").notNull(),
    color: text("color").default("teal").notNull(),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.id] })],
);

export const categories = pgTable(
  "categories",
  {
    orgId: uuid("org_id").notNull(),
    projectId: uuid("project_id")
      .references(() => projects.id, { onDelete: "cascade" })
      .notNull(),
    id: text("id").notNull(),
    label: text("label").default("").notNull(),
    color: text("color").default("purple").notNull(),
    /** Optional key into the curated track-icon set (see TRACK_ICONS) — a
     *  track with no icon shows none, it never falls back to a default. */
    icon: text("icon"),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.id] })],
);

// ---------- types ----------
/** A task dependency: an internal task/deliverable, a registered external
 *  input, or a free-text external note. `refId` points at the referenced
 *  entity's app-string id for the internal/registered kinds.
 *
 *  `"followup"` is provenance, not a dependency — `refId` points at the task
 *  this one was spun off from. It's excluded from blocking/scheduling logic
 *  (resolveDep/depsOf/sequenceTasks) and only used to trace lineage. */
export type TaskDep = {
  id: string;
  type: "task" | "deliverable" | "ext" | "external" | "followup";
  refId?: string;
  label?: string;
  scope?: string;
};

export type TaskComment = {
  id: string;
  author: string;
  color?: string;
  text: string;
  ts: number;
};

export type Organization = InferSelectModel<typeof organizations>;
export type User = InferSelectModel<typeof users>;
export type Project = InferSelectModel<typeof projects>;
export type Task = InferSelectModel<typeof tasks>;
export type Risk = InferSelectModel<typeof risks>;
export type Stakeholder = InferSelectModel<typeof stakeholders>;
export type Member = InferSelectModel<typeof members>;
export type Finding = InferSelectModel<typeof findings>;
export type Product = InferSelectModel<typeof products>;
export type Milestone = InferSelectModel<typeof milestones>;
export type Tag = InferSelectModel<typeof tags>;
export type Phase = InferSelectModel<typeof phases>;
export type Category = InferSelectModel<typeof categories>;
export type External = InferSelectModel<typeof externals>;
export type Activity = InferSelectModel<typeof activity>;

// ---------- audit / activity (append-only; dedicated route in P5) ----------
export const activity = pgTable(
  "activity",
  {
    orgId: uuid("org_id").notNull(),
    projectId: uuid("project_id")
      .references(() => projects.id, { onDelete: "cascade" })
      .notNull(),
    id: text("id").notNull(),
    ts: timestamp("ts", { withTimezone: true }).defaultNow().notNull(),
    kind: text("kind").default("edit").notNull(),
    text: text("text").notNull(),
    actor: text("actor").default("").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.projectId, t.id] }),
    index("activity_project_idx").on(t.projectId),
  ],
);

/** All per-project entity tables, keyed by the section name used in the app. */
export const entityTables = {
  tasks,
  risks,
  stakeholders,
  members,
  findings,
  products,
  milestones,
  tags,
  phases,
  categories,
  externals,
} as const;
