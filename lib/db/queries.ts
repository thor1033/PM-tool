import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { schema } from "@/lib/db/client";
import { withTenant } from "@/lib/db/tenant";
import { blankProjectDocs } from "@/lib/templates";
import { entityConfig, genId, type EntityName } from "@/lib/entities";
import type { ProjectSummary, WorkingSet } from "@/lib/types";

// Only the tables still referenced through the ORM. The working set reads
// every table in one raw statement, so the rest are named there instead.
// `activity` stays because recordActivity appends to it one row at a time.
const { projects, tasks, activity } = schema;

type Tx = Parameters<Parameters<typeof withTenant<unknown>>[1]>[0];

/**
 * Confirm a project belongs to the calling org.
 *
 * Every query here already runs inside `withTenant`, but the RLS policies that
 * makes enforceable are dormant on Neon (`neondb_owner` carries BYPASSRLS), so
 * a query without an explicit `org_id` predicate returns other tenants' rows.
 * The predicates below are therefore the real boundary, not a second layer.
 * Gating on the project is enough for its collections: project ids are UUIDs,
 * so a caller cannot reach another org's rows without first naming a project
 * this returns false for.
 */
async function projectInOrg(tx: Tx, orgId: string, projectId: string): Promise<boolean> {
  const [row] = await tx
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.orgId, orgId)));
  return Boolean(row);
}

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
      .where(eq(projects.orgId, orgId))
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
  // One statement instead of fourteen. Every read used to be its own round
  // trip on a single transaction connection, and a connection serialises —
  // pipelining them changes nothing, so the ~47ms latency to the database was
  // paid fourteen times over (~620ms) before anything rendered. Aggregating
  // each table to JSON in one query makes that a single trip (~80ms).
  //
  // The transaction stays: row-level security reads `app.current_org` from
  // the connection, so the setting and the query have to share one.
  //
  // Every sub-select still filters on org_id explicitly. Those policies are
  // dormant on Neon (neondb_owner carries BYPASSRLS), so the predicates below
  // are the enforced boundary, not a redundant second layer — dropping one
  // makes another tenant's rows readable to anyone who can name a project id.
  return withTenant(orgId, async (tx) => {
    const res = await tx.execute(sql`
      select
        (select row_to_json(p) from projects p where p.id = ${projectId} and p.org_id = ${orgId}) as project,
        (select coalesce(json_agg(x order by x.position), '[]'::json) from tasks x where x.project_id = ${projectId} and x.org_id = ${orgId}) as tasks,
        (select coalesce(json_agg(x), '[]'::json) from risks x where x.project_id = ${projectId} and x.org_id = ${orgId}) as risks,
        (select coalesce(json_agg(x), '[]'::json) from stakeholders x where x.project_id = ${projectId} and x.org_id = ${orgId}) as stakeholders,
        (select coalesce(json_agg(x), '[]'::json) from members x where x.project_id = ${projectId} and x.org_id = ${orgId}) as members,
        (select coalesce(json_agg(x), '[]'::json) from findings x where x.project_id = ${projectId} and x.org_id = ${orgId}) as findings,
        (select coalesce(json_agg(x), '[]'::json) from products x where x.project_id = ${projectId} and x.org_id = ${orgId}) as products,
        (select coalesce(json_agg(x), '[]'::json) from milestones x where x.project_id = ${projectId} and x.org_id = ${orgId}) as milestones,
        (select coalesce(json_agg(x), '[]'::json) from tags x where x.project_id = ${projectId} and x.org_id = ${orgId}) as tags,
        (select coalesce(json_agg(x), '[]'::json) from phases x where x.project_id = ${projectId} and x.org_id = ${orgId}) as phases,
        (select coalesce(json_agg(x), '[]'::json) from categories x where x.project_id = ${projectId} and x.org_id = ${orgId}) as categories,
        (select coalesce(json_agg(x), '[]'::json) from externals x where x.project_id = ${projectId} and x.org_id = ${orgId}) as externals,
        (select coalesce(json_agg(x), '[]'::json) from notes x where x.project_id = ${projectId} and x.org_id = ${orgId}) as notes,
        (select coalesce(json_agg(x order by x.ts desc), '[]'::json) from activity x where x.project_id = ${projectId} and x.org_id = ${orgId}) as activity
    `);

    // drizzle's `execute` returns the driver's result verbatim, and the shape
    // differs between drivers: the node-postgres style exposes `.rows`, others
    // return the array itself. Accept both rather than depending on one.
    const rows = (Array.isArray(res) ? res : res?.rows) as
      | Record<string, unknown>[]
      | undefined;
    const row = rows?.[0] ?? null;
    if (!row?.project) return null;

    // Postgres returns snake_case columns; the app speaks camelCase, so the
    // mapping the ORM used to do implicitly happens here instead.
    return camelizeWorkingSet(row) as WorkingSet;
  });
}

