import "server-only";
import { z } from "zod";
import {
  listProjects,
  getWorkingSet,
  createEntity,
  updateEntity,
  recordActivity,
} from "@/lib/db/queries";
import { entityConfig } from "@/lib/entities";
import type { MachineContext } from "@/lib/api/machineAuth";
import type { Task, Risk, Milestone } from "@/lib/db/schema";

/*
 * The tools the AI Hub sees on this workspace.
 *
 * Two rules shape this file:
 *
 * 1. Tools are verbs, not tables. A generic `list_entity(entity)` would force
 *    the model to learn the schema before it can ask anything useful — it would
 *    have to know `findings` is pre-analysis and `externals` is third parties.
 *    These tools answer questions a delivery lead would actually ask.
 * 2. Everything goes through lib/db/queries.ts, never raw SQL. That layer is
 *    where `withTenant` lives, and `withTenant` is the enforced tenant boundary
 *    (RLS is dormant on Neon). A tool that bypassed it would be cross-tenant
 *    readable by construction.
 */

const TASK_STATUSES = ["backlog", "inprogress", "done"] as const;

/** MCP tools return content blocks; every tool here answers with JSON text. */
const json = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
});

const fail = (message: string) => ({
  content: [{ type: "text" as const, text: `Error: ${message}` }],
  isError: true,
});

const today = () => new Date().toISOString().slice(0, 10);

/** Tasks and milestones store plain ISO dates, and "" when unset. */
const isPast = (date: string) => date !== "" && date < today();

// ── read shapes ──────────────────────────────────────────────────────────────
// Trimmed projections rather than whole rows: a working set carries jsonb
// columns (deps, comments, custom) that would burn the agent's context without
// telling it anything it asked for.

function taskView(t: Task) {
  return {
    id: t.id,
    title: t.title,
    status: t.status,
    kind: t.kind,
    track: t.category,
    milestoneId: t.milestoneId,
    owner: (Array.isArray(t.assignees) ? t.assignees : [])[0] ?? null,
    start: t.start || null,
    end: t.end || null,
    completedOn: t.completedOn || null,
    overdue: t.status !== "done" && isPast(t.end),
    description: t.description || null,
  };
}

const riskView = (r: Risk) => ({
  id: r.id,
  title: r.title,
  likelihood: r.likelihood,
  impact: r.impact,
  status: r.status,
  owner: r.owner || null,
  mitigation: r.mitigation || null,
});

const milestoneView = (m: Milestone) => ({
  id: m.id,
  title: m.title,
  type: m.type,
  date: m.date || null,
  track: m.category,
});

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: z.ZodRawShape;
  /** Writes are only registered for tokens carrying the "write" scope. */
  write?: boolean;
  handler: (
    args: Record<string, unknown>,
    ctx: MachineContext,
  ) => Promise<ReturnType<typeof json>>;
}

// ── read tools ───────────────────────────────────────────────────────────────

const listProjectsTool: ToolDef = {
  name: "pm_list_projects",
  description:
    "List every project (client engagement) in this workspace, with task counts and when each was last touched. Start here to find a project id.",
  inputSchema: {},
  handler: async (_args, ctx) => json(await listProjects(ctx.orgId)),
};

const SECTIONS = [
  "tasks",
  "risks",
  "stakeholders",
  "milestones",
  "products",
  "findings",
  "notes",
  "externals",
  "members",
  "activity",
] as const;

