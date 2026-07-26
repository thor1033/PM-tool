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
    priority: text("priority").default("med").notNull(),
    description: text("description").default("").notNull(),
    start: text("start").default("").notNull(),
    end: text("end").default("").notNull(),
    position: integer("position").default(0).notNull(),
    tags: jsonb("tags").$type<string[]>().default([]).notNull(),
    assignees: jsonb("assignees").$type<string[]>().default([]).notNull(),
    deps: jsonb("deps").$type<TaskDep[]>().default([]).notNull(),
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
  },
  (t) => [primaryKey({ columns: [t.projectId, t.id] })],
);

// ---------- types ----------
export type TaskDep = {
  id: string;
  type: "task" | "external";
  refId?: string;
  label?: string;
  scope?: string;
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
} as const;