/** Recursively converts snake_case keys to camelCase. Dates arrive as ISO
 *  strings from json_agg rather than Date objects, which is what the API
 *  serialises to anyway. */
function camelizeWorkingSet(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(camelizeWorkingSet);
  if (value && typeof value === "object" && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())] = camelizeWorkingSet(v);
    }
    return out;
  }
  return value;
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
      .where(and(eq(projects.id, projectId), eq(projects.orgId, orgId)))
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
      .where(and(eq(projects.parentId, projectId), eq(projects.orgId, orgId)));
    await tx
      .delete(projects)
      .where(and(eq(projects.id, projectId), eq(projects.orgId, orgId)));
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
    if (!(await projectInOrg(tx, orgId, projectId))) return null;
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
      .where(
        and(
          eq(cfg.table.orgId, orgId),
          eq(cfg.table.projectId, projectId),
          eq(cfg.table.id, id),
        ),
      )
      .returning();
    await touchProject(tx, projectId);
    return row ?? null;
  });
}

/**
 * Updates a task and, in the same transaction, the subtasks that must follow
 * it.
 *
 * One transaction rather than a call per row: a subtask sitting under a
 * milestone its parent has left is exactly the orphan state the hierarchy
 * forbids, and a partial write would create it and leave it there.
 */
export async function updateTaskWithSubtasks(
  orgId: string,
  projectId: string,
  id: string,
  data: Record<string, unknown>,
  children: { id: string; data: Record<string, unknown> }[],
) {
  const cfg = entityConfig.tasks;
  return withTenant(orgId, async (tx) => {
    const [row] = await tx
      .update(cfg.table)
      .set(data as never)
      .where(and(eq(cfg.table.projectId, projectId), eq(cfg.table.id, id)))
      .returning();
    if (!row) return null;
    for (const child of children) {
      await tx
        .update(cfg.table)
        .set(child.data as never)
        .where(and(eq(cfg.table.projectId, projectId), eq(cfg.table.id, child.id)));
    }
    await touchProject(tx, projectId);
    return row;
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
      .where(
        and(
          eq(cfg.table.orgId, orgId),
          eq(cfg.table.projectId, projectId),
          eq(cfg.table.id, id),
        ),
      );
    await touchProject(tx, projectId);
    return { ok: true };
  });
}

// ---------- activity ----------

/**
 * Append an audit-trail entry.
 *
 * The browser writes its trail through POST /api/projects/[id]/audit, which
 * resolves the actor from the signed-in session. Machine callers (the MCP
 * endpoint) have no session and no stakeholder to resolve to, so they pass an
 * explicit actor label — an agent edit must still be attributable, and an
 * unattributed change is worse than a loosely attributed one.
 */
export async function recordActivity(
  orgId: string,
  projectId: string,
  entry: { kind: string; text: string; actor: string },
) {
  return withTenant(orgId, async (tx) => {
    if (!(await projectInOrg(tx, orgId, projectId))) return null;
    const values = {
      id: genId("act"),
      orgId,
      projectId,
      kind: entry.kind,
      text: entry.text,
      actor: entry.actor,
      ts: new Date(),
    };
    await tx.insert(activity).values(values);
    return values;
  });
}