const getProjectTool: ToolDef = {
  name: "pm_get_project",
  description:
    "Get one project's detail: its documents (business case, scope, KPIs, plans) plus whichever collections you ask for. Request only the sections you need — the full set is large.",
  inputSchema: {
    projectId: z.string().describe("Project id from pm_list_projects."),
    sections: z
      .array(z.enum(SECTIONS))
      .optional()
      .describe(
        `Collections to include. Defaults to tasks, risks and milestones. Available: ${SECTIONS.join(", ")}.`,
      ),
  },
  handler: async (args, ctx) => {
    const projectId = String(args.projectId ?? "");
    const ws = await getWorkingSet(ctx.orgId, projectId);
    if (!ws) return fail(`No project "${projectId}" in this workspace.`);

    const wanted = new Set(
      (args.sections as string[] | undefined) ?? ["tasks", "risks", "milestones"],
    );
    const out: Record<string, unknown> = { project: ws.project };
    if (wanted.has("tasks")) out.tasks = ws.tasks.map(taskView);
    if (wanted.has("risks")) out.risks = ws.risks.map(riskView);
    if (wanted.has("milestones")) out.milestones = ws.milestones.map(milestoneView);
    if (wanted.has("stakeholders")) out.stakeholders = ws.stakeholders;
    if (wanted.has("products")) out.products = ws.products;
    if (wanted.has("findings")) out.findings = ws.findings;
    if (wanted.has("notes")) out.notes = ws.notes;
    if (wanted.has("externals")) out.externals = ws.externals;
    if (wanted.has("members")) out.members = ws.members;
    if (wanted.has("activity")) out.activity = ws.activity;
    return json(out);
  },
};

const listTasksTool: ToolDef = {
  name: "pm_list_tasks",
  description:
    "List a project's tasks, optionally narrowed by status, owner, track or milestone.",
  inputSchema: {
    projectId: z.string(),
    status: z.enum(TASK_STATUSES).optional(),
    owner: z.string().optional().describe("Match the task's assigned person by name."),
    milestoneId: z.string().optional(),
    overdueOnly: z
      .boolean()
      .optional()
      .describe("Only unfinished tasks whose planned end date has passed."),
  },
  handler: async (args, ctx) => {
    const projectId = String(args.projectId ?? "");
    const ws = await getWorkingSet(ctx.orgId, projectId);
    if (!ws) return fail(`No project "${projectId}" in this workspace.`);

    const owner = (args.owner as string | undefined)?.trim().toLowerCase();
    const tasks = ws.tasks.map(taskView).filter((t) => {
      if (args.status && t.status !== args.status) return false;
      if (args.milestoneId && t.milestoneId !== args.milestoneId) return false;
      if (args.overdueOnly && !t.overdue) return false;
      if (owner && (t.owner ?? "").toLowerCase() !== owner) return false;
      return true;
    });
    return json({ projectId, count: tasks.length, tasks });
  },
};

const listRisksTool: ToolDef = {
  name: "pm_list_risks",
  description: "List a project's risks, optionally narrowed by status.",
  inputSchema: {
    projectId: z.string(),
    status: z.string().optional().describe("e.g. open, closed."),
  },
  handler: async (args, ctx) => {
    const projectId = String(args.projectId ?? "");
    const ws = await getWorkingSet(ctx.orgId, projectId);
    if (!ws) return fail(`No project "${projectId}" in this workspace.`);
    const status = (args.status as string | undefined)?.trim().toLowerCase();
    const risks = ws.risks
      .map(riskView)
      .filter((r) => !status || r.status.toLowerCase() === status);
    return json({ projectId, count: risks.length, risks });
  },
};

