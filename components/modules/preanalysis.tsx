"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Pencil } from "lucide-react";
import {
  useProject,
  useUpdateProject,
  useCreateEntity,
  useUpdateEntity,
  useDeleteEntity,
} from "@/lib/api/hooks";
import type { Finding } from "@/lib/types";
import { ModuleHeader, SectionCard } from "@/components/project/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Assessment {
  id: string;
  area: string;
  asIs: string;
  toBe: string;
}

function FindingDialog({
  projectId,
  item,
  open,
  onOpenChange,
}: {
  projectId: string;
  item: Finding | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const create = useCreateEntity(projectId, "findings");
  const update = useUpdateEntity(projectId, "findings");
  const [f, setF] = useState(() => ({
    title: item?.title ?? "",
    category: item?.category ?? "",
    summary: item?.summary ?? "",
    source: item?.source ?? "",
  }));
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));
  async function save() {
    const onError = (e: unknown) => toast.error((e as Error).message);
    if (item) update.mutate({ id: item.id, data: f }, { onError });
    else create.mutate(f, { onError });
    onOpenChange(false);
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{item ? "Edit finding" : "New finding"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Finding</Label>
            <Input value={f.title} onChange={(e) => set("title", e.target.value)} autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label>Summary</Label>
            <Textarea value={f.summary} onChange={(e) => set("summary", e.target.value)} rows={3} />
          </div>
          <div className="space-y-1.5">
            <Label>Source</Label>
            <Input value={f.source} onChange={(e) => set("source", e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={create.isPending || update.isPending}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PreAnalysisModule({ projectId }: { projectId: string }) {
  const { data } = useProject(projectId);
  const update = useUpdateProject(projectId);
  const delFinding = useDeleteEntity(projectId, "findings");
  const [dialog, setDialog] = useState<{ open: boolean; item: Finding | null }>({
    open: false,
    item: null,
  });
  if (!data) return null;
  const findings = data.findings;
  const assessment = (data.project.assessment as Assessment[]) ?? [];

  function commitAssessment(next: Assessment[]) {
    update.mutate(
      { assessment: next },
      { onError: (e) => toast.error((e as Error).message) },
    );
  }

  return (
    <div>
      <ModuleHeader
        title="Pre-analysis"
        description="Findings from discovery and the as-is / to-be picture."
        actions={
          <Button onClick={() => setDialog({ open: true, item: null })}>
            <Plus className="size-4" /> Add finding
          </Button>
        }
      />

      <div className="space-y-6">
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Findings</h3>
          {findings.length === 0 ? (
            <p className="text-muted-foreground text-sm">No findings yet.</p>
          ) : (
            findings.map((f) => (
              <div key={f.id} className="group rounded-xl border p-4">
                <div className="flex items-start justify-between">
                  <h4 className="font-medium">{f.title}</h4>
                  <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      onClick={() => setDialog({ open: true, item: f })}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      onClick={() => delFinding.mutate(f.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
                {f.summary && (
                  <p className="text-muted-foreground mt-1 text-sm">{f.summary}</p>
                )}
                {f.source && (
                  <p className="text-muted-foreground mt-2 text-xs italic">
                    Source: {f.source}
                  </p>
                )}
              </div>
            ))
          )}
        </div>

        <SectionCard title="As-is / to-be">
          <div className="space-y-2">
            <div className="text-muted-foreground grid grid-cols-[1fr_1fr_1fr_auto] gap-2 px-1 text-xs font-medium">
              <span>Area</span>
              <span>As-is</span>
              <span>To-be</span>
              <span />
            </div>
            {assessment.map((a) => (
              <div
                key={a.id}
                className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2"
              >
                <Input
                  defaultValue={a.area}
                  onBlur={(e) =>
                    e.target.value !== a.area &&
                    commitAssessment(
                      assessment.map((x) =>
                        x.id === a.id ? { ...x, area: e.target.value } : x,
                      ),
                    )
                  }
                />
                <Input
                  defaultValue={a.asIs}
                  onBlur={(e) =>
                    e.target.value !== a.asIs &&
                    commitAssessment(
                      assessment.map((x) =>
                        x.id === a.id ? { ...x, asIs: e.target.value } : x,
                      ),
                    )
                  }
                />
                <Input
                  defaultValue={a.toBe}
                  onBlur={(e) =>
                    e.target.value !== a.toBe &&
                    commitAssessment(
                      assessment.map((x) =>
                        x.id === a.id ? { ...x, toBe: e.target.value } : x,
                      ),
                    )
                  }
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    commitAssessment(assessment.filter((x) => x.id !== a.id))
                  }
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                commitAssessment([
                  ...assessment,
                  {
                    id: `as_${Math.random().toString(36).slice(2, 8)}`,
                    area: "",
                    asIs: "",
                    toBe: "",
                  },
                ])
              }
            >
              <Plus className="size-4" /> Add row
            </Button>
          </div>
        </SectionCard>
      </div>

      {dialog.open && (
        <FindingDialog
          projectId={projectId}
          item={dialog.item}
          open={dialog.open}
          onOpenChange={(v) => setDialog((d) => ({ ...d, open: v }))}
        />
      )}
    </div>
  );
}
