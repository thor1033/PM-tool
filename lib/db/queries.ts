import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { schema } from "@/lib/db/client";
import { withTenant } from "@/lib/db/tenant";
import { blankProjectDocs } from "@/lib/templates";
import { entityConfig, genId, type EntityName } from "@/lib/entities";
import type { ProjectSummary, WorkingSet } from "@/lib/types";

const {
  projects,
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
} = schema;

type Tx = Parameters<Parameters<typeof withTenant<unknown>>[1]>[0];

// ---------- projects ----------
export async function listProjects(orgId: string): Promise<ProjectSummary[]> {
  return withTenant(orgId, async (tx) => {
    const rows = await tx
      .select({
        id: projects.id,
        name: projects.name,
        code: projects.code,
        color: projects.color,
        parentId: projects.parentId,
        createdAt: projects.createdAt,
        updatedAt: projects.updatedAt,
        taskCount: sql<number>`count(${tasks.id})::int`,
        doneCount: sql<number>`count(${tasks.id}) filter (where ${tasks.status} = 'done')::int`,
      })
      .from(projects)
      .leftJoin(tasks, eq(tasks.projectId, projects.id))
      .groupBy(projects.id)
      .orderBy(desc(projects.updatedAt));
    return rows.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  });
}

export async function getWorkingSet(
  orgId: string,
  projectId: string,
): Promise<WorkingSet | null> {
  return withTenant(orgId, async (tx) => {
    const [project] = await tx
      .select()
      .from(projects)
      .where(eq(projects.id, projectId));
    if (!project) return null;
    const pid = eq(tasks.projectId, projectId);
    // Sequential — a single tenant transaction runs on one connection.
    const t = await tx.select().from(tasks).where(pid).orderBy(tasks.position);
    const rk = await tx
      .select()
      .from(risks)
      .where(eq(risks.projectId, projectId));
    const st = await tx
      .select()
      .from(stakeholders)
      .where(eq(stakeholders.projectId, projectId));
    const mem = await tx
      .select()
      .from(members)
      .where(eq(members.projectId, projectId));
    const fn = await tx
      .select()
      .from(findings)
      .where(eq(findings.projectId, projectId));
    const pr = await tx
      .select()
      .from(products)
      .where(eq(products.projectId, projectId));
    const ms = await tx
      .select()
      .from(milestones)
      .where(eq(milestones.projectId, projectId));
    const tg = await tx.select().from(tags).where(eq(tags.projectId, projectId));
    const ph = await tx
      .select()
      .from(phases)
      .where(eq(phases.projectId, projectId));
    const ct = await tx
      .select()
      .from(categories)
      .where(eq(categories.projectId, projectId));
    return {
      project,
      tasks: t,
      risks: rk,
      stakeholders: st,
      members: mem,
      findings: fn,
      products: pr,
      milestones: ms,
      tags: tg,
      phases: ph,
      categories: ct,
    };
  });
}

export async function createProject(
  orgId: string,
  input: { name?: string; code?: string; color?: string; parentId?: string | null },
) {
  return withTenant(orgId, async (tx) => {
    const [row] = await tx
      .insert(projects)
      .values({
        orgId,
        name: input.name?.trim() || "Untitled project",
        code: input.code ?? "",
        color: input.color ?? "indigo",
        parentId: input.parentId ?? null,
        ...blankProjectDocs(),
      })
      .returning();
    return row;
  });
}

export async function updateProject(
  orgId: string,
  projectId: string,
  patch: Record<string, unknown>,
) {
  return withTenant(orgId, async (tx) => {
    const [row] = await tx
      .update(projects)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(projects.id, projectId))
      .returning();
    return row ?? null;
  });
}

export async function deleteProject(orgId: string, projectId: string) {
  return withTenant(orgId, async (tx) => {
    // Detach child projects (mirrors legacy behavior), then cascade-delete.
    await tx
      .update(projects)
      .set({ parentId: null })
      .where(eq(projects.parentId, projectId));
    await tx.delete(projects).where(eq(projects.id, projectId));
    return { ok: true };
  });
}

// ---------- generic entity CRUD ----------
async function touchProject(tx: Tx, projectId: string) {
  await tx
    .update(projects)
    .set({ updatedAt: new Date() })
    .where(eq(projects.id, projectId));
}

export async function createEntity(
  orgId: string,
  projectId: string,
  entity: EntityName,
  data: Record<string, unknown>,
) {
  const cfg = entityConfig[entity];
  return withTenant(orgId, async (tx) => {
    const id = (data.id as string) || genId(cfg.prefix);
    const [row] = await tx
      .insert(cfg.table)
      .values({ ...data, id, orgId, projectId } as never)
      .returning();
    await touchProject(tx, projectId);
    return row;
  });
}

export async function updateEntity(
  orgId: string,
  projectId: string,
  entity: EntityName,
  id: string,
  data: Record<string, unknown>,
) {
  const cfg = entityConfig[entity];
  return withTenant(orgId, async (tx) => {
    const [row] = await tx
      .update(cfg.table)
      .set(data as never)
      .where(and(eq(cfg.table.projectId, projectId), eq(cfg.table.id, id)))
      .returning();
    await touchProject(tx, projectId);
    return row ?? null;
  });
}

export async function deleteEntity(
  orgId: string,
  projectId: string,
  entity: EntityName,
  id: string,
) {
  const cfg = entityConfig[entity];
  return withTenant(orgId, async (tx) => {
    await tx
      .delete(cfg.table)
      .where(and(eq(cfg.table.projectId, projectId), eq(cfg.table.id, id)));
    await touchProject(tx, projectId);
    return { ok: true };
  });
}
