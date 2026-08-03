"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Plus, Trash2, ExternalLink, Link2, Upload, X, FileText, FileSpreadsheet,
  Presentation, Image as ImageIcon, File as FileIcon,
} from "lucide-react";
import {
  useProject,
  useCreateEntity,
  useUpdateEntity,
  useDeleteEntity,
} from "@/lib/api/hooks";
import type { Product, Task } from "@/lib/types";
import { accent } from "@/lib/colors";
import { cn } from "@/lib/utils";
import { ModuleHeader, EmptyState } from "@/components/project/ui";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ── file type system ─────────────────────────────────────────────────────────

const FILE_TYPES = ["doc", "pdf", "excel", "image", "slides"] as const;
type FileType = (typeof FILE_TYPES)[number];

const TYPE_META: Record<FileType, { label: string; color: string; icon: typeof FileText }> = {
  image: { label: "Image", color: "pink", icon: ImageIcon },
  pdf: { label: "PDF", color: "red", icon: FileText },
  excel: { label: "Excel", color: "green", icon: FileSpreadsheet },
  slides: { label: "Slides", color: "amber", icon: Presentation },
  doc: { label: "Doc", color: "blue", icon: FileIcon },
};

function typeMeta(type: string) {
  return TYPE_META[type as FileType] ?? TYPE_META.doc;
}

/** Best-effort type inference from a URL's extension — used when a link is
 *  dropped/pasted so the picker can default to something sensible. */
