"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { useProject, useUpdateProject } from "@/lib/api/hooks";
import { ModuleHeader, SectionCard } from "@/components/project/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ── types ─────────────────────────────────────────────────────────────────────

interface BudgetLine { id: string; label: string; amount: number; note: string }
interface Contract {
  title: string; party: string; value: number;
  signed: string; start: string; end: string; note: string;
}
interface FinancialsDoc {
  currency: string; weighting: string;
  contract: Contract;
  budget: BudgetLine[];
}

function blankContract(): Contract {
  return { title: "", party: "", value: 0, signed: "", start: "", end: "", note: "" };
}
function blankFin(): FinancialsDoc {
  return { currency: "€", weighting: "duration", contract: blankContract(), budget: [] };
}

function fmt(currency: string, amount: number) {
  return `${currency}${Number(amount).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function uid() {
  return `bl_${Math.random().toString(36).slice(2, 9)}`;
}

// ── Contract card ─────────────────────────────────────────────────────────────

function ContractCard({
  doc, currency, onChange,
}: {
  doc: Contract; currency: string; onChange: (c: Contract) => void;
}) {
  const set = (k: keyof Contract, v: string | number) =>
    onChange({ ...doc, [k]: v });

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label>Contract title</Label>
        <Input value={doc.title} onChange={(e) => set("title", e.target.value)} placeholder="Service agreement" />
      </div>
      <div className="space-y-1.5">
        <Label>Counter-party</Label>
        <Input value={doc.party} onChange={(e) => set("party", e.target.value)} placeholder="Client / vendor name" />
      </div>
      <div className="space-y-1.5">
        <Label>Contract value ({currency})</Label>
        <Input type="number" value={doc.value || ""} onChange={(e) => set("value", parseFloat(e.target.value) || 0)} placeholder="0" />
      </div>
      <div className="space-y-1.5">
        <Label>Signed</Label>
        <Input type="date" value={doc.signed} onChange={(e) => set("signed", e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label>Start</Label>
        <Input type="date" value={doc.start} onChange={(e) => set("start", e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label>End</Label>
        <Input type="date" value={doc.end} onChange={(e) => set("end", e.target.value)} />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label>Notes</Label>
        <Textarea value={doc.note} onChange={(e) => set("note", e.target.value)} rows={2} placeholder="Payment schedule, SLAs, key clauses…" />
      </div>
    </div>
  );
}

// ── Budget table ──────────────────────────────────────────────────────────────

function BudgetTable({
  lines, currency, onChange,
}: {
  lines: BudgetLine[]; currency: string; onChange: (lines: BudgetLine[]) => void;
}) {
  const total = lines.reduce((s, l) => s + (l.amount || 0), 0);

  function update(id: string, k: keyof BudgetLine, v: string | number) {
    onChange(lines.map((l) => l.id === id ? { ...l, [k]: v } : l));
  }
  function remove(id: string) {
    onChange(lines.filter((l) => l.id !== id));
  }
  function add() {
    onChange([...lines, { id: uid(), label: "New line", amount: 0, note: "" }]);
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="pb-2 font-medium">Budget line</th>
              <th className="pb-2 pl-3 font-medium w-36">Amount ({currency})</th>
              <th className="pb-2 pl-3 font-medium">Note</th>
              <th className="pb-2 w-8"></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id} className="group border-b last:border-0">
                <td className="py-1.5 pr-3">
                  <Input
                    value={l.label}
                    onChange={(e) => update(l.id, "label", e.target.value)}
                    className="h-7 text-sm"
                  />
                </td>
                <td className="py-1.5 pl-3 pr-3">
                  <Input
                    type="number"
                    value={l.amount || ""}
                    onChange={(e) => update(l.id, "amount", parseFloat(e.target.value) || 0)}
                    className="h-7 w-32 text-sm"
                  />
                </td>
                <td className="py-1.5 pr-3">
                  <Input
                    value={l.note}
                    onChange={(e) => update(l.id, "note", e.target.value)}
                    className="h-7 text-sm"
                    placeholder="Optional note"
                  />
                </td>
                <td className="py-1.5">
                  <button onClick={() => remove(l.id)} className="text-muted-foreground hover:text-red-500 opacity-0 group-hover:opacity-100">
                    <Trash2 className="size-3.5" />
                  </button>
                </td>
              </tr>
            ))}
            {lines.length === 0 && (
              <tr><td colSpan={4} className="py-6 text-center text-sm text-muted-foreground">No budget lines yet.</td></tr>
            )}
          </tbody>
          {lines.length > 0 && (
            <tfoot>
              <tr className="border-t">
                <td className="pt-2 font-semibold text-sm">Total</td>
                <td className="pl-3 pt-2 font-semibold text-sm">{fmt(currency, total)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <Button variant="outline" size="sm" className="mt-3" onClick={add}>
        <Plus className="size-3.5" /> Add line
      </Button>
    </div>
  );
}

// ── Budget vs Progress chart ──────────────────────────────────────────────────

function BudgetVsProgress({
  doc, donePct, contractValue, currency,
}: {
  doc: FinancialsDoc; donePct: number; contractValue: number; currency: string;
}) {
  const totalBudget = doc.budget.reduce((s, l) => s + (l.amount || 0), 0);
  const displayTotal = Math.max(contractValue, totalBudget);

  // Time-based progress: % of contract period elapsed
  const today = new Date().toISOString().slice(0, 10);
  let timePct = 0;
  if (doc.contract.start && doc.contract.end) {
    const s = new Date(doc.contract.start).getTime();
    const e = new Date(doc.contract.end).getTime();
    const n = new Date(today).getTime();
    if (e > s) timePct = Math.min(100, Math.max(0, ((n - s) / (e - s)) * 100));
  }

  // On track if work progress ≥ time progress (within 10% tolerance)
  const onTrack = donePct >= timePct - 10;
  const VerdictIcon = onTrack ? TrendingUp : TrendingDown;

  return (
    <div>
      {/* Work progress bar */}
      <div className="mb-4 space-y-3">
        <div>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Work complete</span>
            <span className="font-medium">{Math.round(donePct)}%</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-green-500 transition-all" style={{ width: `${donePct}%` }} />
          </div>
        </div>
        {doc.contract.start && doc.contract.end && (
          <div>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Time elapsed</span>
              <span className="font-medium">{Math.round(timePct)}%</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${timePct}%` }} />
            </div>
          </div>
        )}
      </div>

      {/* Budget breakdown bars */}
      {doc.budget.length > 0 && displayTotal > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Budget breakdown</p>
          {doc.budget.map((l) => {
            const pct = (l.amount / displayTotal) * 100;
            return (
              <div key={l.id}>
                <div className="mb-0.5 flex items-center justify-between text-xs">
                  <span className="truncate">{l.label}</span>
                  <span className="ml-3 shrink-0 text-muted-foreground">{fmt(currency, l.amount)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-indigo-400 transition-all" style={{ width: `${Math.min(pct, 100)}%` }} />
                </div>
              </div>
            );
          })}
          <div className="pt-1 flex items-center justify-between text-xs font-semibold">
            <span>Total budget</span>
            <span>{fmt(currency, totalBudget)}</span>
          </div>
        </div>
      )}

      {/* Verdict */}
      <div className={cn(
        "mt-4 flex items-center gap-2 rounded-lg p-3 text-sm font-medium",
        onTrack ? "bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-300"
                : "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300",
      )}>
        <VerdictIcon className="size-4 shrink-0" />
        {onTrack
          ? `On track — ${Math.round(donePct)}% done vs ${Math.round(timePct)}% time elapsed`
          : `Behind — ${Math.round(donePct)}% done but ${Math.round(timePct)}% time elapsed`}
      </div>
    </div>
  );
}

