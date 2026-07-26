import "server-only";
import { askJSON } from "./anthropic";
import { blankBusinessCase, blankScope } from "@/lib/templates";
import type { AtlasProject } from "@/lib/import/atlas";

export interface AiSetupForm {
  name: string;
  summary?: string;
  domain?: string;
  start?: string; // "YYYY-MM"
  weeks?: number;
  team?: string;
  risks?: string;
  findings?: string;
  budget?: string;
  color?: string;
}

const ROLE_SET = [
  "Executive Sponsor",
  "Project Owner",
  "Advisor",
  "Key User",
  "Gatekeeper",
  "Contributor",
];
const ORG_ACCENTS = ["purple", "indigo", "blue", "teal", "green", "amber", "pink", "red"];
const COL_POOL = ["blue", "indigo", "teal", "green", "amber", "red", "pink", "purple"];

const DEFAULT_PHASES = [
  { id: "ph_disc", label: "Discovery", color: "teal" },
  { id: "ph_design", label: "Design", color: "pink" },
  { id: "ph_build", label: "Build", color: "blue" },
  { id: "ph_launch", label: "Launch", color: "amber" },
];
const DEFAULT_TAGS = [
  { id: "tg_fe", label: "Frontend", color: "blue" },
  { id: "tg_be", label: "Backend", color: "indigo" },
  { id: "tg_infra", label: "Infra", color: "teal" },
  { id: "tg_sec", label: "Security", color: "red" },
  { id: "tg_ux", label: "UX", color: "pink" },
  { id: "tg_data", label: "Data", color: "amber" },
  { id: "tg_docs", label: "Docs", color: "green" },
];
const DEFAULT_CATEGORIES = [
  { id: "ct_enable", label: "Enablement", color: "green" },
  { id: "ct_plat", label: "Platform", color: "blue" },
  { id: "ct_migr", label: "Migration", color: "amber" },
  { id: "ct_compl", label: "Compliance", color: "red" },
];

