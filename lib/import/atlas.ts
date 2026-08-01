/* ============================================================
   Atlas workspace → Postgres importer.
   Maps a project object in the legacy app shape (meta, tasks,
   risks, …, tags/phases/categories) into normalized rows +
   JSONB document columns. Shared by the seed script and the
   /api/import route.
   ============================================================ */
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { schema } from "@/lib/db/client";
import { withTenant } from "@/lib/db/tenant";

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
  externals,
} = schema;

// Permissive shape — import data originates outside our control.
type Any = Record<string, unknown>;
export interface AtlasProject {
  id?: string;
  meta?: { project?: string; code?: string };
  color?: string;
  parentId?: string | null;
  createdAt?: number;
  updatedAt?: number;
  tasks?: Any[];
  risks?: Any[];
  stakeholders?: Any[];
  members?: Any[];
  findings?: Any[];
  products?: Any[];
  milestones?: Any[];
  externals?: Any[];
  tags?: Any[];
  phases?: Any[];
  categories?: Any[];
  org?: unknown;
  businessCase?: unknown;
  scope?: unknown;
  assessment?: unknown;
  commPlan?: unknown;
  changePlan?: unknown;
  glossary?: unknown;
  kpis?: unknown;
  financials?: unknown;
  forecast?: unknown;
  startup?: unknown;
  settings?: unknown;
}

export interface AtlasWorkspace {
  version?: number;
  projects?: AtlasProject[];
}

const arr = (v: unknown): Any[] => (Array.isArray(v) ? (v as Any[]) : []);
const str = (v: unknown, fb = ""): string => (typeof v === "string" ? v : fb);
const strOrNull = (v: unknown): string | null =>
  typeof v === "string" && v.length ? v : null;
const strList = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
const ts = (v: unknown): Date =>
  typeof v === "number" ? new Date(v) : new Date();

type Tx = Parameters<Parameters<typeof withTenant<void>>[1]>[0];

/** Insert all projects of a workspace for one org, inside an existing tx. */
export async function insertWorkspace(
  tx: Tx,
  orgId: string,
  ws: AtlasWorkspace,
): Promise<{ idMap: Record<string, string>; count: number }> {
  const list = arr(ws.projects) as AtlasProject[];
  const idMap: Record<string, string> = {};

  // Pass 1 — create project rows (parent set in pass 2).
  for (const p of list) {
    const newId = randomUUID();
    if (p.id) idMap[p.id] = newId;
    await tx.insert(projects).values({
      id: newId,
      orgId,
      name: str(p.meta?.project, "Untitled project"),
      code: str(p.meta?.code),
      color: str(p.color, "indigo"),
      parentId: null,
      businessCase: (p.businessCase ?? {}) as object,
      scope: (p.scope ?? { inScope: [], outScope: [] }) as object,
      assessment: (p.assessment ?? []) as object,
      commPlan: (p.commPlan ?? []) as object,
      changePlan: (p.changePlan ?? { groups: [] }) as object,
      orgChart: (p.org ?? []) as object,
      glossary: (p.glossary ?? []) as object,
      kpis: (p.kpis ?? []) as object,
      financials: (p.financials ?? {}) as object,
      forecast: (p.forecast ?? { bufferPct: 15, weighting: "duration" }) as object,
      startup: (p.startup ?? {}) as object,
      settings: (p.settings ?? {}) as object,
      createdAt: ts(p.createdAt),
      updatedAt: ts(p.updatedAt),
    });
  }

  // Pass 2 — resolve parent links.
  for (const p of list) {
    if (p.id && p.parentId && idMap[p.parentId]) {
      await tx
        .update(projects)
        .set({ parentId: idMap[p.parentId] })
        .where(eq(projects.id, idMap[p.id]));
    }
  }

  // Pass 3 — child rows per project.
  for (const p of list) {
    const pid = p.id ? idMap[p.id] : undefined;
    if (!pid) continue;
    await insertChildren(tx, orgId, pid, p);
  }

  return { idMap, count: list.length };
}