function inferType(url: string): FileType {
  const ext = url.split(/[?#]/)[0].split(".").pop()?.toLowerCase() ?? "";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)) return "image";
  if (ext === "pdf") return "pdf";
  if (["xls", "xlsx", "csv"].includes(ext)) return "excel";
  if (["ppt", "pptx", "key"].includes(ext)) return "slides";
  return "doc";
}

// ── product dialog (add / edit) ─────────────────────────────────────────────

function ProductDialog({
  projectId,
  phases,
  tasks,
  item,
  open,
  onOpenChange,
}: {
  projectId: string;
  phases: { id: string; label: string }[];
  tasks: Task[];
  item: Product | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const create = useCreateEntity(projectId, "products");
  const update = useUpdateEntity(projectId, "products");
  const updateTask = useUpdateEntity(projectId, "tasks");
  const del = useDeleteEntity(projectId, "products");
  const [f, setF] = useState(() => ({
    name: item?.name ?? "",
    type: item?.type ?? "doc",
    url: item?.url ?? "",
    date: item?.date ?? "",
    note: item?.note ?? "",
    phase: item?.phase ?? "none",
  }));
  const [linkOpen, setLinkOpen] = useState(false);
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

  function remove() {
    if (!item) return;
    if (!confirm(`Delete "${item.name}"?`)) return;
    del.mutate(item.id, { onError: (e) => toast.error((e as Error).message) });
    onOpenChange(false);
  }

  // linked-actions picker — bidirectional with task.deps type:"deliverable"
  const linkedTasks = item ? tasks.filter((t) => (item.taskIds ?? []).includes(t.id)) : [];
  const unlinkedTasks = item ? tasks.filter((t) => !(item.taskIds ?? []).includes(t.id)) : [];

  function linkTask(taskId: string) {
    if (!item) return;
    update.mutate({ id: item.id, data: { taskIds: [...(item.taskIds ?? []), taskId] } });
    const task = tasks.find((t) => t.id === taskId);
    if (task && !(task.deps ?? []).some((d) => d.type === "deliverable" && d.refId === item.id)) {
      updateTask.mutate({
        id: taskId,
        data: { deps: [...(task.deps ?? []), { id: `d_${Math.random().toString(36).slice(2, 9)}`, type: "deliverable", refId: item.id }] },
      });
    }
    setLinkOpen(false);
  }
  function unlinkTask(taskId: string) {
    if (!item) return;
    update.mutate({ id: item.id, data: { taskIds: (item.taskIds ?? []).filter((id) => id !== taskId) } });
    const task = tasks.find((t) => t.id === taskId);
    if (task) {
      updateTask.mutate({
        id: taskId,
        data: { deps: (task.deps ?? []).filter((d) => !(d.type === "deliverable" && d.refId === item.id)) },
      });
    }
  }

  const meta = typeMeta(f.type);
  const Icon = meta.icon;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-serif-display flex items-center gap-2 font-medium">
            <span className={cn("flex size-7 items-center justify-center rounded-[var(--radius-sm)]", accent(meta.color).soft)}>
              <Icon className="size-4" />
            </span>
            {item ? "Edit deliverable" : "New deliverable"}
          </DialogTitle>
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
                  {FILE_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{TYPE_META[t].label}</SelectItem>
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
            <Label>Link (SharePoint / OneDrive / Google Drive / any URL)</Label>
            <div className="flex gap-2">
              <Input
                value={f.url}
                onChange={(e) => {
                  set("url", e.target.value);
                  if (!item) set("type", inferType(e.target.value));
                }}
                placeholder="https://…"
              />
              {f.url && (
                <Button type="button" variant="outline" size="icon" asChild>
                  <a href={f.url} target="_blank" rel="noreferrer" title="Open">
                    <ExternalLink className="size-4" />
                  </a>
                </Button>
              )}
            </div>
            <p className="text-muted-foreground text-xs">The file stays on the drive — only the link is stored here.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Date</Label>
            <Input type="date" value={f.date} onChange={(e) => set("date", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea value={f.note} onChange={(e) => set("note", e.target.value)} rows={2} />
          </div>

          {item && (
            <div className="space-y-2 border-t pt-4">
              <div className="flex items-center justify-between">
                <Label className="mb-0">Linked tasks</Label>
                <div className="relative">
                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => setLinkOpen((o) => !o)} disabled={unlinkedTasks.length === 0}>
                    <Plus className="size-3" /> Link
                  </Button>
                  {linkOpen && (
                    <div className="bg-popover absolute right-0 z-20 mt-1 w-64 rounded-[var(--radius-md)] border p-2 shadow-lg">
                      <div className="max-h-48 overflow-y-auto">
                        {unlinkedTasks.map((t) => (
                          <button key={t.id} type="button" onClick={() => linkTask(t.id)} className="hover:bg-muted flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-xs">
                            <span className="min-w-0 flex-1 truncate">{t.title}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              {linkedTasks.length === 0 && <p className="text-muted-foreground text-xs">No tasks reference this deliverable yet.</p>}
              <div className="space-y-1.5">
                {linkedTasks.map((t) => (
                  <div key={t.id} className="flex items-center gap-2 rounded-[var(--radius-sm)] bg-[var(--paper-2)] px-2.5 py-1.5">
                    <span className="min-w-0 flex-1 truncate text-xs font-semibold">{t.title}</span>
                    <button type="button" onClick={() => unlinkTask(t.id)} className="text-muted-foreground hover:text-[var(--t-red)] shrink-0">
                      <X className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <DialogFooter className="flex items-center justify-between sm:justify-between">
          {item ? (
            <Button variant="ghost" size="sm" onClick={remove} className="text-muted-foreground hover:text-[var(--t-red)]">
              <Trash2 className="size-3.5" /> Delete
            </Button>
          ) : <span />}
          <Button onClick={save} disabled={create.isPending || update.isPending}>
            {item ? "Save changes" : "Add deliverable"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── add flow: drag-drop zone + link-from-drive form ─────────────────────────

function AddZone({
  projectId, onCreated,
}: {
  projectId: string; onCreated: (item: Product) => void;
}) {
  const create = useCreateEntity(projectId, "products");
  const [dragOver, setDragOver] = useState(false);
  const [linkForm, setLinkForm] = useState<{ name: string; url: string } | null>(null);

  function fromFile(file: File) {
    // Links-only storage (no blob provider wired up yet) — a dropped/selected
    // file seeds the name + inferred type but the URL field is left for the
    // user to paste the shared-drive link it lives at.
    setLinkForm({ name: file.name.replace(/\.[^.]+$/, ""), url: "" });
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) fromFile(file);
  }

  function submitLink() {
    if (!linkForm) return;
    const name = linkForm.name.trim() || "Untitled deliverable";
    const url = linkForm.url.trim();
    create.mutate(
      { name, type: url ? inferType(url) : "doc", url, taskIds: [], date: "", note: "", placeholder: !url },
      {
        onSuccess: (row) => onCreated(row as Product),
        onError: (e) => toast.error((e as Error).message),
      },
    );
    setLinkForm(null);
  }

  return (
    <div className="mb-6 space-y-3">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={(e) => { if (e.currentTarget === e.target) setDragOver(false); }}
        onDrop={handleDrop}
        className={cn(
          "flex flex-col items-center gap-2 rounded-[var(--radius-lg)] border-[1.5px] border-dashed p-8 text-center transition",
          dragOver ? "border-primary/50 bg-primary/5" : "border-[var(--line-strong)] bg-[var(--paper-2)]",
        )}
      >
        <Upload className="text-muted-foreground/50 size-6" />
        <p className="text-sm font-medium">Drop a file here, or</p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <label className="shadow-xs inline-flex cursor-pointer items-center gap-1.5 rounded-[var(--radius-sm)] border bg-[var(--panel)] px-3 py-1.5 text-xs font-semibold transition hover:bg-[var(--panel-2)]">
            <Upload className="size-3.5" /> Choose file
            <input
              type="file"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) fromFile(f); e.target.value = ""; }}
            />
          </label>
          <Button size="sm" variant="outline" onClick={() => setLinkForm({ name: "", url: "" })}>
            <Link2 className="size-3.5" /> Link from drive
          </Button>
        </div>
        <p className="text-muted-foreground max-w-sm text-xs">
          Files stay on your shared drive — Atlas stores the link, not the bytes. Uploads up to 30&nbsp;MB are supported once cloud storage is connected; for now, add the file&rsquo;s drive link below.
        </p>
      </div>

      {linkForm && (
        <div className="shadow-xs rounded-[var(--radius-lg)] border bg-[var(--panel)] p-4">
          <div className="mb-3 grid gap-3 sm:grid-cols-2">
            <Input placeholder="Deliverable name" value={linkForm.name} onChange={(e) => setLinkForm({ ...linkForm, name: e.target.value })} autoFocus />
            <Input placeholder="https://…" value={linkForm.url} onChange={(e) => setLinkForm({ ...linkForm, url: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setLinkForm(null)}>Cancel</Button>
            <Button size="sm" onClick={submitLink} disabled={create.isPending}>Add deliverable</Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── grid card ────────────────────────────────────────────────────────────────

function ProductCard({
  product, taskCount, onOpen,
}: {
  product: Product; taskCount: number; onOpen: () => void;
}) {
  const meta = typeMeta(product.type);
  const Icon = meta.icon;
  const a = accent(meta.color);

  return (
    <button
      onClick={onOpen}
      className="shadow-xs group flex flex-col items-start rounded-[var(--radius-lg)] border bg-[var(--panel)] p-4 text-left transition hover:border-[var(--line-strong)] hover:shadow-md"
    >
      <div className="mb-3 flex w-full items-start justify-between gap-2">
        <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-[var(--radius-md)]", a.soft)}>
          <Icon className="size-5" />
        </span>
        {product.url && (
          <span className="text-muted-foreground inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium">
            <Link2 className="size-2.5" /> Drive
          </span>
        )}
      </div>
      <p className="line-clamp-2 text-[14px] font-semibold leading-snug">{product.name}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide", a.soft)}>{meta.label}</span>
        {taskCount > 0 && (
          <span className="text-muted-foreground text-[11px]">{taskCount} linked task{taskCount === 1 ? "" : "s"}</span>
        )}
      </div>
      {product.note && (
        <p className="text-muted-foreground mt-2 line-clamp-2 text-xs leading-snug">{product.note}</p>
      )}
    </button>
  );
}

// ── module ────────────────────────────────────────────────────────────────────

export function CatalogueModule({ projectId }: { projectId: string }) {
  const { data } = useProject(projectId);
  const [dialog, setDialog] = useState<{ open: boolean; item: Product | null }>({
    open: false,
    item: null,
  });
  if (!data) return null;
  const items = data.products;

  return (
    <div>
      <ModuleHeader
        eyebrow="Delivery"
        title="Product catalogue"
        description="Every deliverable produced by the project — link to where the files actually live."
        actions={
          <Button onClick={() => setDialog({ open: true, item: null })}>
            <Plus className="size-4" /> Add deliverable
          </Button>
        }
      />

      <AddZone projectId={projectId} onCreated={(item) => setDialog({ open: true, item })} />

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
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              taskCount={(p.taskIds ?? []).length}
              onOpen={() => setDialog({ open: true, item: p })}
            />
          ))}
        </div>
      )}

      {dialog.open && (
        <ProductDialog
          projectId={projectId}
          phases={data.phases}
          tasks={data.tasks}
          item={dialog.item}
          open={dialog.open}
          onOpenChange={(v) => setDialog((d) => ({ ...d, open: v }))}
        />
      )}
    </div>
  );
}
