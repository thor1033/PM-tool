"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, ExternalLink, FileText } from "lucide-react";
import {
  useProject,
  useCreateEntity,
  useUpdateEntity,
  useDeleteEntity,
} from "@/lib/api/hooks";
import type { Product } from "@/lib/types";
import { accent } from "@/lib/colors";
import { cn } from "@/lib/utils";
import { ModuleHeader, EmptyState } from "@/components/project/ui";
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

const TYPES = ["pdf", "excel", "image", "doc", "link", "other"];

function ProductDialog({
  projectId,
  phases,
  item,
  open,
  onOpenChange,
}: {
  projectId: string;
  phases: { id: string; label: string }[];
  item: Product | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const create = useCreateEntity(projectId, "products");
  const update = useUpdateEntity(projectId, "products");
  const [f, setF] = useState(() => ({
    name: item?.name ?? "",
    type: item?.type ?? "pdf",
    url: item?.url ?? "",
    date: item?.date ?? "",
    note: item?.note ?? "",
    phase: item?.phase ?? "none",
  }));
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  async function save() {
    const payload = {
      name: f.name.trim() || "Untitled deliverable",
      type: f.type,
      url: f.url.trim(),
      date: f.date,
      note: f.note,
      phase: f.phase === "none" ? null : f.phase,
      placeholder: !f.url.trim(),
    };
    const onError = (e: unknown) => toast.error((e as Error).message);
    if (item) update.mutate({ id: item.id, data: payload }, { onError });
    else create.mutate(payload, { onError });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{item ? "Edit deliverable" : "New deliverable"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={f.name} onChange={(e) => set("name", e.target.value)} autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={f.type} onValueChange={(v) => set("type", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Phase</Label>
              <Select value={f.phase} onValueChange={(v) => set("phase", v)}>
                <SelectTrigger><SelectValue placeholder="No phase" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No phase</SelectItem>
                  {phases.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Link (SharePoint / Drive URL)</Label>
            <Input
              value={f.url}
              onChange={(e) => set("url", e.target.value)}
              placeholder="https://…"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={f.date} onChange={(e) => set("date", e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Note</Label>
            <Textarea value={f.note} onChange={(e) => set("note", e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={create.isPending || update.isPending}>
            {item ? "Save changes" : "Add deliverable"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CatalogueModule({ projectId }: { projectId: string }) {
  const { data } = useProject(projectId);
  const del = useDeleteEntity(projectId, "products");
  const [dialog, setDialog] = useState<{ open: boolean; item: Product | null }>({
    open: false,
    item: null,
  });
  if (!data) return null;
  const items = data.products;
  const phaseMap = new Map(data.phases.map((p) => [p.id, p]));

  return (
    <div>
      <ModuleHeader
        title="Product catalogue"
        description="Deliverables and artefacts — link to where the files actually live."
        actions={
          <Button onClick={() => setDialog({ open: true, item: null })}>
            <Plus className="size-4" /> Add deliverable
          </Button>
        }
      />
      {items.length === 0 ? (
        <EmptyState
          title="No deliverables yet"
          body="Track outputs and link to the shared drive where they live."
          action={
            <Button onClick={() => setDialog({ open: true, item: null })}>
              <Plus className="size-4" /> Add deliverable
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {items.map((p) => {
            const phase = p.phase ? phaseMap.get(p.phase) : null;
            return (
              <div key={p.id} className="group rounded-xl border p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-2">
                    <FileText className="text-muted-foreground mt-0.5 size-4" />
                    <div>
                      <div className="font-medium">{p.name}</div>
                      <div className="text-muted-foreground text-xs uppercase">
                        {p.type}
                        {p.date ? ` · ${p.date}` : ""}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      onClick={() => setDialog({ open: true, item: p })}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      onClick={() => {
                        if (confirm(`Delete "${p.name}"?`))
                          del.mutate(p.id, {
                            onError: (e) => toast.error((e as Error).message),
                          });
                      }}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
                {p.note && (
                  <p className="text-muted-foreground mt-2 text-sm">{p.note}</p>
                )}
                <div className="mt-2 flex items-center gap-2">
                  {phase && (
                    <Badge className={cn("border-0", accent(phase.color).soft)}>
                      {phase.label}
                    </Badge>
                  )}
                  {p.placeholder && !p.url && (
                    <Badge variant="outline" className="text-muted-foreground">
                      placeholder
                    </Badge>
                  )}
                  {p.url && (
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary inline-flex items-center gap-1 text-xs"
                    >
                      <ExternalLink className="size-3" /> Open
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {dialog.open && (
        <ProductDialog
          projectId={projectId}
          phases={data.phases}
          item={dialog.item}
          open={dialog.open}
          onOpenChange={(v) => setDialog((d) => ({ ...d, open: v }))}
        />
      )}
    </div>
  );
}
