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
import { checkTask, milestoneLeftBehind } from "@/lib/hierarchy";
import { resolveActor, type StakeholderLike } from "@/lib/actor";
import { similarToAny, overlappingPairs } from "@/lib/similarity";

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

/** How much a task may say before it stops being scannable. Tasks made from
 *  transcripts had grown descriptions nobody could read at a glance. Long
 *  background belongs in a note (pm_add_note), attached to the task. */
const TITLE_MAX = 90;
const DESCRIPTION_MAX = 800;
const DELIVERABLE_MAX = 300;
const ROLE_MAX = 140;

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
    priority: t.priority,
    owner: (Array.isArray(t.assignees) ? t.assignees : [])[0] ?? null,
    involved: Array.isArray(t.involved) ? t.involved : [],
    involvedRoles:
      t.involvedRoles && typeof t.involvedRoles === "object" && !Array.isArray(t.involvedRoles)
        ? t.involvedRoles
        : {},
    deliverable: t.deliverable || "",
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
  track: m.category,
  reachedOn: m.reachedOn || null,
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
    "List a project's tasks, optionally narrowed by status, owner, person, track or milestone.",
  inputSchema: {
    projectId: z.string(),
    status: z.enum(TASK_STATUSES).optional(),
    owner: z.string().optional().describe("Match the task's assigned person by name."),
    person: z
      .string()
      .optional()
      .describe("Match anyone the task concerns (its owner or anyone involved) by name."),
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
    const person = (args.person as string | undefined)?.trim().toLowerCase();
    const tasks = ws.tasks.map(taskView).filter((t) => {
      if (args.status && t.status !== args.status) return false;
      if (args.milestoneId && t.milestoneId !== args.milestoneId) return false;
      if (args.overdueOnly && !t.overdue) return false;
      if (owner && (t.owner ?? "").toLowerCase() !== owner) return false;
      if (
        person &&
        ![t.owner ?? "", ...t.involved].some((n) => n.toLowerCase() === person)
      ) {
        return false;
      }
      return true;
    });
    return json({ projectId, count: tasks.length, tasks });
  },
};

