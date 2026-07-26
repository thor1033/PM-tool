"use client";

import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { useProject, useUpdateProject } from "@/lib/api/hooks";
import { accent } from "@/lib/colors";
import { cn } from "@/lib/utils";
import { ModuleHeader, SectionCard, EmptyState } from "@/components/project/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

interface Comm {
  id: string;
  audience: string;
  purpose: string;
  messages: string[];
  channels: string[];
  timing: string;
  owner: string;
  deliverables: string[];
}
interface ChangeRow {
  id: string;
  component: string;
  description: string;
  deliverables: string[];
  owner: string;
}
interface ChangeGroup {
  id: string;
  label: string;
  accent: string;
  rows: ChangeRow[];
}

const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 8)}`;
const toLines = (a: string[]) => (a ?? []).join("\n");
const fromLines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);

function CommsTab({ projectId }: { projectId: string }) {
  const { data } = useProject(projectId);
  const update = useUpdateProject(projectId);
  const comms = (data?.project.commPlan as Comm[]) ?? [];

  function commit(next: Comm[]) {
    update.mutate(
      { commPlan: next },
      { onError: (e) => toast.error((e as Error).message) },
    );
  }
  function patch(id: string, changes: Partial<Comm>) {
    commit(comms.map((c) => (c.id === id ? { ...c, ...changes } : c)));
  }
  function add() {
    commit([
      ...comms,
      {
        id: uid("cm"),
        audience: "",
        purpose: "",
        messages: [],
        channels: [],
        timing: "",
        owner: "",
        deliverables: [],
      },
    ]);
  }

  if (comms.length === 0)
    return (
      <EmptyState
        title="No communications planned"
        body="Plan who hears what, through which channel and when."
        action={
          <Button onClick={add}>
            <Plus className="size-4" /> Add audience
          </Button>
        }
      />
    );

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={add} size="sm">
          <Plus className="size-4" /> Add audience
        </Button>
      </div>
      {comms.map((c) => (
        <SectionCard key={c.id}>
          <div className="flex items-start justify-between gap-2">
            <Input
              defaultValue={c.audience}
              placeholder="Audience"
              className="h-8 max-w-sm font-medium"
              onBlur={(e) =>
                e.target.value !== c.audience && patch(c.id, { audience: e.target.value })
              }
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => commit(comms.filter((x) => x.id !== c.id))}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Purpose</Label>
              <Textarea
                defaultValue={c.purpose}
                rows={2}
                onBlur={(e) => patch(c.id, { purpose: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Timing</Label>
                <Input
                  defaultValue={c.timing}
                  onBlur={(e) => patch(c.id, { timing: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Owner</Label>
                <Input
                  defaultValue={c.owner}
                  onBlur={(e) => patch(c.id, { owner: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Key messages (one per line)</Label>
              <Textarea
                defaultValue={toLines(c.messages)}
                rows={3}
                onBlur={(e) => patch(c.id, { messages: fromLines(e.target.value) })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Channels (one per line)</Label>
              <Textarea
                defaultValue={toLines(c.channels)}
                rows={3}
                onBlur={(e) => patch(c.id, { channels: fromLines(e.target.value) })}
              />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>Deliverables (one per line)</Label>
              <Textarea
                defaultValue={toLines(c.deliverables)}
                rows={2}
                onBlur={(e) =>
                  patch(c.id, { deliverables: fromLines(e.target.value) })
                }
              />
            </div>
          </div>
        </SectionCard>
      ))}
    </div>
  );
}

function ChangeTab({ projectId }: { projectId: string }) {
  const { data } = useProject(projectId);
  const update = useUpdateProject(projectId);
  const groups =
    ((data?.project.changePlan as { groups?: ChangeGroup[] })?.groups) ?? [];

  function commit(next: ChangeGroup[]) {
    update.mutate(
      { changePlan: { groups: next } },
      { onError: (e) => toast.error((e as Error).message) },
    );
  }
  function patchGroup(id: string, changes: Partial<ChangeGroup>) {
    commit(groups.map((g) => (g.id === id ? { ...g, ...changes } : g)));
  }
  function patchRow(gid: string, rid: string, changes: Partial<ChangeRow>) {
    commit(
      groups.map((g) =>
        g.id === gid
          ? {
              ...g,
              rows: g.rows.map((r) => (r.id === rid ? { ...r, ...changes } : r)),
            }
          : g,
      ),
    );
  }

  if (groups.length === 0)
    return (
      <EmptyState
        title="No change plan yet"
        body="Group the interventions that make the change stick."
        action={
          <Button
            onClick={() =>
              commit([{ id: uid("cg"), label: "New group", accent: "indigo", rows: [] }])
            }
          >
            <Plus className="size-4" /> Add group
          </Button>
        }
      />
    );

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          size="sm"
          onClick={() =>
            commit([
              ...groups,
              { id: uid("cg"), label: "New group", accent: "indigo", rows: [] },
            ])
          }
        >
          <Plus className="size-4" /> Add group
        </Button>
      </div>
      {groups.map((g) => (
        <SectionCard key={g.id}>
          <div className="flex items-center gap-2">
            <span className={cn("size-2.5 rounded-full", accent(g.accent).dot)} />
            <Input
              defaultValue={g.label}
              className="h-8 max-w-xs font-medium"
              onBlur={(e) =>
                e.target.value !== g.label && patchGroup(g.id, { label: e.target.value })
              }
            />
            <Button
              variant="ghost"
              size="icon"
              className="ml-auto"
              onClick={() => commit(groups.filter((x) => x.id !== g.id))}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
          <div className="mt-3 space-y-3">
            {g.rows.map((r) => (
              <div key={r.id} className="bg-muted/40 rounded-lg p-3">
                <div className="flex items-center gap-2">
                  <Input
                    defaultValue={r.component}
                    placeholder="Component"
                    className="h-8 font-medium"
                    onBlur={(e) => patchRow(g.id, r.id, { component: e.target.value })}
                  />
                  <Input
                    defaultValue={r.owner}
                    placeholder="Owner"
                    className="h-8 w-40"
                    onBlur={(e) => patchRow(g.id, r.id, { owner: e.target.value })}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    onClick={() =>
                      patchGroup(g.id, { rows: g.rows.filter((x) => x.id !== r.id) })
                    }
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
                <Textarea
                  defaultValue={r.description}
                  placeholder="Description"
                  rows={2}
                  className="mt-2"
                  onBlur={(e) => patchRow(g.id, r.id, { description: e.target.value })}
                />
                <Textarea
                  defaultValue={toLines(r.deliverables)}
                  placeholder="Deliverables (one per line)"
                  rows={2}
                  className="mt-2"
                  onBlur={(e) =>
                    patchRow(g.id, r.id, { deliverables: fromLines(e.target.value) })
                  }
                />
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                patchGroup(g.id, {
                  rows: [
                    ...g.rows,
                    { id: uid("cr"), component: "", description: "", deliverables: [], owner: "" },
                  ],
                })
              }
            >
              <Plus className="size-4" /> Add component
            </Button>
          </div>
        </SectionCard>
      ))}
    </div>
  );
}

export function PlansModule({ projectId }: { projectId: string }) {
  const { data } = useProject(projectId);
  if (!data) return null;
  return (
    <div>
      <ModuleHeader
        title="Comms & change"
        description="How you'll communicate the change and make it stick."
      />
      <Tabs defaultValue="comms">
        <TabsList>
          <TabsTrigger value="comms">Communication</TabsTrigger>
          <TabsTrigger value="change">Change plan</TabsTrigger>
        </TabsList>
        <TabsContent value="comms" className="mt-4">
          <CommsTab projectId={projectId} />
        </TabsContent>
        <TabsContent value="change" className="mt-4">
          <ChangeTab projectId={projectId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
