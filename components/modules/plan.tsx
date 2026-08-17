"use client";

import { useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Zap, Plus, LayoutList, MessageSquare, Layers, ShieldAlert, Link2,
  Check, X, Lightbulb, Tag, Flag, CalendarClock, Users, Trash2,
  Package, List, LayoutGrid, Boxes, Star, Settings, Coins, Network,
  UserSquare, BarChart3, Megaphone, MessageCircle, Loader2, ChevronDown,
  ChevronUp,
} from "lucide-react";
import { apiFetch } from "@/lib/api/client";
import {
  useProject,
  useCreateEntity,
  useUpdateEntity,
  useDeleteEntity,
  useUpdateProject,
  useLogActivity,
} from "@/lib/api/hooks";
import { genId } from "@/lib/entities";
import { ModuleHeader, SectionCard } from "@/components/project/ui";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { PlanOp, PlanGroup, PlanResult } from "@/lib/ai/plan-types";
import type { WorkingSet } from "@/lib/types";

// ── icon map for op types ──────────────────────────────────────────────────

const OP_ICON: Record<string, React.ElementType> = {
  status: LayoutList, comment: MessageSquare, subtask: Layers, section: Layers,
  create: Plus, risk: ShieldAlert, edit_risk: ShieldAlert,
  dependency: Link2, remove_dep: Link2, scope_in: Check, scope_out: X,
  finding: Lightbulb, glossary: Tag, tag: Tag, untag: Tag,
  milestone: Flag, dates: CalendarClock, shift_all: CalendarClock,
  assign: Users, member: Users, edit_member: Users,
  delete: Trash2, remove: Trash2, deliverable: Package,
  track: List, move_track: List, strategy: LayoutGrid, feature: Boxes,
  favorite: Star, setting: Settings, budget: Coins, org_report: Network,
  package: Package, vp_segment: UserSquare, persona: UserSquare,
  market: BarChart3, competitor: BarChart3, gtm: Megaphone,
  bulk: Zap, answer: MessageCircle,
  make_subtask: Layers, promote: Layers, reorder: LayoutList,
  edit_task: LayoutList,
};

// ── human-readable op label ────────────────────────────────────────────────

function opLabel(op: PlanOp): string {
  const t = op.type as string;
  if (t === "status") return `Set "${op.taskTitle}" to ${op.to}`;
  if (t === "dates") return `Reschedule "${op.taskTitle}" ${op.start ?? "?"} → ${op.end ?? "?"}`;
  if (t === "shift_all") return `Shift whole plan by ${op.days} days`;
  if (t === "assign") return `${op.clear ? "Unassign" : "Assign"} ${op.who} ${op.clear ? "from" : "to"} "${op.taskTitle}"`;
  if (t === "edit_task") return `Edit task "${op.taskTitle}"`;
  if (t === "move_track") return `Move "${op.taskTitle}" to track ${op.track}`;
  if (t === "make_subtask") return `Make "${op.taskTitle}" a subtask of T${op.parentId}`;
  if (t === "promote") return `Promote "${op.taskTitle}" to top-level`;
  if (t === "reorder") return `Move "${op.taskTitle}" to ${op.to}`;
  if (t === "tag") return `Tag "${op.taskTitle}" with ${op.label}`;
  if (t === "untag") return `Remove tag "${op.label}" from "${op.taskTitle}"`;
  if (t === "comment") return `Comment on "${op.taskTitle}": ${op.text}`;
  if (t === "subtask") return `Add subtask "${op.title}" under "${op.taskTitle}"`;
  if (t === "create") return `Create task "${op.title}"`;
  if (t === "dependency") return `"${op.taskTitle}" depends on ${op.onTitle ?? op.external}`;
  if (t === "remove_dep") return `Remove dependency on ${op.onTitle ?? op.external} from "${op.taskTitle}"`;
  if (t === "delete") return `Delete "${op.taskTitle}"`;
  if (t === "risk") return `Log risk: ${op.title}`;
  if (t === "edit_risk") return `Edit risk: ${op.taskTitle}`;
  if (t === "finding") return `Insight: ${op.title}`;
  if (t === "deliverable") return `Deliverable: ${op.name}`;
  if (t === "milestone") return `${op.kind === "gate" ? "Gate" : "Milestone"}: ${op.title}`;
  if (t === "member") return `Add member ${op.name}${op.role ? ` (${op.role})` : ""}`;
  if (t === "edit_member") return `Edit member ${op.name}${op.rename ? ` → ${op.rename}` : ""}`;
  if (t === "track") return `Create track "${op.label}"`;
  if (t === "scope_in") return `In scope: ${op.line}`;
  if (t === "scope_out") return `Out of scope: ${op.line}`;
  if (t === "glossary") return `Define "${op.term}"`;
  if (t === "budget") return `Budget: ${op.label} — ${op.amount}`;
  if (t === "favorite") return `${op.on ? "Pin" : "Unpin"} page "${op.page}"`;
  if (t === "section") return `${op.on ? "Enable" : "Disable"} section "${op.page}"`;
  if (t === "setting") return `Setting ${op.key} = ${op.value}`;
  if (t === "org_report") return `${op.who} reports to ${op.to}`;
  if (t === "strategy") return `Strategy ${op.section}: ${String(op.text).slice(0, 60)}`;
  if (t === "bulk") return `Bulk update ${op.count} tasks`;
  if (t === "remove") return `Remove ${op.kind} "${op.name}"`;
  if (t === "answer") return String(op.text ?? "").slice(0, 120);
  return t;
}

