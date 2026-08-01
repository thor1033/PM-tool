"use client";

import { useState } from "react";
import { format, isToday, isYesterday, parseISO } from "date-fns";
import { Zap, FileEdit, BotMessageSquare, Bell, Clock } from "lucide-react";
import { useAudit } from "@/lib/api/hooks";
import { ModuleHeader } from "@/components/project/ui";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ActivityEntry {
  id: string;
  ts: string;
  kind: string;
  text: string;
  actor: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function dayLabel(ts: string): string {
  const d = parseISO(ts);
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  return format(d, "EEE, d MMM");
}

function timeLabel(ts: string): string {
  return format(parseISO(ts), "HH:mm");
}

const KIND_META: Record<string, { label: string; icon: typeof Zap; cls: string }> = {
  import: {
    label: "Plan update",
    icon: BotMessageSquare,
    cls: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300",
  },
  edit: {
    label: "Edit",
    icon: FileEdit,
    cls: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  },
  automation: {
    label: "Automation",
    icon: Zap,
    cls: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  },
  reminder: {
    label: "Reminder",
    icon: Bell,
    cls: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  },
};

function kindMeta(kind: string) {
  return KIND_META[kind] ?? KIND_META.edit;
}

// ── Entry row ─────────────────────────────────────────────────────────────────

function EntryRow({ entry }: { entry: ActivityEntry }) {
  const meta = kindMeta(entry.kind);
  const Icon = meta.icon;
  return (
    <div className="flex items-start gap-3 border-b py-2.5 last:border-0">
      <div className={cn("mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full", meta.cls)}>
        <Icon className="size-3.5" />
      </div>
      <span className="flex-1 text-sm leading-snug">{entry.text}</span>
      <div className="flex shrink-0 items-center gap-2">
        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", meta.cls)}>
          {meta.label}
        </span>
        {entry.actor && (
          <span className="hidden text-xs text-muted-foreground sm:block">{entry.actor}</span>
        )}
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="size-3" />{timeLabel(entry.ts)}
        </span>
      </div>
    </div>
  );
}

// ── Day group ─────────────────────────────────────────────────────────────────

function DayGroup({ label, entries }: { label: string; entries: ActivityEntry[] }) {
  return (
    <div className="mb-4">
      <div className="mb-1 flex items-center gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</h3>
        <Badge variant="secondary" className="text-[10px]">{entries.length}</Badge>
      </div>
      <div className="rounded-xl border bg-card px-3">
        {entries.map((e) => <EntryRow key={e.id} entry={e} />)}
      </div>
    </div>
  );
}

// ── Module ────────────────────────────────────────────────────────────────────

export function AuditModule({ projectId }: { projectId: string }) {
  const { data: entries = [], isLoading } = useAudit(projectId);
  const [q, setQ] = useState("");

  const filtered = entries.filter(
    (e) => !q || e.text.toLowerCase().includes(q.toLowerCase()),
  );

  // Group by day
  const days = new Map<string, { label: string; entries: ActivityEntry[] }>();
  filtered.forEach((e) => {
    const label = dayLabel(e.ts);
    if (!days.has(label)) days.set(label, { label, entries: [] });
    days.get(label)!.entries.push(e);
  });

  return (
    <div>
      <ModuleHeader
        title="Audit trail"
        description="Every change in this project — edits, plan updates and automations — kept for 5 weeks."
      />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {filtered.length} entr{filtered.length === 1 ? "y" : "ies"}
          {q && ` matching "${q}"`}
        </p>
        <Input
          placeholder="Filter…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-64"
        />
      </div>

      {isLoading && (
        <p className="text-sm text-muted-foreground">Loading…</p>
      )}

      {!isLoading && days.size === 0 && (
        <div className="flex flex-col items-center rounded-xl border border-dashed p-16 text-center">
          <FileEdit className="mb-3 size-8 text-muted-foreground/40" />
          <p className="font-medium">Nothing yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Changes you make from here on are recorded automatically.
          </p>
        </div>
      )}

      {[...days.values()].map((g) => (
        <DayGroup key={g.label} label={g.label} entries={g.entries} />
      ))}
    </div>
  );
}
