"use client";

import { useState, useRef } from "react";
import {
  Zap, Check, MessageCircle, Loader2, ChevronDown, ChevronUp, LayoutList,
} from "lucide-react";
import { ModuleHeader, SectionCard } from "@/components/project/ui";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { OP_ICON, opLabel } from "@/lib/plan-engine";
import { usePlanRunner } from "@/lib/use-plan-runner";
import type { PlanOp, PlanGroup } from "@/lib/ai/plan-types";

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
  const [text, setText] = useState(() => {
    if (typeof window === "undefined") return "";
    const key = `plan_draft_${projectId}`;
    const v = sessionStorage.getItem(key) ?? "";
    if (v) sessionStorage.removeItem(key);
    return v;
  });
  const runner = usePlanRunner(projectId);
  const { groups, sel, loading, applying, ops, selectedCount } = runner;
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  async function analyse() {
    await runner.run(text);
  }

  async function applyAll() {
    const applied = await runner.apply();
    if (applied > 0) setText("");
  }

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
          placeholder={`"Mark the design tasks as done and push everything else by 2 weeks"
"Who is assigned to the onboarding flow?"
"Add a risk: third-party API may be delayed"`}
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
              Proposed changes ({selectedCount}/{ops.length} selected)
            </h2>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => runner.setAll(true)}>
                Select all
              </Button>
              <Button size="sm" disabled={applying || selectedCount === 0} onClick={applyAll}>
                {applying ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                {applying ? "Applying…" : `Apply ${selectedCount}`}
              </Button>
            </div>
          </div>

          {groups.map((g, i) => (
            <GroupCard key={i} group={g} sel={sel} onToggle={runner.toggle} />
          ))}
        </div>
      )}
    </div>
  );
}
