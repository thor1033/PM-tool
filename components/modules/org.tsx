"use client";

import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { useProject, useUpdateProject } from "@/lib/api/hooks";
import { ACCENTS, accent } from "@/lib/colors";
import { cn } from "@/lib/utils";
import { ModuleHeader, EmptyState } from "@/components/project/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface OrgNode {
  id: string;
  name: string;
  role: string;
  parent: string | null;
  note: string;
  accent: string;
}

function depthOf(node: OrgNode, byId: Map<string, OrgNode>): number {
  let d = 0;
  let cur: OrgNode | undefined = node;
  const seen = new Set<string>();
  while (cur?.parent && !seen.has(cur.id)) {
    seen.add(cur.id);
    cur = byId.get(cur.parent);
    d++;
    if (d > 20) break;
  }
  return d;
}

/** Depth-first ordering so children render under their manager. */
function ordered(nodes: OrgNode[]): OrgNode[] {
  const byParent = new Map<string | null, OrgNode[]>();
  for (const n of nodes) {
    const key = n.parent ?? null;
    const arr = byParent.get(key) ?? [];
    arr.push(n);
    byParent.set(key, arr);
  }
  const out: OrgNode[] = [];
  const visit = (parent: string | null) => {
    for (const n of byParent.get(parent) ?? []) {
      out.push(n);
      visit(n.id);
    }
  };
  visit(null);
  // include orphans not reached from root
  for (const n of nodes) if (!out.includes(n)) out.push(n);
  return out;
}

export function OrgModule({ projectId }: { projectId: string }) {
  const { data } = useProject(projectId);
  const update = useUpdateProject(projectId);
  if (!data) return null;
  const nodes = (data.project.orgChart as OrgNode[]) ?? [];
  const byId = new Map(nodes.map((n) => [n.id, n]));

  function commit(next: OrgNode[]) {
    update.mutate(
      { orgChart: next },
      { onError: (e) => toast.error((e as Error).message) },
    );
  }
  function patch(id: string, changes: Partial<OrgNode>) {
    commit(nodes.map((n) => (n.id === id ? { ...n, ...changes } : n)));
  }
  function add() {
    commit([
      ...nodes,
      {
        id: `o_${Math.random().toString(36).slice(2, 8)}`,
        name: "New person",
        role: "",
        parent: nodes[0]?.id ?? null,
        note: "",
        accent: ACCENTS[nodes.length % ACCENTS.length],
      },
    ]);
  }
  function remove(id: string) {
    // reparent children to the removed node's parent
    const parent = byId.get(id)?.parent ?? null;
    commit(
      nodes
        .filter((n) => n.id !== id)
        .map((n) => (n.parent === id ? { ...n, parent } : n)),
    );
  }

  return (
    <div>
      <ModuleHeader
        title="Org chart"
        description="Team structure and reporting lines."
        actions={
          <Button onClick={add}>
            <Plus className="size-4" /> Add person
          </Button>
        }
      />
      {nodes.length === 0 ? (
        <EmptyState
          title="No org chart yet"
          body="Map who's accountable and who reports to whom."
          action={
            <Button onClick={add}>
              <Plus className="size-4" /> Add person
            </Button>
          }
        />
      ) : (
        <div className="space-y-2">
          {ordered(nodes).map((n) => {
            const d = depthOf(n, byId);
            return (
              <div
                key={n.id}
                className="group flex items-center gap-2 rounded-lg border p-2"
                style={{ marginLeft: d * 20 }}
              >
                <span className={cn("size-2.5 shrink-0 rounded-full", accent(n.accent).dot)} />
                <Input
                  defaultValue={n.name}
                  className="h-8 w-40 font-medium"
                  onBlur={(e) =>
                    e.target.value !== n.name && patch(n.id, { name: e.target.value })
                  }
                />
                <Input
                  defaultValue={n.role}
                  placeholder="Role"
                  className="h-8 w-40"
                  onBlur={(e) =>
                    e.target.value !== n.role && patch(n.id, { role: e.target.value })
                  }
                />
                <Select
                  value={n.parent ?? "none"}
                  onValueChange={(v) =>
                    patch(n.id, { parent: v === "none" ? null : v })
                  }
                >
                  <SelectTrigger className="h-8 w-44">
                    <SelectValue placeholder="Reports to" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— top level —</SelectItem>
                    {nodes
                      .filter((o) => o.id !== n.id)
                      .map((o) => (
                        <SelectItem key={o.id} value={o.id}>
                          {o.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  size="icon"
                  className="ml-auto size-8 opacity-0 group-hover:opacity-100"
                  onClick={() => remove(n.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
