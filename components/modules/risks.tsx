"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import {
  useProject,
  useCreateEntity,
  useUpdateEntity,
  useDeleteEntity,
} from "@/lib/api/hooks";
import type { Risk } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ModuleHeader, EmptyState } from "@/components/project/ui";
import { GlossaryText } from "@/components/project/glossary-text";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const LEVEL: Record<string, string> = {
  high: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  med: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  low: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
};
const STATUS: Record<string, string> = {
  open: "bg-red-500",
  monitoring: "bg-amber-500",
  closed: "bg-green-500",
};

function RiskDialog({
  projectId,
  risk,
  open,
  onOpenChange,
}: {
  projectId: string;
  risk: Risk | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const create = useCreateEntity(projectId, "risks");
  const update = useUpdateEntity(projectId, "risks");
  const [f, setF] = useState(() => ({
    title: risk?.title ?? "",
    likelihood: risk?.likelihood ?? "med",
    impact: risk?.impact ?? "med",
    mitigation: risk?.mitigation ?? "",
    owner: risk?.owner ?? "",
    status: risk?.status ?? "open",
  }));
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  async function save() {
    const payload = { ...f, title: f.title.trim() || "Untitled risk" };
    const onError = (e: unknown) => toast.error((e as Error).message);
    if (risk) update.mutate({ id: risk.id, data: payload }, { onError });
    else create.mutate(payload, { onError });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{risk ? "Edit risk" : "New risk"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Risk</Label>
            <Input value={f.title} onChange={(e) => set("title", e.target.value)} autoFocus />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Likelihood</Label>
              <Select value={f.likelihood} onValueChange={(v) => set("likelihood", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="med">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Impact</Label>
              <Select value={f.impact} onValueChange={(v) => set("impact", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="med">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={f.status} onValueChange={(v) => set("status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="monitoring">Monitoring</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Mitigation</Label>
            <Textarea
              value={f.mitigation}
              onChange={(e) => set("mitigation", e.target.value)}
              rows={3}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Owner</Label>
            <Input value={f.owner} onChange={(e) => set("owner", e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={create.isPending || update.isPending}>
            {risk ? "Save changes" : "Add risk"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RisksModule({ projectId }: { projectId: string }) {
  const { data } = useProject(projectId);
  const del = useDeleteEntity(projectId, "risks");
  const [dialog, setDialog] = useState<{ open: boolean; risk: Risk | null }>({
    open: false,
    risk: null,
  });
  if (!data) return null;
  const risks = data.risks;
  const glossary = (data.project.glossary as { id: string; term: string; definition: string }[]) ?? [];

  return (
    <div>
      <ModuleHeader
        title="Risks"
        description="Risk register — likelihood, impact and mitigation."
        actions={
          <Button onClick={() => setDialog({ open: true, risk: null })}>
            <Plus className="size-4" /> Add risk
          </Button>
        }
      />

      {risks.length === 0 ? (
        <EmptyState
          title="No risks logged"
          body="Capture what could go wrong and how you'll respond."
          action={
            <Button onClick={() => setDialog({ open: true, risk: null })}>
              <Plus className="size-4" /> Add risk
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {risks.map((r) => (
            <div key={r.id} className="group rounded-xl border p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "size-2 rounded-full",
                      STATUS[r.status] ?? "bg-slate-400",
                    )}
                    title={r.status}
                  />
                  <h3 className="font-medium">{r.title}</h3>
                </div>
                <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    onClick={() => setDialog({ open: true, risk: r })}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    onClick={() => {
                      if (confirm(`Delete "${r.title}"?`))
                        del.mutate(r.id, {
                          onError: (e) => toast.error((e as Error).message),
                        });
                    }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge className={cn("border-0", LEVEL[r.likelihood])}>
                  Likelihood: {r.likelihood}
                </Badge>
                <Badge className={cn("border-0", LEVEL[r.impact])}>
                  Impact: {r.impact}
                </Badge>
                {r.owner && (
                  <span className="text-muted-foreground text-xs">
                    Owner: {r.owner}
                  </span>
                )}
              </div>
              {r.mitigation && (
                <p className="text-muted-foreground mt-2 text-sm">
                  <GlossaryText text={r.mitigation} terms={glossary} />
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {dialog.open && (
        <RiskDialog
          projectId={projectId}
          risk={dialog.risk}
          open={dialog.open}
          onOpenChange={(v) => setDialog((d) => ({ ...d, open: v }))}
        />
      )}
    </div>
  );
}