const projectStatusTool: ToolDef = {
  name: "pm_project_status",
  description:
    "A delivery status digest for one project: progress by status, what is overdue, what is due next, open high-impact risks, and recent activity. Use this to report on or summarize a project instead of fetching everything.",
  inputSchema: {
    projectId: z.string(),
    horizonDays: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("How far ahead 'due next' looks. Defaults to 14 days."),
  },
  handler: async (args, ctx) => {
    const projectId = String(args.projectId ?? "");
    const ws = await getWorkingSet(ctx.orgId, projectId);
    if (!ws) return fail(`No project "${projectId}" in this workspace.`);

    const horizon = (args.horizonDays as number | undefined) ?? 14;
    const now = today();
    const until = new Date(Date.now() + horizon * 86_400_000)
      .toISOString()
      .slice(0, 10);

    const tasks = ws.tasks.map(taskView);
    const byStatus = Object.fromEntries(
      TASK_STATUSES.map((s) => [s, tasks.filter((t) => t.status === s).length]),
    );
    const done = byStatus.done ?? 0;

    return json({
      project: { id: ws.project.id, name: ws.project.name, code: ws.project.code },
      progress: {
        ...byStatus,
        total: tasks.length,
        percentComplete: tasks.length ? Math.round((done / tasks.length) * 100) : 0,
      },
      overdue: tasks.filter((t) => t.overdue),
      dueNext: tasks.filter(
        (t) => t.status !== "done" && t.end && t.end >= now && t.end <= until,
      ),
      upcomingMilestones: ws.milestones
        .map(milestoneView)
        .filter((m) => m.date && m.date >= now && m.date <= until),
      missedMilestones: ws.milestones
        .map(milestoneView)
        .filter((m) => m.date && m.date < now),
      openRisks: ws.risks
        .map(riskView)
        .filter((r) => r.status.toLowerCase() === "open")
        .sort((a, b) => (b.impact === "high" ? 1 : 0) - (a.impact === "high" ? 1 : 0)),
      recentActivity: ws.activity.slice(0, 10).map((a) => ({
        ts: a.ts,
        kind: a.kind,
        text: a.text,
        actor: a.actor,
      })),
    });
  },
};

// ── write tools ──────────────────────────────────────────────────────────────
// Every write records its own audit entry. The browser writes the trail from
// the client after an edit; an agent that skipped it would mutate a client's
// delivery record invisibly, which is exactly the thing the trail exists to
// prevent. `actor` is the token's label, so an agent edit reads as one.

async function requireProject(ctx: MachineContext, projectId: string) {
  const ws = await getWorkingSet(ctx.orgId, projectId);
  return ws;
}

const createTaskTool: ToolDef = {
  name: "pm_create_task",
  description:
    "Add a task to a project. Records an audit-trail entry attributed to the AI hub.",
  write: true,
  inputSchema: {
    projectId: z.string(),
    title: z.string().min(1),
    status: z.enum(TASK_STATUSES).optional().describe("Defaults to backlog."),
    description: z.string().optional(),
    start: z.string().optional().describe("Planned start, ISO date (YYYY-MM-DD)."),
    end: z.string().optional().describe("Planned end, ISO date (YYYY-MM-DD)."),
    owner: z.string().optional().describe("Person's name, as it appears on the project."),
    track: z.string().optional().describe("Track/category id this task belongs to."),
    milestoneId: z.string().optional(),
  },
  handler: async (args, ctx) => {
    const projectId = String(args.projectId ?? "");
    const ws = await requireProject(ctx, projectId);
    if (!ws) return fail(`No project "${projectId}" in this workspace.`);

    const owner = args.owner as string | undefined;
    const draft = {
      title: String(args.title),
      status: (args.status as string) ?? "backlog",
      description: (args.description as string) ?? "",
      start: (args.start as string) ?? "",
      end: (args.end as string) ?? "",
      assignees: owner ? [owner] : [],
      category: (args.track as string) ?? null,
      milestoneId: (args.milestoneId as string) ?? null,
      position: ws.tasks.length,
    };

    // Validate against the same schema the REST routes use, so a tool can never
    // write a shape the UI cannot render.
    const parsed = entityConfig.tasks.schema.safeParse(draft);
    if (!parsed.success) return fail(`Invalid task: ${parsed.error.message}`);

    const row = await createEntity(ctx.orgId, projectId, "tasks", parsed.data);
    if (!row) return fail(`Could not create the task in project "${projectId}".`);
    await recordActivity(ctx.orgId, projectId, {
      kind: "create",
      text: `Added task "${draft.title}"`,
      actor: ctx.label,
    });
    return json(row);
  },
};

