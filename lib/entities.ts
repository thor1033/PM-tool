import { z } from "zod";
import { schema } from "@/lib/db/client";

/* Registry of per-project entity collections editable through the generic
   /api/projects/[id]/[entity] routes. Each entry maps the URL segment to its
   Drizzle table, an id prefix for generated ids, and a Zod schema (all fields
   optional so the same schema validates both create and PATCH payloads). */

const strArr = z.array(z.string());

const taskSchema = z
  .object({
    title: z.string(),
    status: z.string(),
    phase: z.string().nullable(),
    category: z.string().nullable(),
    priority: z.string(),
    description: z.string(),
    start: z.string(),
    end: z.string(),
    position: z.number(),
    tags: strArr,
    assignees: strArr,
    deps: z.array(z.any()),
  })
  .partial();

const riskSchema = z
  .object({
    title: z.string(),
    likelihood: z.string(),
    impact: z.string(),
    mitigation: z.string(),
    owner: z.string(),
    status: z.string(),
    taskIds: strArr,
  })
  .partial();

const stakeholderSchema = z
  .object({
    name: z.string(),
    title: z.string(),
    role: z.string(),
    responsibility: z.string(),
    influence: z.string(),
    interest: z.string(),
    contact: z.string(),
  })
  .partial();

const memberSchema = z
  .object({
    name: z.string(),
    role: z.string(),
    email: z.string(),
    color: z.string(),
  })
  .partial();

const findingSchema = z
  .object({
    title: z.string(),
    category: z.string(),
    summary: z.string(),
    source: z.string(),
  })
  .partial();

const productSchema = z
  .object({
    name: z.string(),
    type: z.string(),
    url: z.string(),
    taskIds: strArr,
    phase: z.string().nullable(),
    date: z.string(),
    note: z.string(),
    placeholder: z.boolean(),
  })
  .partial();

const milestoneSchema = z
  .object({
    title: z.string(),
    type: z.string(),
    date: z.string(),
    category: z.string().nullable(),
    note: z.string(),
  })
  .partial();

const taxonomySchema = z
  .object({
    label: z.string(),
    color: z.string(),
  })
  .partial();

export const entityConfig = {
  tasks: { table: schema.tasks, prefix: "t", schema: taskSchema },
  risks: { table: schema.risks, prefix: "r", schema: riskSchema },
  stakeholders: {
    table: schema.stakeholders,
    prefix: "s",
    schema: stakeholderSchema,
  },
  members: { table: schema.members, prefix: "mem", schema: memberSchema },
  findings: { table: schema.findings, prefix: "f", schema: findingSchema },
  products: { table: schema.products, prefix: "p", schema: productSchema },
  milestones: { table: schema.milestones, prefix: "ms", schema: milestoneSchema },
  tags: { table: schema.tags, prefix: "tg", schema: taxonomySchema },
  phases: { table: schema.phases, prefix: "ph", schema: taxonomySchema },
  categories: { table: schema.categories, prefix: "ct", schema: taxonomySchema },
} as const;

export type EntityName = keyof typeof entityConfig;

export function isEntityName(v: string): v is EntityName {
  return Object.prototype.hasOwnProperty.call(entityConfig, v);
}

export function genId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

/** Whole-document JSONB sections editable via PATCH /api/projects/[id]. */
export const projectDocSchema = z
  .object({
    name: z.string(),
    code: z.string(),
    color: z.string(),
    parentId: z.string().nullable(),
    businessCase: z.any(),
    scope: z.any(),
    assessment: z.any(),
    commPlan: z.any(),
    changePlan: z.any(),
    orgChart: z.any(),
    glossary: z.any(),
    kpis: z.any(),
  })
  .partial();
