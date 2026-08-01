"use client";

import { useMemo, useState } from "react";
import {
  addWeeks, startOfWeek, endOfWeek, format, parseISO,
} from "date-fns";
import { Plus, Trash2, Pencil, Check, X } from "lucide-react";
import { toast } from "sonner";
import { useProject, useCreateEntity, useDeleteMember, useUpdateMember } from "@/lib/api/hooks";
import type { Member, Task } from "@/lib/types";
import { accent, ACCENTS } from "@/lib/colors";
import { cn } from "@/lib/utils";
import { ModuleHeader, SectionCard } from "@/components/project/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// ── helpers ──────────────────────────────────────────────────────────────────

const WEEKS_AHEAD = 10;

function isoDate(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

function clamp(val: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, val));
}

interface WeekBucket {
  weekStart: Date;
  weekEnd: Date;
  label: string;
  /** Hours per member */
  hoursById: Record<string, number>;
}

function buildWeeks(tasks: Task[]): WeekBucket[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const buckets: WeekBucket[] = [];
  for (let w = 0; w < WEEKS_AHEAD; w++) {
    const weekStart = startOfWeek(addWeeks(today, w), { weekStartsOn: 1 });
    const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
    buckets.push({
      weekStart,
      weekEnd,
      label: format(weekStart, "MMM d"),
      hoursById: {},
    });
  }

  tasks.forEach((t) => {
    if (!t.start || !t.end || t.status === "done") return;
    const taskStart = parseISO(t.start);
    const taskEnd = parseISO(t.end);
    const durationDays = Math.max(1, (taskEnd.getTime() - taskStart.getTime()) / 86_400_000);
    const numAssignees = Math.max(1, (t.assignees ?? []).length);

    buckets.forEach((b) => {
      const overlapStart = taskStart > b.weekStart ? taskStart : b.weekStart;
      const overlapEnd = taskEnd < b.weekEnd ? taskEnd : b.weekEnd;
      if (overlapEnd < overlapStart) return;
      const overlapDays = (overlapEnd.getTime() - overlapStart.getTime()) / 86_400_000 + 1;
      const fraction = overlapDays / durationDays;
      // 8 h/day, 5 working days/week; spread across assignees
      const hoursPerAssignee = (fraction * 5 * 8) / numAssignees;
      (t.assignees ?? []).forEach((name) => {
        b.hoursById[name] = (b.hoursById[name] ?? 0) + hoursPerAssignee;
      });
    });
  });

  return buckets;
}

// ── member card ───────────────────────────────────────────────────────────────

function MemberCard({ member, weeks }: { member: Member; weeks: WeekBucket[] }) {
  const a = accent(member.color);
  const cap = member.capacityHours || 40;

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex items-center gap-3">
        <div className={cn("flex size-9 items-center justify-center rounded-full text-sm font-semibold text-white", a.bg)}>
          {member.name.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase()}
        </div>
        <div>
          <p className="text-sm font-semibold">{member.name}</p>
          <p className="text-xs text-muted-foreground">{member.role || "Team member"} · {cap}h/wk capacity</p>
        </div>
      </div>

      {/* Week bars */}
      <div className="flex gap-1 items-end h-16">
        {weeks.map((w, i) => {
          const load = w.hoursById[member.name] ?? 0;
          const pct = clamp((load / cap) * 100, 0, 150);
          const over = load > cap;
          return (
            <div key={i} className="flex flex-1 flex-col items-center gap-0.5" title={`${w.label}: ${Math.round(load)}h / ${cap}h`}>
              <div className="w-full flex flex-col justify-end" style={{ height: 48 }}>
                <div
                  className={cn(
                    "w-full rounded-t transition-all",
                    over ? "bg-red-500" : "bg-current opacity-40",
                    !over && a.bg,
                  )}
                  style={{ height: `${clamp(pct, 2, 100)}%` }}
                />
              </div>
              <span className="text-[9px] text-muted-foreground leading-none">{w.label.split(" ")[0]}</span>
            </div>
          );
        })}
      </div>

      {/* Weekly summary chips */}
      <div className="mt-3 flex flex-wrap gap-1">
        {weeks.map((w, i) => {
          const load = w.hoursById[member.name] ?? 0;
          const over = load > cap;
          if (load < 0.5) return null;
          return (
            <Badge key={i} variant="secondary"
              className={cn("text-[10px]", over && "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300")}>
              {w.label}: {Math.round(load)}h {over ? "⚠" : ""}
            </Badge>
          );
        })}
        {weeks.every((w) => (w.hoursById[member.name] ?? 0) < 0.5) && (
          <p className="text-xs text-muted-foreground">No upcoming tasks with dates assigned.</p>
        )}
      </div>
    </div>
  );
}

// ── heatmap overview ─────────────────────────────────────────────────────────

function HeatmapRow({ member, weeks }: { member: Member; weeks: WeekBucket[] }) {
  const cap = member.capacityHours || 40;
  const a = accent(member.color);
  return (
    <tr className="border-b last:border-0">
      <td className="py-2 pr-4 text-sm">
        <span className={cn("mr-2 inline-block size-2 rounded-full", a.bg)} />
        {member.name}
      </td>
      {weeks.map((w, i) => {
        const load = w.hoursById[member.name] ?? 0;
        const ratio = load / cap;
        const over = ratio > 1;
        const bg =
          load < 0.5 ? "bg-muted/30" :
          over ? "bg-red-500/80 text-white" :
          ratio > 0.7 ? "bg-amber-400/70" :
          "bg-green-400/60";
        return (
          <td key={i} className="py-2 pr-1" title={`${w.label}: ${Math.round(load)}h / ${cap}h`}>
            <div className={cn("rounded px-1 py-1 text-center text-[10px] font-medium", bg)}>
              {load > 0.5 ? `${Math.round(load)}h` : "—"}
            </div>
          </td>
        );
      })}
    </tr>
  );
}