async function insertChildren(
  tx: Tx,
  orgId: string,
  projectId: string,
  p: AtlasProject,
) {
  const base = { orgId, projectId };

  const taskRows = arr(p.tasks).map((t, i) => ({
    ...base,
    id: str(t.id) || `t_${randomUUID().slice(0, 8)}`,
    title: str(t.title, "Untitled task"),
    status: str(t.status, "backlog"),
    phase: strOrNull(t.phase),
    category: strOrNull(t.category),
    priority: str(t.priority, "med"),
    description: str(t.desc),
    start: str(t.start),
    end: str(t.end),
    position: i,
    tags: strList(t.tags),
    assignees: strList(t.assignees),
    deps: arr(t.deps) as never,
    parentId: strOrNull(t.parentId),
    comments: arr(t.comments) as never,
    custom: (t.custom && typeof t.custom === "object" && !Array.isArray(t.custom)
      ? t.custom
      : {}) as never,
  }));
  if (taskRows.length) await tx.insert(tasks).values(taskRows);

  const riskRows = arr(p.risks).map((r) => ({
    ...base,
    id: str(r.id) || `r_${randomUUID().slice(0, 8)}`,
    title: str(r.title),
    likelihood: str(r.likelihood, "med"),
    impact: str(r.impact, "med"),
    mitigation: str(r.mitigation),
    owner: str(r.owner),
    status: str(r.status, "open"),
    taskIds: strList(r.taskIds),
  }));
  if (riskRows.length) await tx.insert(risks).values(riskRows);

  const stakeholderRows = arr(p.stakeholders).map((s) => ({
    ...base,
    id: str(s.id) || `s_${randomUUID().slice(0, 8)}`,
    name: str(s.name),
    title: str(s.title),
    role: str(s.role),
    responsibility: str(s.responsibility),
    influence: str(s.influence, "med"),
    interest: str(s.interest, "med"),
    contact: str(s.contact),
  }));
  if (stakeholderRows.length)
    await tx.insert(stakeholders).values(stakeholderRows);

  const memberRows = arr(p.members).map((m) => ({
    ...base,
    id: str(m.id) || `mem_${randomUUID().slice(0, 8)}`,
    name: str(m.name),
    role: str(m.role),
    email: str(m.email),
    color: str(m.color, "blue"),
    capacityHours: typeof m.capacityHours === "number" ? m.capacityHours : 30,
    availability: (m.availability && typeof m.availability === "object" && !Array.isArray(m.availability)
      ? m.availability
      : {}) as never,
  }));
  if (memberRows.length) await tx.insert(members).values(memberRows);

  const findingRows = arr(p.findings).map((f) => ({
    ...base,
    id: str(f.id) || `f_${randomUUID().slice(0, 8)}`,
    title: str(f.title),
    category: str(f.category),
    summary: str(f.summary),
    source: str(f.source),
  }));
  if (findingRows.length) await tx.insert(findings).values(findingRows);

  const productRows = arr(p.products).map((pr) => ({
    ...base,
    id: str(pr.id) || `p_${randomUUID().slice(0, 8)}`,
    name: str(pr.name),
    type: str(pr.type, "pdf"),
    url: str(pr.url),
    taskIds: strList(pr.taskIds),
    phase: strOrNull(pr.phase),
    date: str(pr.date),
    note: str(pr.note),
    placeholder: pr.placeholder !== false,
  }));
  if (productRows.length) await tx.insert(products).values(productRows);

  const milestoneRows = arr(p.milestones).map((ms) => ({
    ...base,
    id: str(ms.id) || `ms_${randomUUID().slice(0, 8)}`,
    title: str(ms.title),
    type: str(ms.type, "milestone"),
    date: str(ms.date),
    category: strOrNull(ms.category),
    note: str(ms.note),
  }));
  if (milestoneRows.length) await tx.insert(milestones).values(milestoneRows);

  const externalRows = arr(p.externals).map((e) => ({
    ...base,
    id: str(e.id) || `ext_${randomUUID().slice(0, 8)}`,
    title: str(e.title),
    party: str(e.party),
    owner: str(e.owner),
    due: str(e.due),
    status: str(e.status, "pending"),
    note: str(e.note),
  }));
  if (externalRows.length) await tx.insert(externals).values(externalRows);

  const tagRows = arr(p.tags).map((t) => ({
    ...base,
    id: str(t.id),
    label: str(t.label),
    color: str(t.color, "blue"),
  }));
  if (tagRows.length) await tx.insert(tags).values(tagRows);

  const phaseRows = arr(p.phases).map((ph) => ({
    ...base,
    id: str(ph.id),
    label: str(ph.label),
    color: str(ph.color, "teal"),
  }));
  if (phaseRows.length) await tx.insert(phases).values(phaseRows);

  const categoryRows = arr(p.categories).map((c) => ({
    ...base,
    id: str(c.id),
    label: str(c.label),
    color: str(c.color, "purple"),
  }));
  if (categoryRows.length) await tx.insert(categories).values(categoryRows);
}

/** Convenience: import a workspace for an org in its own tenant transaction. */
export async function importWorkspaceForOrg(
  orgId: string,
  ws: AtlasWorkspace,
) {
  return withTenant(orgId, (tx) => insertWorkspace(tx, orgId, ws));
}
