import { NextResponse, type NextRequest } from "next/server";
import { requireApiAuth } from "@/lib/api/guard";
import { getWorkingSet } from "@/lib/db/queries";
import { askJSONOrThrow } from "@/lib/ai/anthropic";
import { genId } from "@/lib/entities";
import type { PlanOp, PlanGroup, PlanResult } from "@/lib/ai/plan-types";
import type { WorkingSet } from "@/lib/types";

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function has(text: string, re: RegExp) {
  return re.test(text);
}

function isQuestion(text: string) {
  return (
    /\?/.test(text) ||
    /^(what|who|when|which|where|how|why|is|are|do|does|can|should)\b/.test(
      text.trim().toLowerCase(),
    )
  );
}

/** Topological downstream traversal from a task id. */
function downstreamOf(startId: string, tasks: WorkingSet["tasks"]) {
  const aff = new Set([startId]);
  let grew = true;
  while (grew) {
    grew = false;
    tasks.forEach((x) => {
      if (!aff.has(x.id) && (x.deps ?? []).some((d) => d.type === "task" && aff.has(d.refId ?? ""))) {
        aff.add(x.id);
        grew = true;
      }
    });
  }
  aff.delete(startId);
  return tasks.filter((x) => aff.has(x.id));
}

// ──────────────────────────────────────────────────────────────────────────────
// Context builder (keyword-gated, token-lean)
// ──────────────────────────────────────────────────────────────────────────────