const updateTaskTool: ToolDef = {
  name: "pm_update_task",
  description:
    "Update an existing task — status, dates, owner, title or description. Only the fields you pass are changed. Records an audit-trail entry attributed to the AI hub.",
  write: true,
  inputSchema: {
    projectId: z.string(),
    taskId: z.string(),
    title: z.string().optional(),
    status: z.enum(TASK_STATUSES).optional(),
    description: z.string().optional(),
    start: z.string().optional(),
    end: z.string().optional(),
    owner: z.string().optional(),
    milestoneId: z.string().optional(),
  },
  handler: async (args, ctx) => {
    const projectId = String(args.projectId ?? "");
    const taskId = String(args.taskId ?? "");
    const ws = await requireProject(ctx, projectId);
    if (!ws) return fail(`No project "${projectId}" in this workspace.`);

    const existing = ws.tasks.find((t) => t.id === taskId);
    if (!existing) return fail(`No task "${taskId}" in project "${projectId}".`);

    const patch: Record<string, unknown> = {};
    for (const field of ["title", "status", "description", "start", "end", "milestoneId"]) {
      if (args[field] !== undefined) patch[field] = args[field];
    }
    if (args.owner !== undefined) patch.assignees = args.owner ? [args.owner] : [];

    // The board sets completedOn when a card reaches done; a tool moving the
    // same task must keep that in step or the delivery-vs-plan comparison lies.
    if (patch.status === "done" && existing.status !== "done") {
      patch.completedOn = today();
    } else if (
      patch.status !== undefined &&
      patch.status !== "done" &&
      existing.status === "done"
    ) {
      patch.completedOn = "";
    }

    if (Object.keys(patch).length === 0) return fail("No fields to update.");

    const parsed = entityConfig.tasks.schema.safeParse(patch);
    if (!parsed.success) return fail(`Invalid update: ${parsed.error.message}`);

    const row = await updateEntity(ctx.orgId, projectId, "tasks", taskId, parsed.data);
    if (!row) return fail(`Could not update task "${taskId}".`);

    const movedToDone = patch.status === "done" && existing.status !== "done";
    const changed = Object.keys(patch).filter((k) => k !== "completedOn");
    await recordActivity(ctx.orgId, projectId, {
      kind: movedToDone ? "done" : "edit",
      text: movedToDone
        ? `Completed "${existing.title}"`
        : `Updated ${changed.join(", ")} on "${existing.title}"`,
      actor: ctx.label,
    });
    return json(row);
  },
};

const addNoteTool: ToolDef = {
  name: "pm_add_note",
  description:
    "Add a note to a project — a meeting record, a decision, or a piece of context. Optionally attach it to a task. Records an audit-trail entry attributed to the AI hub.",
  write: true,
  inputSchema: {
    projectId: z.string(),
    title: z.string().min(1),
    body: z.string(),
    date: z.string().optional().describe("ISO date (YYYY-MM-DD). Defaults to today."),
    taskId: z.string().optional().describe("Attach the note to this task."),
  },
  handler: async (args, ctx) => {
    const projectId = String(args.projectId ?? "");
    const ws = await requireProject(ctx, projectId);
    if (!ws) return fail(`No project "${projectId}" in this workspace.`);

    const taskId = (args.taskId as string) ?? null;
    if (taskId && !ws.tasks.some((t) => t.id === taskId)) {
      return fail(`No task "${taskId}" in project "${projectId}".`);
    }

    const draft = {
      title: String(args.title),
      body: String(args.body ?? ""),
      date: (args.date as string) ?? today(),
      taskId,
      category: null,
    };
    const parsed = entityConfig.notes.schema.safeParse(draft);
    if (!parsed.success) return fail(`Invalid note: ${parsed.error.message}`);

    const row = await createEntity(ctx.orgId, projectId, "notes", parsed.data);
    if (!row) return fail(`Could not create the note in project "${projectId}".`);
    await recordActivity(ctx.orgId, projectId, {
      kind: "create",
      text: `Added note "${draft.title}"`,
      actor: ctx.label,
    });
    return json(row);
  },
};

export const TOOLS: ToolDef[] = [
  listProjectsTool,
  getProjectTool,
  listTasksTool,
  listRisksTool,
  projectStatusTool,
  createTaskTool,
  updateTaskTool,
  addNoteTool,
];

/** The tools a given token may see — writes are omitted without the scope. */
export function toolsFor(ctx: MachineContext): ToolDef[] {
  return TOOLS.filter((t) => !t.write || ctx.scopes.includes("write"));
}
