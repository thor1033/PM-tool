"use client";

import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { useProject, useUpdateProject } from "@/lib/api/hooks";
import { ModuleHeader, EmptyState } from "@/components/project/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";

interface Kpi {
  id: string;
  name: string;
  target: string;
  current: string;
  unit: string;
}

function pctOf(current: string, target: string): number | null {
  const c = parseFloat(current);
  const t = parseFloat(target);
  if (isNaN(c) || isNaN(t) || t === 0) return null;
  return Math.max(0, Math.min(100, Math.round((c / t) * 100)));
}

export function KpisModule({ projectId }: { projectId: string }) {
  const { data } = useProject(projectId);
  const update = useUpdateProject(projectId);
  if (!data) return null;
  const kpis = (data.project.kpis as Kpi[]) ?? [];

  function commit(next: Kpi[]) {
    update.mutate(
      { kpis: next },
      { onError: (e) => toast.error((e as Error).message) },
    );
  }
  function patch(id: string, changes: Partial<Kpi>) {
    commit(kpis.map((k) => (k.id === id ? { ...k, ...changes } : k)));
  }
  function add() {
    commit([
      ...kpis,
      {
        id: `kpi_${Math.random().toString(36).slice(2, 8)}`,
        name: "",
        target: "",
        current: "",
        unit: "",
      },
    ]);
  }

  return (
    <div>
      <ModuleHeader
        title="KPIs"
        description="Metrics and targets you'll track through delivery."
        actions={
          <Button onClick={add}>
            <Plus className="size-4" /> Add KPI
          </Button>
        }
      />
      {kpis.length === 0 ? (
        <EmptyState
          title="No KPIs yet"
          body="Define the measures that tell you the project is working."
          action={
            <Button onClick={add}>
              <Plus className="size-4" /> Add KPI
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {kpis.map((k) => {
            const pct = pctOf(k.current, k.target);
            return (
              <div key={k.id} className="group rounded-xl border p-4">
                <div className="flex items-center gap-2">
                  <Input
                    defaultValue={k.name}
                    placeholder="KPI name"
                    className="h-8 font-medium"
                    onBlur={(e) =>
                      e.target.value !== k.name && patch(k.id, { name: e.target.value })
                    }
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 opacity-0 group-hover:opacity-100"
                    onClick={() => commit(kpis.filter((x) => x.id !== k.id))}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <Input
                    defaultValue={k.current}
                    placeholder="Current"
                    className="h-8"
                    onBlur={(e) => patch(k.id, { current: e.target.value })}
                  />
                  <Input
                    defaultValue={k.target}
                    placeholder="Target"
                    className="h-8"
                    onBlur={(e) => patch(k.id, { target: e.target.value })}
                  />
                  <Input
                    defaultValue={k.unit}
                    placeholder="Unit"
                    className="h-8"
                    onBlur={(e) => patch(k.id, { unit: e.target.value })}
                  />
                </div>
                {pct !== null && (
                  <div className="mt-3">
                    <Progress value={pct} className="h-1.5" />
                    <div className="text-muted-foreground mt-1 text-right text-xs">
                      {pct}% of target
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
