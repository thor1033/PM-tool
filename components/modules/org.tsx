"use client";

import { useMemo } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowRight, Users } from "lucide-react";
import { useProject, useUpdateProject } from "@/lib/api/hooks";
import { accent, ACCENTS } from "@/lib/colors";
import { initials } from "@/lib/tasks";
import type { Stakeholder } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ModuleHeader, EmptyState } from "@/components/project/ui";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/* The org chart is a view of the stakeholder list, not a second place to
 * keep people. It stores only reporting lines — a map of stakeholder id to
 * their manager's id — so a name can never exist here without existing on
 * the Stakeholders page, and editing someone there updates this in place.
 *
 * Anyone the chart references who is no longer a stakeholder is dropped on
 * read, so deleting a stakeholder cannot leave a ghost in the hierarchy. */

/** Stored shape: { [stakeholderId]: managerStakeholderId | null }. */
type ReportsTo = Record<string, string | null>;

interface OrgNode {
  person: Stakeholder;
  parent: string | null;
  depth: number;
}

/** Legacy org charts stored their own people as an array. Those entries have
 *  no stakeholder behind them, so they are ignored rather than migrated —
 *  the stakeholder list is the only source of people now. */
function readReportsTo(raw: unknown): ReportsTo {
  if (!raw || Array.isArray(raw)) return {};
  return raw as ReportsTo;
}

/** Walks up the manager chain to find a node's depth, guarding against a
 *  cycle that a sequence of edits could otherwise create. */
function depthOf(id: string, parents: ReportsTo, valid: Set<string>): number {
  let d = 0;
  let cur = parents[id] ?? null;
  const seen = new Set<string>([id]);
  while (cur && valid.has(cur) && !seen.has(cur)) {
    seen.add(cur);
    cur = parents[cur] ?? null;
    d++;
    if (d > 20) break;
  }
  return d;
}

/** Depth-first so reports render beneath their manager. */
function ordered(people: Stakeholder[], parents: ReportsTo, valid: Set<string>): OrgNode[] {
  const byParent = new Map<string | null, Stakeholder[]>();
  for (const p of people) {
    // A manager who is no longer a stakeholder is treated as no manager.
    const raw = parents[p.id] ?? null;
    const key = raw && valid.has(raw) && raw !== p.id ? raw : null;
    const arr = byParent.get(key) ?? [];
    arr.push(p);
    byParent.set(key, arr);
  }

  const out: OrgNode[] = [];
  const placed = new Set<string>();
  const visit = (parent: string | null, depth: number) => {
    for (const p of byParent.get(parent) ?? []) {
      if (placed.has(p.id)) continue; // cycle guard
      placed.add(p.id);
      out.push({ person: p, parent, depth });
      visit(p.id, depth + 1);
    }
  };
  visit(null, 0);

  // Anyone stranded by a cycle still has to appear.
  for (const p of people) {
    if (!placed.has(p.id)) {
      out.push({ person: p, parent: null, depth: depthOf(p.id, parents, valid) });
    }
  }
  return out;
}

export function OrgModule({ projectId }: { projectId: string }) {
  const { data } = useProject(projectId);
  const update = useUpdateProject(projectId);

  const people = useMemo(() => data?.stakeholders ?? [], [data]);
  const parents = useMemo(() => readReportsTo(data?.project.orgChart), [data]);
  const validIds = useMemo(() => new Set(people.map((p) => p.id)), [people]);
  const nodes = useMemo(
    () => ordered(people, parents, validIds),
    [people, parents, validIds],
  );

  if (!data) return null;

  function setManager(id: string, managerId: string | null) {
    // Drop entries for people who no longer exist while we're writing, so
    // the stored map cannot accumulate ghosts.
    const next: ReportsTo = {};
    for (const [k, v] of Object.entries({ ...parents, [id]: managerId })) {
      if (validIds.has(k) && (v === null || validIds.has(v))) next[k] = v;
    }
    update.mutate({ orgChart: next }, { onError: (e) => toast.error((e as Error).message) });
  }

  /** Everyone this person manages, directly or further down — they cannot be
   *  assigned as their own manager's manager. */
  function descendantsOf(id: string): Set<string> {
    const out = new Set<string>();
    const walk = (parentId: string) => {
      for (const p of people) {
        if (out.has(p.id)) continue;
        const m = parents[p.id] ?? null;
        if (m === parentId) {
          out.add(p.id);
          walk(p.id);
        }
      }
    };
    walk(id);
    return out;
  }

  return (
    <div>
      <ModuleHeader
        title="Org chart"
        description="Reporting lines across the stakeholders on this project."
        actions={
          <Button variant="outline" asChild>
            <Link href={`/projects/${projectId}/stakeholders`}>
              <Users className="size-4" /> Manage stakeholders
            </Link>
          </Button>
        }
      />

      {people.length === 0 ? (
        <EmptyState
          title="No stakeholders yet"
          body="The org chart shows the people on the Stakeholders page. Add someone there and they'll appear here to be placed in the hierarchy."
          action={
            <Button asChild>
              <Link href={`/projects/${projectId}/stakeholders`}>
                Go to stakeholders <ArrowRight className="size-4" />
              </Link>
            </Button>
          }
        />
      ) : (
        <>
          <div className="space-y-2">
            {nodes.map(({ person, parent, depth }, i) => {
              const blocked = descendantsOf(person.id);
              const tone = ACCENTS[i % ACCENTS.length];
              return (
                <div
                  key={person.id}
                  className="flex items-center gap-3 rounded-[var(--radius-md)] border bg-[var(--panel)] p-2.5"
                  style={{ marginLeft: depth * 24 }}
                >
                  <span
                    className={cn(
                      "flex size-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                      accent(tone).dot,
                    )}
                    style={{ color: "var(--on-accent)" }}
                  >
                    {initials(person.name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-semibold">{person.name}</span>
                    {(person.title || person.role) && (
                      <span className="text-muted-foreground block truncate text-[11.5px]">
                        {[person.title, person.role].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </span>
                  <Select
                    value={parent ?? "none"}
                    onValueChange={(v) => setManager(person.id, v === "none" ? null : v)}
                  >
                    <SelectTrigger className="h-8 w-52 shrink-0">
                      <SelectValue placeholder="Reports to" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— top level —</SelectItem>
                      {people
                        // Neither themselves nor anyone beneath them, or the
                        // hierarchy would fold into a loop.
                        .filter((o) => o.id !== person.id && !blocked.has(o.id))
                        .map((o) => (
                          <SelectItem key={o.id} value={o.id}>
                            {o.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              );
            })}
          </div>

          <p className="text-muted-foreground mt-4 text-[12px] leading-relaxed">
            People come from the{" "}
            <Link
              href={`/projects/${projectId}/stakeholders`}
              className="font-semibold underline underline-offset-2"
            >
              Stakeholders
            </Link>{" "}
            page — add, rename or remove them there and this chart follows.
          </p>
        </>
      )}
    </div>
  );
}