// ── member management row ─────────────────────────────────────────────────────

function MemberRow({
  member, projectId, onDelete, onRename,
}: {
  member: Member; projectId: string;
  onDelete: (id: string, name: string) => void;
  onRename: (id: string, oldName: string, newName: string) => void;
}) {
  const a = accent(member.color);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(member.name);

  function commitRename() {
    const trimmed = name.trim();
    if (trimmed && trimmed !== member.name) onRename(member.id, member.name, trimmed);
    setEditing(false);
  }

  return (
    <div className="group flex items-center gap-2 rounded-lg border px-3 py-2">
      <span className={cn("size-2.5 shrink-0 rounded-full", a.bg)} />
      {editing ? (
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") { setName(member.name); setEditing(false); } }}
          className="h-7 flex-1 text-sm"
          autoFocus
        />
      ) : (
        <span className="flex-1 text-sm font-medium">{member.name}</span>
      )}
      <span className="text-xs text-muted-foreground">{member.role || "—"}</span>
      <div className="flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
        {editing ? (
          <>
            <Button variant="ghost" size="icon" className="size-7" onClick={commitRename}><Check className="size-3.5" /></Button>
            <Button variant="ghost" size="icon" className="size-7" onClick={() => { setName(member.name); setEditing(false); }}><X className="size-3.5" /></Button>
          </>
        ) : (
          <>
            <Button variant="ghost" size="icon" className="size-7" onClick={() => setEditing(true)}><Pencil className="size-3.5" /></Button>
            <Button variant="ghost" size="icon" className="size-7" onClick={() => { if (confirm(`Remove "${member.name}" from the team? Their assignments will be cleared.`)) onDelete(member.id, member.name); }}>
              <Trash2 className="size-3.5" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

// ── module ────────────────────────────────────────────────────────────────────

export function CapacityModule({ projectId }: { projectId: string }) {
  const { data: ws } = useProject(projectId);
  const createMember = useCreateEntity(projectId, "members");
  const deleteMember = useDeleteMember(projectId);
  const updateMember = useUpdateMember(projectId);
  const [addName, setAddName] = useState("");
  const [addRole, setAddRole] = useState("");
  const [adding, setAdding] = useState(false);

  const weeks = useMemo(
    () => (ws ? buildWeeks(ws.tasks) : []),
    [ws],
  );

  if (!ws) return null;
  const { members } = ws;

  function handleAdd() {
    const name = addName.trim();
    if (!name) return;
    createMember.mutate(
      {
        name,
        role: addRole.trim(),
        email: "",
        color: ACCENTS[members.length % ACCENTS.length],
        capacityHours: 40,
        availability: {},
      },
      {
        onSuccess: () => { setAddName(""); setAddRole(""); setAdding(false); },
        onError: (e) => toast.error((e as Error).message),
      },
    );
  }

  function handleDelete(id: string, name: string) {
    deleteMember.mutate({ id, name }, { onError: (e) => toast.error((e as Error).message) });
  }

  function handleRename(id: string, oldName: string, newName: string) {
    updateMember.mutate(
      { id, oldName, data: { name: newName } },
      { onError: (e) => toast.error((e as Error).message) },
    );
  }

  return (
    <div>
      <ModuleHeader
        title="Capacity"
        description="Forward look at team load vs weekly capacity. Red = overloaded."
        actions={
          <Button size="sm" onClick={() => setAdding((v) => !v)}>
            <Plus className="size-4" /> Add member
          </Button>
        }
      />

      {/* Add member form */}
      {adding && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border bg-muted/30 p-3">
          <Input
            placeholder="Full name"
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
            className="h-8 w-40 text-sm"
            autoFocus
          />
          <Input
            placeholder="Role (optional)"
            value={addRole}
            onChange={(e) => setAddRole(e.target.value)}
            className="h-8 w-40 text-sm"
          />
          <Button size="sm" onClick={handleAdd} disabled={!addName.trim() || createMember.isPending}>
            Add
          </Button>
          <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setAddName(""); setAddRole(""); }}>
            Cancel
          </Button>
        </div>
      )}

      {/* Member management list */}
      {members.length > 0 && (
        <SectionCard title="Team members" className="mb-6">
          <div className="space-y-1.5">
            {members.map((m) => (
              <MemberRow
                key={m.id}
                member={m}
                projectId={projectId}
                onDelete={handleDelete}
                onRename={handleRename}
              />
            ))}
          </div>
        </SectionCard>
      )}

      {members.length === 0 && !adding && (
        <p className="mb-6 text-sm text-muted-foreground">
          Add team members above to track their capacity.
        </p>
      )}

      {members.length > 0 && (
        <>
          {/* Heatmap table */}
          <SectionCard title="Load heatmap (next 10 weeks)" className="mb-6">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="pb-2 pr-4 text-left font-medium">Member</th>
                    {weeks.map((w, i) => (
                      <th key={i} className="pb-2 pr-1 text-center font-medium" style={{ minWidth: 48 }}>
                        {w.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => (
                    <HeatmapRow key={m.id} member={m} weeks={weeks} />
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="size-3 rounded bg-green-400/60" /> Under 70%</span>
              <span className="flex items-center gap-1.5"><span className="size-3 rounded bg-amber-400/70" /> 70–100%</span>
              <span className="flex items-center gap-1.5"><span className="size-3 rounded bg-red-500/80" /> Overloaded</span>
            </div>
          </SectionCard>

          {/* Per-member cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {members.map((m) => (
              <MemberCard key={m.id} member={m} weeks={weeks} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
