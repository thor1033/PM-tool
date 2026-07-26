"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Mail } from "lucide-react";
import {
  useProject,
  useCreateEntity,
  useUpdateEntity,
  useDeleteEntity,
} from "@/lib/api/hooks";
import type { Stakeholder } from "@/lib/types";
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

const ROLES = [
  "Executive Sponsor",
  "Project Owner",
  "Advisor",
  "Key User",
  "Gatekeeper",
  "Contributor",
];

const LEVEL: Record<string, string> = {
  high: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  med: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  low: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
};

function StakeholderDialog({
  projectId,
  item,
  open,
  onOpenChange,
}: {
  projectId: string;
  item: Stakeholder | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const create = useCreateEntity(projectId, "stakeholders");
  const update = useUpdateEntity(projectId, "stakeholders");
  const [f, setF] = useState(() => ({
    name: item?.name ?? "",
    title: item?.title ?? "",
    role: item?.role ?? "Contributor",
    responsibility: item?.responsibility ?? "",
    influence: item?.influence ?? "med",
    interest: item?.interest ?? "med",
    contact: item?.contact ?? "",
  }));
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  async function save() {
    const payload = { ...f, name: f.name.trim() || "Unnamed" };
    const onError = (e: unknown) => toast.error((e as Error).message);
    if (item) update.mutate({ id: item.id, data: payload }, { onError });
    else create.mutate(payload, { onError });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{item ? "Edit stakeholder" : "New stakeholder"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={f.name} onChange={(e) => set("name", e.target.value)} autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input value={f.title} onChange={(e) => set("title", e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select value={f.role} onValueChange={(v) => set("role", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Influence</Label>
              <Select value={f.influence} onValueChange={(v) => set("influence", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="med">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Interest</Label>
              <Select value={f.interest} onValueChange={(v) => set("interest", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="med">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Responsibility</Label>
            <Textarea
              value={f.responsibility}
              onChange={(e) => set("responsibility", e.target.value)}
              rows={2}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Contact</Label>
            <Input
              value={f.contact}
              onChange={(e) => set("contact", e.target.value)}
              placeholder="email@company.example"
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={create.isPending || update.isPending}>
            {item ? "Save changes" : "Add stakeholder"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function StakeholdersModule({ projectId }: { projectId: string }) {
  const { data } = useProject(projectId);
  const del = useDeleteEntity(projectId, "stakeholders");
  const [dialog, setDialog] = useState<{ open: boolean; item: Stakeholder | null }>(
    { open: false, item: null },
  );
  if (!data) return null;
  const items = data.stakeholders;

  return (
    <div>
      <ModuleHeader
        title="Stakeholders"
        description="Who matters, and how much they influence or care."
        actions={
          <Button onClick={() => setDialog({ open: true, item: null })}>
            <Plus className="size-4" /> Add stakeholder
          </Button>
        }
      />

      {items.length === 0 ? (
        <EmptyState
          title="No stakeholders yet"
          body="Map the people who can make or break the engagement."
          action={
            <Button onClick={() => setDialog({ open: true, item: null })}>
              <Plus className="size-4" /> Add stakeholder
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {items.map((s) => (
            <div key={s.id} className="group rounded-xl border p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-medium">{s.name}</div>
                  <div className="text-muted-foreground text-xs">
                    {s.title}
                    {s.title && s.role ? " · " : ""}
                    {s.role}
                  </div>
                </div>
                <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    onClick={() => setDialog({ open: true, item: s })}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    onClick={() => {
                      if (confirm(`Delete "${s.name}"?`))
                        del.mutate(s.id, {
                          onError: (e) => toast.error((e as Error).message),
                        });
                    }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge className={cn("border-0", LEVEL[s.influence])}>
                  Influence: {s.influence}
                </Badge>
                <Badge className={cn("border-0", LEVEL[s.interest])}>
                  Interest: {s.interest}
                </Badge>
              </div>
              {s.responsibility && (
                <p className="text-muted-foreground mt-2 text-sm">
                  {s.responsibility}
                </p>
              )}
              {s.contact && (
                <a
                  href={`mailto:${s.contact}`}
                  className="text-primary mt-2 inline-flex items-center gap-1 text-xs"
                >
                  <Mail className="size-3" /> {s.contact}
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      {dialog.open && (
        <StakeholderDialog
          projectId={projectId}
          item={dialog.item}
          open={dialog.open}
          onOpenChange={(v) => setDialog((d) => ({ ...d, open: v }))}
        />
      )}
    </div>
  );
}