const findSimilarTool: ToolDef = {
  name: "pm_find_similar_tasks",
  description:
    "Find open tasks that overlap a draft. When working from a transcript, ALWAYS give the title in both Danish (titleDa) and English (titleEn): you translate it yourself before calling, because matching is by shared words and tasks are written in either language. Both versions are checked and each task keeps its best score; one language alone works but will miss tasks written in the other. Only unfinished tasks are compared; done tasks are ignored. Call this BEFORE creating a task from a transcript and, if something scores above about 0.5, extend that task instead of creating another. Give only the project (no titles) to get pairs of existing open tasks that look mergeable. Scores are a hint to review, not a verdict.",
  inputSchema: {
    projectId: z.string(),
    titleDa: z.string().optional().describe("The draft title in Danish."),
    titleEn: z.string().optional().describe("The draft title in English."),
    description: z
      .string()
      .optional()
      .describe("Optional context in either language; it is matched under both titles."),
    minScore: z.number().min(0).max(1).optional(),
  },
  handler: async (args, ctx) => {
    const projectId = String(args.projectId ?? "");
    const ws = await getWorkingSet(ctx.orgId, projectId);
    if (!ws) return fail(`No project "${projectId}" in this workspace.`);

    // Finished tasks are never candidates: nobody extends work that is closed.
    const candidates = ws.tasks.filter((t) => t.status !== "done");
    const minScore = args.minScore as number | undefined;
    const titleDa = ((args.titleDa as string | undefined) ?? "").trim();
    const titleEn = ((args.titleEn as string | undefined) ?? "").trim();

    if (!titleDa && !titleEn) {
      return json({
        projectId,
        pairs: overlappingPairs(candidates, { minScore }),
        note: "Pairs of unfinished tasks that share distinctive words. Review each before merging.",
      });
    }
    const description = (args.description as string | undefined) ?? "";
    return json({
      projectId,
      comparedAgainst: candidates.length,
      similar: similarToAny(
        [
          { title: titleDa, description },
          { title: titleEn, description },
        ].filter((d) => d.title),
        candidates,
        { minScore },
      ),
    });
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
    const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);

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
      // Milestones carry no date, so nothing about them is upcoming or
      // missed — only open, or checked off by someone.
      openMilestones: ws.milestones.map(milestoneView).filter((m) => !m.reachedOn),
      recentlyReachedMilestones: ws.milestones
        .map(milestoneView)
        .filter((m) => m.reachedOn && m.reachedOn >= weekAgo),
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
// prevent. When a person stands behind the call, `actor` is that person
// as the project's stakeholder list names them, marked as an MCP edit;
// otherwise it is the token's label, so a service edit reads as one.

async function requireProject(ctx: MachineContext, projectId: string) {
  const ws = await getWorkingSet(ctx.orgId, projectId);
  return ws;
}

function actorFor(ctx: MachineContext, stakeholders: StakeholderLike[]): string {
  if (!ctx.person) return ctx.label;
  const who = resolveActor(ctx.person, stakeholders);
  // An address that matches no one gives no name to show; the label does.
  if (!who.matched && !ctx.person.name?.trim()) return ctx.label;
  return `${who.name} (via ${ctx.via ?? "MCP"})`;
}

/** People on a task, as a tool may name them: just a name, or a name with
 *  what they do. A role is optional here; only the transcript tool demands one. */
const involvedLoose = z.array(
  z.union([z.string(), z.object({ name: z.string().min(1), role: z.string().optional() })]),
);
type InvolvedArg = z.infer<typeof involvedLoose>;

function splitInvolved(list: InvolvedArg | undefined, owner: string | undefined) {
  // The owner is already on the task, so naming them again as involved
  // would only list them twice.
  const people = (list ?? [])
    .map((p) => (typeof p === "string" ? { name: p, role: "" } : { name: p.name, role: p.role ?? "" }))
    .filter((p) => p.name && p.name !== owner);
  return {
    involved: people.map((p) => p.name),
    involvedRoles: Object.fromEntries(people.filter((p) => p.role.trim()).map((p) => [p.name, p.role])),
  };
}

/** Shared by both create tools. The tools differ only in what their input
 *  schema insists on; what gets written is the same. */
async function createTask(args: Record<string, unknown>, ctx: MachineContext) {
  const projectId = String(args.projectId ?? "");
  const ws = await requireProject(ctx, projectId);
  if (!ws) return fail(`No project "${projectId}" in this workspace.`);

  const owner = (args.owner as string | undefined) || undefined;
  const draft = {
    title: String(args.title),
    status: (args.status as string) ?? "backlog",
    description: (args.description as string) ?? "",
    deliverable: (args.deliverable as string) ?? "",
    start: (args.start as string) ?? "",
    end: (args.end as string) ?? "",
    assignees: owner ? [owner] : [],
    ...splitInvolved(args.involved as InvolvedArg | undefined, owner),
    category: (args.track as string) ?? null,
    milestoneId: (args.milestoneId as string) ?? null,
    priority: (args.priority as boolean) ?? false,
    position: ws.tasks.length,
  };

  // Validate against the same schema the REST routes use, so a tool can never
  // write a shape the UI cannot render.
  const parsed = entityConfig.tasks.schema.safeParse(draft);
  if (!parsed.success) return fail(`Invalid task: ${parsed.error.message}`);
  const issue = checkTask(draft, true, ws);
  if (issue) return fail(issue.error);

  // Checked before the insert, so the new task cannot match itself. The other
  // wording is optional here and is checked too when it is given.
  const translation = ((args.titleTranslation as string | undefined) ?? "").trim();
  const possibleDuplicates = similarToAny(
    [
      { title: draft.title, description: draft.description },
      ...(translation ? [{ title: translation, description: draft.description }] : []),
    ],
    ws.tasks.filter((t) => t.status !== "done"),
    { minScore: 0.4, limit: 3 },
  );

  const row = await createEntity(ctx.orgId, projectId, "tasks", parsed.data);
  if (!row) return fail(`Could not create the task in project "${projectId}".`);
  await recordActivity(ctx.orgId, projectId, {
    kind: "create",
    text: `Added task "${draft.title}"`,
    actor: actorFor(ctx, ws.stakeholders),
  });
  return json(possibleDuplicates.length ? { ...row, possibleDuplicates } : row);
}

const createTaskTool: ToolDef = {
  name: "pm_create_task",
  description:
    "Add a task to a project. Only the title and track are required: use this for any task that does not come from a meeting transcript. Description, deliverable (what exists when it is done), owner and involved people (each optionally with the role they play) can be given when known. For tasks made from a transcript use pm_create_task_from_transcript instead, which insists on all of them. The result lists any open tasks this one overlaps (possibleDuplicates). Records an audit-trail entry attributed to the AI hub.",
  write: true,
  inputSchema: {
    projectId: z.string(),
    title: z.string().min(1),
    status: z.enum(TASK_STATUSES).optional().describe("Defaults to backlog."),
    titleTranslation: z
      .string()
      .optional()
      .describe("Optional: the same title in the other of Danish/English, so the duplicate check covers both."),
    description: z.string().optional(),
    deliverable: z.string().optional().describe("What exists when the task is done."),
    start: z.string().optional().describe("Planned start, ISO date (YYYY-MM-DD)."),
    end: z.string().optional().describe("Planned end, ISO date (YYYY-MM-DD)."),
    owner: z.string().optional().describe("Person's name, as it appears on the project."),
    involved: involvedLoose
      .optional()
      .describe("Other people who take part without owning it: a name, or { name, role } saying what they do."),
    track: z.string().describe("Track/category id this task sits in. Every task sits in a track."),
    priority: z.boolean().optional().describe("Whether the task takes priority. Defaults to no."),
    milestoneId: z
      .string()
      .optional()
      .describe("Optional milestone to sit under. Must be one of the task's own track."),
  },
  handler: createTask,
};

/** Tasks written from a meeting transcript are the ones that went wrong: fifteen
 *  near-identical ones, descriptions nobody could read, no sign of who does what.
 *  So this entry point is strict, and only this one. The board and the plain
 *  pm_create_task stay free-form. */
const createTaskFromTranscriptTool: ToolDef = {
  name: "pm_create_task_from_transcript",
  description:
    `Add a task that comes from a meeting transcript. Every such task must let a founder answer three things without asking anyone: (1) what is this and why: "description", a real explanation of the work and the reason for it, at most ${DESCRIPTION_MAX} characters; (2) what exists when it is done: "deliverable", the concrete output someone can point at, at most ${DELIVERABLE_MAX} characters; (3) who is part of it and for what: "owner" does the work, and each person in "involved" comes with a "role" saying what they contribute ("reviews the schema", "approves the wording"). The title says the one thing to do, at most ${TITLE_MAX} characters. Long background, evidence and quotes go in a note with pm_add_note, not in the description. BEFORE creating: call pm_find_similar_tasks with the title in Danish and English; if an open task already covers it, update that one instead. Also pass titleTranslation (the same title in the other of Danish/English) so the duplicate check runs on both wordings; the result lists any open tasks it overlaps (possibleDuplicates): if one is close, tell the founders and offer to merge rather than leaving both. Records an audit-trail entry attributed to the AI hub.`,
  write: true,
  inputSchema: {
    projectId: z.string(),
    title: z
      .string()
      .min(1)
      .max(TITLE_MAX, `Title is over ${TITLE_MAX} characters. Say the one thing to do.`),
    status: z.enum(TASK_STATUSES).optional().describe("Defaults to backlog."),
    titleTranslation: z
      .string()
      .min(1, "Give the title in the other language too (Danish if the title is English, otherwise English).")
      .describe("The same title in the other of Danish/English. Used for the duplicate check, not stored."),
    description: z
      .string()
      .min(30, "Explain what this is and why it matters, in a few sentences.")
      .max(
        DESCRIPTION_MAX,
        `Description is over ${DESCRIPTION_MAX} characters. Keep the explanation here and move the background to pm_add_note.`,
      )
      .describe("What the task is and why it matters. A few sentences."),
    deliverable: z
      .string()
      .min(5, "Say what exists when this is done.")
      .max(DELIVERABLE_MAX, `Deliverable is over ${DELIVERABLE_MAX} characters. Name the output, not the process.`)
      .describe("The concrete output of the task: what someone can point at when it is done."),
    start: z.string().optional().describe("Planned start, ISO date (YYYY-MM-DD)."),
    end: z.string().optional().describe("Planned end, ISO date (YYYY-MM-DD)."),
    owner: z
      .string()
      .min(1, "Every task needs an owner. If it is unclear, ask the founders who.")
      .describe("Who does the work, by name as it appears on the project."),
    involved: z
      .array(
        z.object({
          name: z.string().min(1),
          role: z
            .string()
            .min(3, "Say what this person contributes.")
            .max(ROLE_MAX, `Keep a role under ${ROLE_MAX} characters.`),
        }),
      )
      .optional()
      .describe("Everyone else who takes part, each with what they contribute. Empty if it is a one-person task."),
    track: z.string().describe("Track/category id this task sits in. Every task sits in a track."),
    priority: z.boolean().optional().describe("Whether the task takes priority. Defaults to no."),
    milestoneId: z
      .string()
      .optional()
      .describe("Optional milestone to sit under. Must be one of the task's own track."),
  },
  handler: createTask,
};

const updateTaskTool: ToolDef = {
  name: "pm_update_task",
  description:
    "Update an existing task: status, dates, owner, who is involved (optionally with what each does), title, description or deliverable. Only the fields you pass are changed. Records an audit-trail entry attributed to the AI hub.",
  write: true,
  inputSchema: {
    projectId: z.string(),
    taskId: z.string(),
    title: z.string().optional(),
    status: z.enum(TASK_STATUSES).optional(),
    description: z.string().optional(),
    deliverable: z.string().optional().describe("What exists when the task is done."),
    start: z.string().optional(),
    end: z.string().optional(),
    owner: z.string().optional(),
    involved: involvedLoose
      .optional()
      .describe(
        "Replaces everyone involved without owning the task: a name, or { name, role } saying what they do. Pass [] to clear.",
      ),
    track: z.string().optional().describe("Move the task to another track."),
    priority: z.boolean().optional().describe("Whether the task takes priority."),
    milestoneId: z
      .string()
      .optional()
      .describe("Milestone to sit under, from the task's own track. Pass \"\" to take it out."),
  },
  handler: async (args, ctx) => {
    const projectId = String(args.projectId ?? "");
    const taskId = String(args.taskId ?? "");
    const ws = await requireProject(ctx, projectId);
    if (!ws) return fail(`No project "${projectId}" in this workspace.`);

    const existing = ws.tasks.find((t) => t.id === taskId);
    if (!existing) return fail(`No task "${taskId}" in project "${projectId}".`);

    const patch: Record<string, unknown> = {};
    for (const field of ["title", "status", "description", "deliverable", "start", "end", "milestoneId", "priority"]) {
      if (args[field] !== undefined) patch[field] = args[field];
    }
    if (args.owner !== undefined) patch.assignees = args.owner ? [args.owner] : [];
    if (args.involved !== undefined) {
      const { involved, involvedRoles } = splitInvolved(
        args.involved as InvolvedArg,
        (args.owner as string | undefined) ?? existing.assignees?.[0],
      );
      patch.involved = involved;
      patch.involvedRoles = involvedRoles;
    }
    if (args.track !== undefined) patch.category = args.track;
    if (patch.milestoneId === "") patch.milestoneId = null;

    const issue = checkTask(patch, false, ws, existing);
    if (issue) return fail(issue.error);
    // A task that changes track cannot keep a milestone from the old one.
    if (
      patch.category !== undefined &&
      patch.milestoneId === undefined &&
      milestoneLeftBehind(patch.category as string, existing.milestoneId, ws)
    ) {
      patch.milestoneId = null;
    }

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
      actor: actorFor(ctx, ws.stakeholders),
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
      actor: actorFor(ctx, ws.stakeholders),
    });
    return json(row);
  },
};

export const TOOLS: ToolDef[] = [
  listProjectsTool,
  getProjectTool,
  listTasksTool,
  findSimilarTool,
  listRisksTool,
  projectStatusTool,
  createTaskTool,
  createTaskFromTranscriptTool,
  updateTaskTool,
  addNoteTool,
];

/** The tools a given token may see — writes are omitted without the scope. */
export function toolsFor(ctx: MachineContext): ToolDef[] {
  return TOOLS.filter((t) => !t.write || ctx.scopes.includes("write"));
}
