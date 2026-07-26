"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Save, Check, X } from "lucide-react";
import { useProject, useUpdateProject } from "@/lib/api/hooks";
import { ModuleHeader, SectionCard } from "@/components/project/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function ListEditor({
  items,
  onChange,
  tone,
}: {
  items: string[];
  onChange: (v: string[]) => void;
  tone: "in" | "out";
}) {
  const Icon = tone === "in" ? Check : X;
  const color = tone === "in" ? "text-green-600" : "text-red-500";
  return (
    <div className="space-y-2">
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-2">
          <Icon className={`size-4 shrink-0 ${color}`} />
          <Input
            value={it}
            onChange={(e) => {
              const next = [...items];
              next[i] = e.target.value;
              onChange(next);
            }}
          />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onChange(items.filter((_, j) => j !== i))}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={() => onChange([...items, ""])}>
        <Plus className="size-4" /> Add item
      </Button>
    </div>
  );
}

export function ScopeModule({ projectId }: { projectId: string }) {
  const { data } = useProject(projectId);
  if (!data) return null;
  const s = data.project.scope as { inScope?: string[]; outScope?: string[] };
  const initial = { inScope: s.inScope ?? [], outScope: s.outScope ?? [] };
  return <ScopeEditor key={projectId} projectId={projectId} initial={initial} />;
}

function ScopeEditor({
  projectId,
  initial,
}: {
  projectId: string;
  initial: { inScope: string[]; outScope: string[] };
}) {
  const update = useUpdateProject(projectId);
  const [scope, setScope] = useState(initial);
  const [dirty, setDirty] = useState(false);

  async function save() {
    try {
      await update.mutateAsync({ scope });
      toast.success("Scope saved");
      setDirty(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div>
      <ModuleHeader
        title="Scope"
        description="What's in, and — just as important — what's out."
        actions={
          <Button onClick={save} disabled={!dirty || update.isPending}>
            <Save className="size-4" /> {dirty ? "Save" : "Saved"}
          </Button>
        }
      />
      <div className="grid gap-4 md:grid-cols-2">
        <SectionCard title="In scope">
          <ListEditor
            items={scope.inScope}
            tone="in"
            onChange={(v) => {
              setScope((s) => (s ? { ...s, inScope: v } : s));
              setDirty(true);
            }}
          />
        </SectionCard>
        <SectionCard title="Out of scope">
          <ListEditor
            items={scope.outScope}
            tone="out"
            onChange={(v) => {
              setScope((s) => (s ? { ...s, outScope: v } : s));
              setDirty(true);
            }}
          />
        </SectionCard>
      </div>
    </div>
  );
}