// ── apply an op through existing hooks ────────────────────────────────────

type Hooks = {
  createTask: ReturnType<typeof useCreateEntity>;
  updateTask: ReturnType<typeof useUpdateEntity>;
  deleteTask: ReturnType<typeof useDeleteEntity>;
  createRisk: ReturnType<typeof useCreateEntity>;
  updateRisk: ReturnType<typeof useUpdateEntity>;
  createFinding: ReturnType<typeof useCreateEntity>;
  createProduct: ReturnType<typeof useCreateEntity>;
  createMilestone: ReturnType<typeof useCreateEntity>;
  updateMilestone: ReturnType<typeof useUpdateEntity>;
  createMember: ReturnType<typeof useCreateEntity>;
  updateMember: ReturnType<typeof useUpdateEntity>;
  createCategory: ReturnType<typeof useCreateEntity>;
  createTag: ReturnType<typeof useCreateEntity>;
  updateProject: ReturnType<typeof useUpdateProject>;
  ws: WorkingSet;
  projectId: string;
};

function shiftISO(iso: string, days: number): string {
  if (!iso) return iso;
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function COLORS_MEMBER(n: number) {
  const palette = ["blue","indigo","teal","green","amber","red","pink","purple"];
  return palette[n % palette.length];
}
function COLORS_TRACK(n: number) {
  const palette = ["teal","pink","blue","indigo","amber","green","red","purple"];
  return palette[n % palette.length];
}
function COLORS_TAG(n: number) {
  const palette = ["blue","green","amber","pink","teal","indigo"];
  return palette[n % palette.length];
}

async function applyOp(op: PlanOp, h: Hooks): Promise<string | null> {
  const { ws } = h;
  const mut = <T,>(p: Promise<T>) => p;

  if (op.type === "status") {
    await mut(h.updateTask.mutateAsync({ id: op.taskId!, data: { status: op.to } }));
    return `Set "${op.taskTitle}" to ${op.to}`;
  }
  if (op.type === "dates") {
    await mut(h.updateTask.mutateAsync({ id: op.taskId!, data: { start: op.start ?? "", end: op.end ?? "" } }));
    return `Rescheduled "${op.taskTitle}"`;
  }
  if (op.type === "shift_all") {
    const days = Number(op.days) || 0;
    for (const t of ws.tasks) {
      if (!t.start && !t.end) continue;
      await mut(h.updateTask.mutateAsync({ id: t.id, data: { start: t.start ? shiftISO(t.start, days) : t.start, end: t.end ? shiftISO(t.end, days) : t.end } }));
    }
    return `Shifted whole plan by ${days} days`;
  }
  if (op.type === "assign") {
    const task = ws.tasks.find((t) => t.id === op.taskId);
    const who = String(op.who ?? "");
    const cur = task?.assignees ?? [];
    const next = op.clear ? cur.filter((a) => a !== who) : [...new Set([...cur, who])];
    await mut(h.updateTask.mutateAsync({ id: op.taskId!, data: { assignees: next } }));
    return `${op.clear ? "Unassigned" : "Assigned"} ${who}`;
  }
  if (op.type === "edit_task") {
    const patch: Record<string, unknown> = {};
    if (op.title) patch.title = op.title;
    if (op.desc !== undefined) patch.description = op.desc;
    if (op.track !== undefined) patch.category = op.track;
    await mut(h.updateTask.mutateAsync({ id: op.taskId!, data: patch }));
    return `Edited "${op.taskTitle}"`;
  }
  if (op.type === "move_track") {
    await mut(h.updateTask.mutateAsync({ id: op.taskId!, data: { category: op.track } }));
    return `Moved "${op.taskTitle}" to track ${op.track}`;
  }
  if (op.type === "make_subtask") {
    await mut(h.updateTask.mutateAsync({ id: op.taskId!, data: { parentId: op.parentId } }));
    return `Made "${op.taskTitle}" a subtask`;
  }
  if (op.type === "promote") {
    await mut(h.updateTask.mutateAsync({ id: op.taskId!, data: { parentId: null } }));
    return `Promoted "${op.taskTitle}"`;
  }
  if (op.type === "reorder") {
    const max = Math.max(...ws.tasks.map((t) => t.position));
    const pos = op.to === "bottom" ? max + 1 : -1;
    await mut(h.updateTask.mutateAsync({ id: op.taskId!, data: { position: pos } }));
    return `Reordered "${op.taskTitle}"`;
  }
  if (op.type === "tag") {
    const label = String(op.label ?? "");
    let tg = ws.tags.find((x) => x.label.toLowerCase() === label.toLowerCase());
    if (!tg) {
      tg = await h.createTag.mutateAsync({ label, color: COLORS_TAG(ws.tags.length) }) as typeof ws.tags[0];
    }
    const task = ws.tasks.find((t) => t.id === op.taskId);
    await mut(h.updateTask.mutateAsync({ id: op.taskId!, data: { tags: [...new Set([...(task?.tags ?? []), tg.id])] } }));
    return `Tagged "${op.taskTitle}" with ${label}`;
  }
  if (op.type === "untag") {
    const label = String(op.label ?? "");
    const tg = ws.tags.find((x) => x.label.toLowerCase() === label.toLowerCase());
    const task = ws.tasks.find((t) => t.id === op.taskId);
    const next = tg ? (task?.tags ?? []).filter((id) => id !== tg.id) : (task?.tags ?? []);
    await mut(h.updateTask.mutateAsync({ id: op.taskId!, data: { tags: next } }));
    return `Removed tag "${label}" from "${op.taskTitle}"`;
  }
  if (op.type === "comment") {
    const task = ws.tasks.find((t) => t.id === op.taskId);
    const cur = task?.comments ?? [];
    await mut(h.updateTask.mutateAsync({ id: op.taskId!, data: { comments: [...cur, { id: genId("cmt"), author: String(op.author ?? "AI import"), color: "indigo", text: op.text, ts: Date.now() }] } }));
    return `Comment on "${op.taskTitle}"`;
  }
  if (op.type === "subtask") {
    await mut(h.createTask.mutateAsync({ title: String(op.title ?? "Subtask"), status: "backlog", parentId: op.parentId, tags: [], assignees: [], deps: [], comments: [], custom: {} }));
    return `Added subtask "${op.title}"`;
  }
  if (op.type === "create") {
    await mut(h.createTask.mutateAsync({ title: String(op.title ?? "New task"), status: op.status ?? "backlog", category: op.track ?? null, assignees: op.assignee ? [op.assignee] : [], start: op.start ?? "", end: op.end ?? "", tags: [], deps: [], comments: [], custom: {} }));
    return `Created "${op.title}"`;
  }
  if (op.type === "dependency") {
    const task = ws.tasks.find((t) => t.id === op.taskId);
    const cur = task?.deps ?? [];
    const dep = op.onId
      ? { id: genId("d"), type: "task" as const, refId: op.onId }
      : { id: genId("d"), type: "external" as const, label: String(op.external ?? ""), scope: "" };
    const has = cur.some((d) => (op.onId ? d.type === "task" && d.refId === op.onId : d.type === "external" && d.label === op.external));
    if (!has) await mut(h.updateTask.mutateAsync({ id: op.taskId!, data: { deps: [...cur, dep] } }));
    return `Added dependency for "${op.taskTitle}"`;
  }
  if (op.type === "remove_dep") {
    const task = ws.tasks.find((t) => t.id === op.taskId);
    const next = (task?.deps ?? []).filter((d) => op.onId ? !(d.type === "task" && d.refId === op.onId) : !(d.type === "external" && d.label === op.external));
    await mut(h.updateTask.mutateAsync({ id: op.taskId!, data: { deps: next } }));
    return `Removed dependency from "${op.taskTitle}"`;
  }
  if (op.type === "delete") {
    await mut(h.deleteTask.mutateAsync(op.taskId!));
    return `Deleted "${op.taskTitle}"`;
  }
  if (op.type === "bulk") {
    const ids = (op.matchedIds as string[] | undefined) ?? [];
    const set = (op.set as Record<string, unknown>) ?? {};
    const days = Number(op.shiftDays ?? 0);
    for (const id of ids) {
      const patch: Record<string, unknown> = {};
      if (set.status) patch.status = set.status;
      if (set.track) patch.category = set.track;
      if (set.assign) patch.assignees = [set.assign];
      if (days !== 0) {
        const t = ws.tasks.find((x) => x.id === id);
        if (t?.start) patch.start = shiftISO(t.start, days);
        if (t?.end) patch.end = shiftISO(t.end, days);
      }
      if (Object.keys(patch).length) await mut(h.updateTask.mutateAsync({ id, data: patch }));
    }
    return `Bulk updated ${ids.length} tasks`;
  }
  if (op.type === "risk") {
    await mut(h.createRisk.mutateAsync({ title: String(op.title ?? "Risk"), likelihood: op.likelihood ?? "med", impact: op.impact ?? "med", mitigation: op.mitigation ?? "", owner: op.owner ?? "", status: "open", taskIds: op.taskId ? [op.taskId] : [] }));
    return `Logged risk "${op.title}"`;
  }
  if (op.type === "edit_risk") {
    const patch: Record<string, unknown> = {};
    if (op.title !== undefined) patch.title = op.title;
    if (op.likelihood !== undefined) patch.likelihood = op.likelihood;
    if (op.impact !== undefined) patch.impact = op.impact;
    if (op.mitigation !== undefined) patch.mitigation = op.mitigation;
    if (op.owner !== undefined) patch.owner = op.owner;
    if (op.status !== undefined) patch.status = op.status;
    await mut(h.updateRisk.mutateAsync({ id: op.refId!, data: patch }));
    return `Updated risk "${op.taskTitle}"`;
  }
  if (op.type === "finding") {
    const ex = ws.findings.find((f) => f.title.toLowerCase() === String(op.title ?? "").toLowerCase());
    if (ex) await mut(h.createFinding.mutateAsync({ ...ex, summary: op.summary ?? ex.summary, category: op.category ?? ex.category }));
    else await mut(h.createFinding.mutateAsync({ title: String(op.title), summary: String(op.summary ?? ""), category: String(op.category ?? ""), source: "AI import" }));
    return `Insight: "${op.title}"`;
  }
  if (op.type === "deliverable") {
    await mut(h.createProduct.mutateAsync({ name: String(op.name), type: "doc", url: op.link ?? "", taskIds: op.taskId ? [op.taskId] : [], date: "", note: "", placeholder: !op.link }));
    return `Deliverable: "${op.name}"`;
  }
  if (op.type === "milestone") {
    const ex = ws.milestones.find((m) => m.title.toLowerCase() === String(op.title ?? "").toLowerCase());
    if (ex) {
      const patch: Record<string, unknown> = { type: op.kind ?? ex.type };
      if (op.date) patch.date = op.date;
      if (op.note) patch.note = op.note;
      if (op.category !== undefined) patch.category = op.category;
      await mut(h.updateMilestone.mutateAsync({ id: ex.id, data: patch }));
    } else {
      await mut(h.createMilestone.mutateAsync({ title: String(op.title), type: op.kind ?? "milestone", date: op.date ?? "", category: op.category ?? null, note: op.note ?? "" }));
    }
    return `${op.kind === "gate" ? "Gate" : "Milestone"}: "${op.title}"`;
  }
  if (op.type === "member") {
    await mut(h.createMember.mutateAsync({ name: String(op.name), role: op.role ?? "", email: "", color: COLORS_MEMBER(ws.members.length), capacityHours: 30, availability: {} }));
    return `Added member ${op.name}`;
  }
  if (op.type === "edit_member") {
    const m = ws.members.find((x) => x.name.toLowerCase() === String(op.name ?? "").toLowerCase());
    if (m) {
      const patch: Record<string, unknown> = {};
      if (op.rename) patch.name = op.rename;
      if (op.role !== undefined) patch.role = op.role;
      await mut(h.updateMember.mutateAsync({ id: m.id, data: patch }));
    }
    return `Edited member ${op.name}`;
  }
  if (op.type === "track") {
    const label = String(op.label ?? "");
    const ex = ws.categories.find((c) => c.label.toLowerCase() === label.toLowerCase());
    if (!ex) await mut(h.createCategory.mutateAsync({ label, color: COLORS_TRACK(ws.categories.length) }));
    return `Created track "${label}"`;
  }
  // JSONB / project-level ops
  if (op.type === "scope_in") {
    const sc = (ws.project.scope as { inScope?: string[]; outScope?: string[] }) ?? { inScope: [], outScope: [] };
    const line = String(op.line ?? "");
    if (!sc.inScope?.includes(line)) await mut(h.updateProject.mutateAsync({ scope: { ...sc, inScope: [...(sc.inScope ?? []), line] } }));
    return `Added to in scope: ${line}`;
  }
  if (op.type === "scope_out") {
    const sc = (ws.project.scope as { inScope?: string[]; outScope?: string[] }) ?? { inScope: [], outScope: [] };
    const line = String(op.line ?? "");
    if (!sc.outScope?.includes(line)) await mut(h.updateProject.mutateAsync({ scope: { ...sc, outScope: [...(sc.outScope ?? []), line] } }));
    return `Added to out of scope: ${line}`;
  }
  if (op.type === "glossary") {
    const cur = (ws.project.glossary as { id?: string; term: string; definition: string }[]) ?? [];
    const ex = cur.find((g) => g.term.toLowerCase() === String(op.term ?? "").toLowerCase());
    const next = ex ? cur.map((g) => (g === ex ? { ...g, definition: op.definition } : g)) : [...cur, { id: genId("gl"), term: String(op.term), definition: String(op.definition ?? "") }];
    await mut(h.updateProject.mutateAsync({ glossary: next }));
    return `Defined "${op.term}"`;
  }
  if (op.type === "budget") {
    const fin = (ws.project.financials as { budget?: { id: string; label: string; amount: number; note: string }[] }) ?? {};
    const next = [...(fin.budget ?? []), { id: genId("bud"), label: String(op.label ?? ""), amount: Number(op.amount ?? 0), note: "" }];
    await mut(h.updateProject.mutateAsync({ financials: { ...fin, budget: next } }));
    return `Budget line: ${op.label}`;
  }
  if (op.type === "setting") {
    const key = String(op.key ?? "");
    if (key === "buffer") {
      const fc = (ws.project.forecast as Record<string, unknown>) ?? {};
      await mut(h.updateProject.mutateAsync({ forecast: { ...fc, bufferPct: op.value } }));
    } else {
      const s = (ws.project.settings as { nudges?: Record<string, unknown> }) ?? {};
      await mut(h.updateProject.mutateAsync({ settings: { ...s, nudges: { ...(s.nudges ?? {}), [key]: op.value } } }));
    }
    return `Setting ${op.key} = ${op.value}`;
  }
  if (op.type === "strategy") {
    const su = (ws.project.startup as Record<string, unknown>) ?? {};
    const section = String(op.section ?? "");
    let patch: Record<string, unknown> = {};
    if (section === "mission" || section === "vision") {
      patch = { startup: { ...su, mission: { ...(su.mission as object ?? {}), [section]: op.text } } };
    } else if (section === "valueprop") {
      patch = { startup: { ...su, valueProp: { ...(su.valueProp as object ?? {}), headline: op.text } } };
    } else if (section.startsWith("bmc_")) {
      const block = section.slice(4);
      patch = { startup: { ...su, bmc: { ...(su.bmc as object ?? {}), [`${block}_note`]: op.text, [`_mode_${block}`]: "notes" } } };
    }
    if (Object.keys(patch).length) await mut(h.updateProject.mutateAsync(patch));
    return `Strategy ${section} updated`;
  }
  // unhandled — skip silently
  return null;
}

// ── Op row component ──────────────────────────────────────────────────────

function OpRow({ op, checked, onToggle }: { op: PlanOp; checked: boolean; onToggle: () => void }) {
  const Icon = OP_ICON[op.type as string] ?? LayoutList;
  const isAnswer = op.type === "answer";

  if (isAnswer) {
    return (
      <Alert className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30">
        <MessageCircle className="size-4 text-blue-500" />
        <AlertDescription className="text-sm">{String(op.text ?? "")}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 transition ${checked ? "" : "opacity-50"}`}>
      <input
        type="checkbox"
        className="mt-0.5 cursor-pointer accent-indigo-500"
        checked={checked}
        onChange={onToggle}
      />
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1 text-sm">
        <p className="leading-snug">{opLabel(op)}</p>
        {op._cascade && (
          <div className="mt-1 flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
            <Zap className="size-3" />
            <span>Cascading event — {String(op._cascade)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Group card ─────────────────────────────────────────────────────────────

function GroupCard({
  group,
  sel,
  onToggle,
}: {
  group: PlanGroup;
  sel: Record<string, boolean>;
  onToggle: (id: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const applyable = group.ops.filter((o) => o.type !== "answer");
  return (
    <div className="rounded-xl border">
      <button
        onClick={() => setCollapsed((v) => !v)}
        className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left"
      >
        <blockquote className="border-l-2 border-indigo-300 pl-3 text-sm italic text-muted-foreground line-clamp-2">
          {group.quote}
        </blockquote>
        <div className="flex shrink-0 items-center gap-2">
          {applyable.length > 0 && (
            <Badge variant="secondary">{applyable.filter((o) => sel[String(o._id)]).length}/{applyable.length}</Badge>
          )}
          {collapsed ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
        </div>
      </button>
      {!collapsed && (
        <div className="space-y-2 px-4 pb-4">
          {group.ops.map((op) => (
            <OpRow
              key={String(op._id)}
              op={op}
              checked={sel[String(op._id)] ?? true}
              onToggle={() => onToggle(String(op._id))}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main module ────────────────────────────────────────────────────────────

export function PlanModule({ projectId }: { projectId: string }) {
  const { data: ws } = useProject(projectId);
  const qc = useQueryClient();
  const [text, setText] = useState(() => {
    if (typeof window === "undefined") return "";
    const key = `plan_draft_${projectId}`;
    const v = sessionStorage.getItem(key) ?? "";
    if (v) sessionStorage.removeItem(key);
    return v;
  });
  const [groups, setGroups] = useState<PlanGroup[]>([]);
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);

  const createTask = useCreateEntity(projectId, "tasks");
  const updateTask = useUpdateEntity(projectId, "tasks");
  const deleteTask = useDeleteEntity(projectId, "tasks");
  const createRisk = useCreateEntity(projectId, "risks");
  const updateRisk = useUpdateEntity(projectId, "risks");
  const createFinding = useCreateEntity(projectId, "findings");
  const createProduct = useCreateEntity(projectId, "products");
  const createMilestone = useCreateEntity(projectId, "milestones");
  const updateMilestone = useUpdateEntity(projectId, "milestones");
  const createMember = useCreateEntity(projectId, "members");
  const updateMember = useUpdateEntity(projectId, "members");
  const createCategory = useCreateEntity(projectId, "categories");
  const createTag = useCreateEntity(projectId, "tags");
  const updateProject = useUpdateProject(projectId);
  const logActivity = useLogActivity(projectId);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  async function analyse() {
    if (!text.trim()) return;
    setLoading(true);
    setGroups([]);
    setSel({});
    try {
      const result = await apiFetch<PlanResult>(`/api/projects/${projectId}/plan`, {
        method: "POST",
        body: JSON.stringify({ text }),
      });
      const newSel: Record<string, boolean> = {};
      (result.groups ?? []).forEach((g) =>
        g.ops.forEach((op) => {
          if (op.type !== "answer") newSel[String(op._id)] = true;
        }),
      );
      setGroups(result.groups ?? []);
      setSel(newSel);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function toggleOp(id: string) {
    setSel((s) => ({ ...s, [id]: !s[id] }));
  }

  async function applyAll() {
    if (!ws) return;
    const allOps = groups.flatMap((g) => g.ops);
    const approved = allOps.filter((op) => op.type !== "answer" && sel[String(op._id)]);
    if (!approved.length) { toast("Nothing selected"); return; }

    const hooks: Hooks = {
      createTask, updateTask, deleteTask,
      createRisk, updateRisk,
      createFinding, createProduct,
      createMilestone, updateMilestone,
      createMember, updateMember,
      createCategory, createTag,
      updateProject,
      ws,
      projectId,
    };

    setApplying(true);
    let applied = 0;
    try {
      for (const op of approved) {
        const label = await applyOp(op, hooks);
        if (label) applied++;
      }
      await qc.invalidateQueries({ queryKey: ["project", projectId] });
      await qc.invalidateQueries({ queryKey: ["projects"] });
      toast.success(`Applied ${applied} change${applied === 1 ? "" : "s"}`);
      logActivity(
        `Plan update from chat: ${applied} change${applied === 1 ? "" : "s"} applied`,
        { kind: "import" },
      );
      setGroups([]);
      setSel({});
      setText("");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setApplying(false);
    }
  }

  const allOps = groups.flatMap((g) => g.ops).filter((o) => o.type !== "answer");
  const selectedCount = allOps.filter((o) => sel[String(o._id)]).length;

  return (
    <div>
      <ModuleHeader
        title="Update plan from chat"
        description="Describe changes, ask questions, or paste notes — the AI will propose updates for your review."
      />

      <SectionCard>
        <Textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={`"Mark the design tasks as done and push everything else by 2 weeks"\n"Who is assigned to the onboarding flow?"\n"Add a risk: third-party API may be delayed"`}
          rows={4}
          className="resize-none font-mono text-sm"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) analyse();
          }}
        />
        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">⌘↵ to analyse</span>
          <Button onClick={analyse} disabled={loading || !text.trim()}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Zap className="size-4" />}
            {loading ? "Analysing…" : "Analyse"}
          </Button>
        </div>
      </SectionCard>

      {groups.length > 0 && (
        <div className="mt-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">
              Proposed changes ({selectedCount}/{allOps.length} selected)
            </h2>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const all: Record<string, boolean> = {};
                  allOps.forEach((o) => (all[String(o._id)] = true));
                  setSel(all);
                }}
              >
                Select all
              </Button>
              <Button
                size="sm"
                disabled={applying || selectedCount === 0}
                onClick={applyAll}
              >
                {applying ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                {applying ? "Applying…" : `Apply ${selectedCount}`}
              </Button>
            </div>
          </div>

          {groups.map((g, i) => (
            <GroupCard key={i} group={g} sel={sel} onToggle={toggleOp} />
          ))}
        </div>
      )}
    </div>
  );
}