function buildContext(text: string, ws: WorkingSet): string {
  const lc = text.toLowerCase();
  const h = (re: RegExp) => has(lc, re);
  const q = isQuestion(text);

  const tasks = ws.tasks ?? [];
  const lines: string[] = [];

  // Always: compact task list with 1-based index
  lines.push(
    "TASKS:\n" +
      (tasks.length
        ? tasks
            .map(
              (t, i) =>
                `T${i + 1}: ${t.title} [${t.status}, ${t.category ?? "no track"}]`,
            )
            .join("\n")
        : "(none)"),
  );

  // Scope
  if (q || h(/\bscope\b|out of scope|in scope|deferred|won'?t do|not doing|exclude|include/)) {
    const sc = (ws.project as Record<string, unknown>).scope as { inScope?: string[]; outScope?: string[] } | null;
    lines.push(
      "SCOPE:\n  IN: " +
        (sc?.inScope?.join("; ") || "(none)") +
        "\n  OUT: " +
        (sc?.outScope?.join("; ") || "(none)"),
    );
  }

  // Risks
  if (q || h(/\brisk|threat|danger|could fail|might fail|mitigat|blocker|jeopard|close\b/)) {
    lines.push(
      "EXISTING RISKS: " +
        ((ws.risks ?? [])
          .map(
            (r, i) =>
              `R${i + 1}: ${r.title} (${r.likelihood}/${r.impact}, ${r.status ?? "open"})`,
          )
          .join(" | ") || "(none)"),
    );
  }

  // Milestones
  if (q || h(/\bmilestone|gate|sign-?off|go\/no-?go|launch|deadline/)) {
    lines.push(
      "EXISTING MILESTONES/GATES: " +
        ((ws.milestones ?? [])
          .map(
            (m) =>
              m.title + (m.type === "gate" ? " (gate)" : "") + (m.date ? " " + m.date : ""),
          )
          .join(" | ") || "(none)"),
    );
  }

  // Members
  if (q || h(/member|team\b|role|assign|owner|report|manager|capacity|who\b|rename/)) {
    lines.push(
      "MEMBERS: " +
        ((ws.members ?? [])
          .map((m) => m.name + (m.role ? ` (${m.role})` : ""))
          .join(" | ") || "(none)"),
    );
  }

  // Full detail for questions
  if (q) {
    const startup = (ws.project as Record<string, unknown>).startup as Record<string, unknown> | null;
    const products = ws.products ?? [];
    const findings = ws.findings ?? [];
    if (products.length)
      lines.push("DELIVERABLES: " + products.map((p) => p.name).join(" | "));
    if (findings.length)
      lines.push("INSIGHTS: " + findings.map((f) => f.title).join(" | "));
    if (startup?.mission)
      lines.push("MISSION: " + JSON.stringify(startup.mission));
    if (startup?.valueProp)
      lines.push("VALUE PROP: " + JSON.stringify(startup.valueProp));
    lines.push(
      "\nInstruction: answer fully from context above; if information is absent, say so.",
    );
  }

  return lines.join("\n\n");
}

// ──────────────────────────────────────────────────────────────────────────────
// Op-catalog prompt (verbatim from AI-OP-CATALOG.md §Routing guidance)
// ──────────────────────────────────────────────────────────────────────────────

const OP_CATALOG = `You are an AI project management assistant. Analyse the user's text against the project context and return ONLY minified JSON: { "groups": [ { "quote": "<span of user text>", "ops": [ {op}, … ] } ] }. Up to 16 groups.

ROUTING GUIDANCE: blocker→dependency; threat→risk (+comment); scope decision→scope_in/out; fact learned→finding; term defined→glossary; deadline/go-no-go→milestone; owner change→assign; importance→priority; new person→member; explicit delete→remove/delete; document/output→deliverable; new work area→track; strategy/positioning text→strategy; new service→feature; pin/hide pages→favorite/section; reminder/buffer→setting; a change to something that already exists→edit_task/edit_risk/edit_member; the same change across many tasks→ONE bulk op; a question→answer only. JSON only.

OP TYPES (use exact field names):
Task ops: create{type,title,track?,status?,priority?,assignee?,start?,end?} | status{type,task:"T3",to:"backlog|inprogress|done"} | priority{type,task,to:"low|med|high"} | dates{type,task,start?,end?} | assign{type,task,who,clear?:false} | edit_task{type,task,title?,desc?,track?} | move_track{type,task,track} | make_subtask{type,task,parent:"T5"} | promote{type,task} | reorder{type,task,to:"top|bottom"} | tag{type,task,label} | untag{type,task,label} | comment{type,task,text,author?:"AI import"} | subtask{type,parent:"T5",title} | dependency{type,task,on:"T5"|external:"name",scope?} | remove_dep{type,task,on:"T5"|external:"name"} | shift_all{type,days:N} | bulk{type,filter:{track?,status?,assignee?,priority?,unassigned?},set:{status?,priority?,assign?,track?},shiftDays?:0}
Risk ops: risk{type,title,likelihood,impact,mitigation,owner?,task?} | edit_risk{type,risk:"R2",title?,likelihood?,impact?,mitigation?,owner?,status?}
List entities: finding{type,title,summary,category?} | deliverable{type,name,link?,task?} | milestone{type,title,kind:"milestone|gate",category?,date?,note?} | member{type,name,role?} | edit_member{type,name,rename?,role?} | track{type,label}
Remove: remove{type,kind:"risk|scope|finding|glossary|milestone|deliverable|budget|track|tag|member|feature|package|persona|value",name:"…"} | delete{type,task:"T3"}
JSONB ops: scope_in{type,line} | scope_out{type,line} | glossary{type,term,definition} | budget{type,label,amount} | favorite{type,page,on:true} | section{type,page,on:true} | setting{type,key:"autoStart|leadStart|leadDue|buffer",value} | org_report{type,who,to}
Strategy ops: strategy{type,section:"mission|vision|valueprop|bmc_<block>",text} | value{type,label,desc?} | vp_segment{type,segment,jobs[],pains[],gains[]} | persona{type,name,role?,segment?,goals[],pains[],note?} | market{type,field:"tam|sam|som|positioning",text} | competitor{type,name,note?} | gtm{type,field:"motion",text}|{type,field:"channels|launch",items[]} | feature{type,name,group?,how?,what?} | package{type,name,tagline?,features:[names]}
Answer (question mode): answer{type,text:"…"}

Resolve task references as T1=first task, T2=second, etc. from the TASKS list. Use "T#" format.`;

// ──────────────────────────────────────────────────────────────────────────────
// Normalize: resolve T#/R# refs, add display fields, drop invalid ops
// ──────────────────────────────────────────────────────────────────────────────

function resolveTask(ref: string | undefined, tasks: WorkingSet["tasks"]) {
  if (!ref) return undefined;
  // T# index
  const m = ref.match(/^T(\d+)$/i);
  if (m) {
    const idx = parseInt(m[1], 10) - 1;
    return tasks[idx] ?? undefined;
  }
  // name match
  const lc = ref.toLowerCase();
  return (
    tasks.find((t) => t.title.toLowerCase() === lc) ??
    tasks.find((t) => t.title.toLowerCase().startsWith(lc)) ??
    tasks.find((t) => t.title.toLowerCase().includes(lc))
  );
}

function resolveRisk(ref: string | undefined, risks: WorkingSet["risks"]) {
  if (!ref) return undefined;
  const m = ref.match(/^R(\d+)$/i);
  if (m) {
    const idx = parseInt(m[1], 10) - 1;
    return risks[idx] ?? undefined;
  }
  const lc = ref.toLowerCase();
  return (
    risks.find((r) => r.title.toLowerCase() === lc) ??
    risks.find((r) => r.title.toLowerCase().includes(lc))
  );
}

function normalizeMemberName(name: string, members: WorkingSet["members"]) {
  if (!name) return name;
  const lc = name.toLowerCase();
  return (
    members.find((m) => m.name.toLowerCase() === lc)?.name ??
    members.find((m) => m.name.toLowerCase().startsWith(lc))?.name ??
    name
  );
}

function normalizeOp(op: PlanOp, ws: WorkingSet): PlanOp | null {
  const tasks = ws.tasks ?? [];
  const risks = ws.risks ?? [];
  const members = ws.members ?? [];
  const o = { ...op };

  // Task-referencing ops
  const taskRefTypes = [
    "status","priority","dates","assign","edit_task","move_track","make_subtask",
    "promote","reorder","tag","untag","comment","dependency","remove_dep","delete",
  ];
  if (taskRefTypes.includes(o.type)) {
    const t = resolveTask(o.task as string | undefined, tasks);
    if (!t && o.type !== "create") return null; // can't resolve → drop
    if (t) { o.taskId = t.id; o.taskTitle = t.title; }
  }

  // subtask: resolve parent
  if (o.type === "subtask") {
    const parent = resolveTask(o.parent as string | undefined, tasks);
    if (!parent) return null;
    o.parentId = parent.id;
    o.taskTitle = parent.title;
  }

  // make_subtask: resolve parent ref
  if (o.type === "make_subtask") {
    const parent = resolveTask(o.parent as string | undefined, tasks);
    if (!parent) return null;
    o.parentId = parent.id;
  }

  // dependency: resolve on task
  if (o.type === "dependency" || o.type === "remove_dep") {
    if (o.on && String(o.on).match(/^T\d+$/i)) {
      const on = resolveTask(o.on as string, tasks);
      if (on) { o.onId = on.id; o.onTitle = on.title; }
    }
  }

  // bulk: resolve matchedIds server-side
  if (o.type === "bulk") {
    const filter = (o.filter as Record<string, unknown>) ?? {};
    let matched = [...tasks];
    if (filter.track) matched = matched.filter((t) => t.category === filter.track);
    if (filter.status) matched = matched.filter((t) => t.status === filter.status);
    if (filter.assignee) matched = matched.filter((t) => (t.assignees ?? []).includes(String(filter.assignee)));
    if (filter.priority) matched = matched.filter((t) => t.priority === filter.priority);
    if (filter.unassigned) matched = matched.filter((t) => (t.assignees ?? []).length === 0);
    o.matchedIds = matched.map((t) => t.id);
    o.count = matched.length;
  }

  // risk ops
  if (o.type === "edit_risk") {
    const r = resolveRisk(o.risk as string | undefined, risks);
    if (!r) return null;
    o.refId = r.id;
    o.taskTitle = r.title;
  }

  // assign: normalize member name
  if (o.type === "assign" && o.who) {
    o.who = normalizeMemberName(String(o.who), members);
  }

  // edit_member: normalize name
  if (o.type === "edit_member" && o.name) {
    o.name = normalizeMemberName(String(o.name), members);
  }

  return o;
}

// ──────────────────────────────────────────────────────────────────────────────
// Cascade annotation
// ──────────────────────────────────────────────────────────────────────────────

function annotateOp(op: PlanOp, ws: WorkingSet): PlanOp {
  const tasks = ws.tasks ?? [];
  const o = { ...op };

  if (o.type === "status" && o.to === "done") {
    const w = tasks.filter(
      (x) => x.status !== "done" && (x.deps ?? []).some((d) => d.type === "task" && d.refId === o.taskId),
    );
    if (w.length) o._cascade = `Unblocks ${w.length} waiting task${w.length === 1 ? "" : "s"}`;
  }
  if (o.type === "status" && o.to !== "done") {
    const t = tasks.find((x) => x.id === o.taskId);
    if (t?.status === "done") {
      const w = tasks.filter(
        (x) => x.status !== "done" && (x.deps ?? []).some((d) => d.type === "task" && d.refId === o.taskId),
      );
      if (w.length) o._cascade = `Re-blocks ${w.length} dependent task${w.length === 1 ? "" : "s"}`;
    }
  }
  if (o.type === "dates" && o.taskId) {
    const ds = downstreamOf(o.taskId, tasks);
    if (ds.length) o._cascade = `${ds.length} downstream task${ds.length === 1 ? "" : "s"} may need to move too`;
  }
  if (o.type === "delete" && o.taskId) {
    const dep = tasks.filter(
      (x) => (x.deps ?? []).some((d) => d.type === "task" && d.refId === o.taskId),
    );
    if (dep.length)
      o._cascade = `${dep.length} task${dep.length === 1 ? "" : "s"} depend on this — their dependency will be removed`;
  }
  if (o.type === "dependency" && o.taskId && o.onId) {
    const t = tasks.find((x) => x.id === o.taskId);
    const p = tasks.find((x) => x.id === o.onId);
    if (t && p && t.start && p.end && p.status !== "done" && new Date(t.start) < new Date(p.end))
      o._cascade = `Creates a dependency block — it starts before "${p.title}" finishes`;
  }
  if (o.type === "shift_all")
    o._cascade = "Moves every dated task — milestones & gates keep their own dates";
  if (o.type === "bulk" && (o.shiftDays ?? 0) !== 0)
    o._cascade = `Moves ${o.count} tasks — dependents outside the selection may need review`;
  if (o.type === "remove" && o.kind === "member")
    o._cascade = "Their task assignments are cleared and their org-chart card is removed";
  if (o.type === "remove" && o.kind === "track") {
    const nt = tasks.filter((t) => t.category === o.refId).length;
    if (nt) o._cascade = `${nt} task${nt === 1 ? "" : "s"} lose this track label`;
  }
  if (o.type === "remove" && o.kind === "tag")
    o._cascade = "The tag is stripped from every task that carries it";
  if (o.type === "make_subtask") {
    const kids = tasks.filter((t) => t.parentId === o.taskId).length;
    if (kids) o._cascade = `It has ${kids} subtask${kids === 1 ? "" : "s"} of its own — they stay attached`;
  }
  if (o.type === "edit_member" && o.rename)
    o._cascade = "The rename flows into every assignment, the capacity view and the org chart";
  if (o.type === "assign" && !o.clear && !(ws.members ?? []).some((m) => m.name.toLowerCase() === String(o.who).toLowerCase()))
    o._cascade = `"${o.who}" isn't a project member yet — they'll appear once added on Members`;

  return o;
}

// ──────────────────────────────────────────────────────────────────────────────
// Route handler
// ──────────────────────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireApiAuth();
  if (ctx instanceof NextResponse) return ctx;

  const { id: projectId } = await params;
  const body = await req.json().catch(() => ({}));
  const text: string = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) return NextResponse.json({ error: "text required" }, { status: 400 });

  const ws = await getWorkingSet(ctx.orgId, projectId);
  if (!ws) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const context = buildContext(text, ws);
  const prompt = `${OP_CATALOG}\n\n---\nPROJECT CONTEXT:\n${context}\n\n---\nUSER INPUT:\n${text}`;

  let raw: { groups: PlanGroup[] } | null;
  try {
    raw = await askJSONOrThrow<{ groups: PlanGroup[] }>(prompt, { maxTokens: 4096 });
  } catch (e) {
    console.error("Plan AI call failed", e);
    return NextResponse.json(
      { error: (e as Error).message || "AI request failed" },
      { status: 502 },
    );
  }
  // The model answered but returned nothing we can use — not an error, just
  // an empty result (e.g. the input didn't map to any recognizable op).
  if (!raw?.groups) return NextResponse.json({ groups: [] } satisfies PlanResult);

  // Normalize + cascade-annotate each op
  const groups: PlanGroup[] = raw.groups.map((g) => ({
    quote: g.quote ?? "",
    ops: (g.ops ?? [])
      .map((op) => normalizeOp({ ...op, _sel: true } as PlanOp, ws))
      .filter((op): op is PlanOp => op !== null)
      .map((op) => annotateOp(op, ws))
      // give every op a client-side id for keying
      .map((op) => ({ ...op, _id: genId("op") })),
  })).filter((g) => g.ops.length > 0);

  return NextResponse.json({ groups } satisfies PlanResult);
}