const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 9)}`;
const pick = <T,>(v: T, allowed: T[], fb: T): T =>
  allowed.includes(v) ? v : fb;
function isoAdd(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + (days || 0));
  return d.toISOString().slice(0, 10);
}

/**
 * Run the AI interview (business case, tasks, people, risks) and assemble a
 * project in the legacy Atlas shape, ready to be persisted via the importer.
 * Returns null only if every AI call failed.
 */
export async function buildAiProject(
  form: AiSetupForm,
): Promise<{ project: AtlasProject; produced: string[] } | null> {
  const teamNames = (form.team ?? "")
    .split("\n")
    .map((l) => l.split(/[—–\-:]/)[0].trim())
    .filter(Boolean);
  const startMonth = form.start || new Date().toISOString().slice(0, 7);
  const startISO = `${startMonth}-01`;
  const weeks = Number(form.weeks) || 16;

  const tax = `phases=${DEFAULT_PHASES.map((p) => p.id + ":" + p.label).join(", ")}; categories=${DEFAULT_CATEGORIES.map((c) => c.id + ":" + c.label).join(", ")}; tags=${DEFAULT_TAGS.map((t) => t.id + ":" + t.label).join(", ")}`;
  const ctx = `Project "${form.name || "this project"}" — ${form.summary || "(no summary given)"}. Domain: ${form.domain || "general"}.`;

  const [bc, tk, pe, rf] = await Promise.all([
    askJSON<Record<string, unknown>>(
      `${ctx} Budget context: ${form.budget || "not specified"}. Respond with ONLY minified JSON. Keys: purpose (1 sentence), problem (2 sentences), outcomes (array of exactly 4 short outcome strings), financial (array of exactly 4 objects each {label,value,note}: one-off programme cost, annual run cost, annual saving, payback period — invent plausible figures if none given), justification (2 sentences), effective (2 sentences on phased delivery & benefit tracking).`,
    ),
    askJSON<Record<string, unknown>[]>(
      `${ctx} Team: ${teamNames.length ? teamNames.join(", ") : "invent 3-4 names"}. Ids: ${tax}. Starts ${startISO}, runs ~${weeks} weeks. Respond with ONLY minified JSON — an array of exactly 6 task objects. Keys per task: t(title, max 6 words), s(status: backlog|inprogress|done — 1 done, 2 inprogress, rest backlog), p(phase id), c(category id), g(array of 0-1 tag id), pr(priority high|med|low), a(array of 1-2 team names), o(offsetDays int from start), d(durationDays int 5-15). Order chronologically. No description field.`,
    ),
    askJSON<Record<string, unknown>>(
      `${ctx} Known team: ${teamNames.length ? teamNames.join(", ") : "invent names"}. Respond with ONLY minified JSON with two keys. "stakeholders": array of 3-5 objects {name, title, role (one of ${ROLE_SET.join("|")}), responsibility (1 sentence), influence (high|med|low), interest (high|med|low)}. "org": array of 3-6 objects {name, role, manager} where manager is the exact name of that person's manager, or null for the most senior. Make reporting lines consistent (every non-null manager also appears as a name).`,
    ),
    askJSON<Record<string, unknown>>(
      `${ctx} ${form.risks ? "Concerns raised: " + form.risks + "." : ""} ${form.findings ? "Early findings: " + form.findings + "." : ""} Team: ${teamNames.join(", ") || "the team"}. Categories ids: ${DEFAULT_CATEGORIES.map((c) => c.id + ":" + c.label).join(", ")}. Respond with ONLY minified JSON with two keys. "risks": array of 3-4 {title, likelihood (high|med|low), impact (high|med|low), mitigation (1 sentence), owner (a team name), status (open|monitoring)}. "findings": array of 2-3 {title, summary (1-2 sentences), category (a category id), source (short label)}.`,
    ),
  ]);

  const produced: string[] = [];
  const phaseIds = DEFAULT_PHASES.map((p) => p.id);
  const catIds = DEFAULT_CATEGORIES.map((c) => c.id);
  const tagIds = DEFAULT_TAGS.map((t) => t.id);

  // ----- business case -----
  let businessCase: Record<string, unknown> = blankBusinessCase();
  if (bc && bc.purpose) {
    const base = blankBusinessCase();
    businessCase = {
      ...base,
      purpose: String(bc.purpose ?? ""),
      problem: String(bc.problem ?? ""),
      outcomes: Array.isArray(bc.outcomes) ? bc.outcomes.slice(0, 6) : [],
      financial:
        Array.isArray(bc.financial) && bc.financial.length
          ? bc.financial.slice(0, 4).map((x: Record<string, unknown>) => ({
              label: String(x.label ?? ""),
              value: String(x.value ?? ""),
              note: String(x.note ?? ""),
            }))
          : base.financial,
      justification: String(bc.justification ?? ""),
      effective: String(bc.effective ?? ""),
    };
    produced.push("business case");
  }

  // ----- tasks -----
  const tasks = Array.isArray(tk)
    ? tk.slice(0, 10).map((t: Record<string, unknown>) => {
        const off = Number(t.o) || 0;
        const dur = Math.max(2, Number(t.d) || 10);
        const g = Array.isArray(t.g) ? (t.g as string[]) : [];
        const a = Array.isArray(t.a) ? (t.a as string[]) : t.a ? [String(t.a)] : [];
        return {
          id: uid("t"),
          title: String(t.t ?? "Untitled task"),
          status: pick(String(t.s), ["backlog", "inprogress", "done"], "backlog"),
          phase: phaseIds.includes(String(t.p)) ? String(t.p) : null,
          category: catIds.includes(String(t.c)) ? String(t.c) : null,
          tags: g.filter((x) => tagIds.includes(x)).slice(0, 3),
          priority: pick(String(t.pr), ["high", "med", "low"], "med"),
          assignees: a.filter(Boolean).slice(0, 3),
          start: isoAdd(startISO, off),
          end: isoAdd(startISO, off + dur),
          desc: "",
          deps: [],
        };
      })
    : [];
  if (tasks.length) produced.push("tasks & timeline");

  // ----- people (stakeholders + org + members) -----
  const stakeholders: Record<string, unknown>[] = [];
  const org: Record<string, unknown>[] = [];
  const memberMap = new Map<string, Record<string, unknown>>();
  let cIdx = 0;
  const addMember = (name: string, role: string) => {
    const key = (name || "").trim();
    if (!key || memberMap.has(key.toLowerCase())) return;
    memberMap.set(key.toLowerCase(), {
      id: uid("mem"),
      name: key,
      role: role || "",
      email: "",
      color: COL_POOL[cIdx++ % COL_POOL.length],
    });
  };
  if (pe) {
    if (Array.isArray(pe.stakeholders)) {
      for (const p of pe.stakeholders.slice(0, 8) as Record<string, unknown>[]) {
        stakeholders.push({
          id: uid("s"),
          name: String(p.name ?? "Unnamed"),
          title: String(p.title ?? ""),
          role: pick(String(p.role), ROLE_SET, "Contributor"),
          responsibility: String(p.responsibility ?? ""),
          influence: pick(String(p.influence), ["high", "med", "low"], "med"),
          interest: pick(String(p.interest), ["high", "med", "low"], "med"),
          contact: "",
        });
        addMember(String(p.name ?? ""), String(p.role ?? ""));
      }
    }
    if (Array.isArray(pe.org) && pe.org.length) {
      const nameId: Record<string, string> = {};
      const raw = (pe.org.slice(0, 8) as Record<string, unknown>[]).map((o, i) => {
        const id = uid("o");
        nameId[String(o.name ?? "").toLowerCase()] = id;
        return {
          id,
          name: String(o.name ?? "Unnamed"),
          role: String(o.role ?? ""),
          note: "",
          accent: ORG_ACCENTS[i % ORG_ACCENTS.length],
          _mgr: String(o.manager ?? "").toLowerCase(),
        };
      });
      for (const n of raw) {
        const parent =
          n._mgr && nameId[n._mgr] && nameId[n._mgr] !== n.id
            ? nameId[n._mgr]
            : null;
        org.push({ id: n.id, name: n.name, role: n.role, note: n.note, accent: n.accent, parent });
        addMember(n.name, n.role);
      }
      if (!org.some((n) => n.parent === null) && org[0]) org[0].parent = null;
    }
    if (stakeholders.length || org.length) produced.push("stakeholders & org");
  }

  // ----- risks + findings -----
  const risks: Record<string, unknown>[] = [];
  const findings: Record<string, unknown>[] = [];
  if (rf) {
    if (Array.isArray(rf.risks)) {
      for (const r of rf.risks.slice(0, 6) as Record<string, unknown>[]) {
        risks.push({
          id: uid("r"),
          title: String(r.title ?? "Risk"),
          likelihood: pick(String(r.likelihood), ["high", "med", "low"], "med"),
          impact: pick(String(r.impact), ["high", "med", "low"], "med"),
          mitigation: String(r.mitigation ?? ""),
          owner: String(r.owner ?? ""),
          status: pick(String(r.status), ["open", "monitoring", "closed"], "open"),
          taskIds: [],
        });
      }
    }
    if (Array.isArray(rf.findings)) {
      for (const x of rf.findings.slice(0, 5) as Record<string, unknown>[]) {
        findings.push({
          id: uid("f"),
          title: String(x.title ?? "Finding"),
          summary: String(x.summary ?? ""),
          category: catIds.includes(String(x.category)) ? String(x.category) : null,
          source: String(x.source ?? ""),
        });
      }
    }
    if (risks.length || findings.length) produced.push("risks & findings");
  }

  if (produced.length === 0) return null;

  const project: AtlasProject = {
    id: uid("aiprj"),
    meta: { project: form.name.trim() || "Untitled project", code: "" },
    color: form.color ?? "indigo",
    tasks,
    members: [...memberMap.values()],
    stakeholders,
    risks,
    findings,
    org,
    products: [],
    businessCase,
    scope: blankScope(),
    assessment: [],
    commPlan: [],
    changePlan: { groups: [] },
    milestones: [],
    glossary: [],
    tags: DEFAULT_TAGS,
    phases: DEFAULT_PHASES,
    categories: DEFAULT_CATEGORIES,
  };

  return { project, produced };
}