// ── Module ────────────────────────────────────────────────────────────────────

export function FinancialsModule({ projectId }: { projectId: string }) {
  const { data: ws } = useProject(projectId);
  const updateProject = useUpdateProject(projectId);

  const fin: FinancialsDoc = useMemo(() => {
    if (!ws) return blankFin();
    const raw = ws.project.financials as Partial<FinancialsDoc> | null;
    return {
      currency: raw?.currency ?? "€",
      weighting: raw?.weighting ?? "duration",
      contract: { ...blankContract(), ...(raw?.contract ?? {}) },
      budget: raw?.budget ?? [],
    };
  }, [ws]);

  if (!ws) return null;

  const { tasks } = ws;
  const donePct = tasks.length
    ? (tasks.filter((t) => t.status === "done").length / tasks.length) * 100
    : 0;

  function save(patch: Partial<FinancialsDoc>) {
    const next = { ...fin, ...patch };
    updateProject.mutate(
      { financials: next },
      { onError: (e) => toast.error((e as Error).message) },
    );
  }

  return (
    <div>
      <ModuleHeader
        title="Financials"
        description="Contract details, budget breakdown and delivery progress."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Contract */}
        <SectionCard title="Contract">
          <ContractCard
            doc={fin.contract}
            currency={fin.currency}
            onChange={(c) => save({ contract: c })}
          />
          <div className="mt-3 flex items-center gap-3">
            <Label className="shrink-0 text-xs">Currency</Label>
            <input
              className="w-16 rounded border px-2 py-1 text-sm"
              value={fin.currency}
              onChange={(e) => save({ currency: e.target.value.toUpperCase() })}
              maxLength={3}
            />
          </div>
        </SectionCard>

        {/* Progress chart */}
        <SectionCard title="Budget vs progress">
          <BudgetVsProgress
            doc={fin}
            donePct={donePct}
            contractValue={fin.contract.value ?? 0}
            currency={fin.currency}
          />
        </SectionCard>
      </div>

      {/* Budget table */}
      <SectionCard title="Budget lines" className="mt-6">
        <BudgetTable
          lines={fin.budget}
          currency={fin.currency}
          onChange={(budget) => save({ budget })}
        />
      </SectionCard>
    </div>
  );
}
