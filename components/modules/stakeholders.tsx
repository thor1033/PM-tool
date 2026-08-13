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
import { ModuleHeader, EmptyState } from "@/components/project/ui";
import { GlossaryText, type Term } from "@/components/project/glossary-text";
import { initials } from "@/lib/tasks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useConfirm } from "@/components/project/confirm";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** Renders the responsibility field.
 *
 *  People naturally type one item per line, often with a leading "*" or "-".
 *  Rendered as a single paragraph those markers just look like stray
 *  punctuation, so lines that are clearly a list become one. Anything else
 *  is left as prose. */
function ResponsibilityBody({
  text,
  glossary,
}: {
  text: string;
  glossary: Term[];
}) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  // Treat it as a list when every line is bulleted, or when there is simply
  // more than one line — a stray marker on one line of prose is not a list.
  const bulleted = lines.map((l) => l.replace(/^[-*\u2022\u2013]\s*/, ""));
  const isList = lines.length > 1 && bulleted.every((l) => l.length > 0);

  if (!isList) {
    return (
      <p className="text-[13.5px] leading-relaxed">
        <GlossaryText text={bulleted[0] ?? text} terms={glossary} />
      </p>
    );
  }

  return (
    <ul className="space-y-1">
      {bulleted.map((line, i) => (
        <li key={i} className="flex items-baseline gap-2 text-[13.5px] leading-snug">
          <span
            className="mt-[6px] size-[3px] shrink-0 rounded-full"
            style={{ background: "var(--ink-ghost)" }}
          />
          <span className="min-w-0">
            <GlossaryText text={line} terms={glossary} />
          </span>
        </li>
      ))}
    </ul>
  );
}

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
    role: item?.role ?? "",
    responsibility: item?.responsibility ?? "",
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
            <Input
              value={f.role}
              onChange={(e) => set("role", e.target.value)}
              placeholder="However you'd describe their role"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Responsibility</Label>
            <Textarea
              value={f.responsibility}
              onChange={(e) => set("responsibility", e.target.value)}
              rows={4}
              placeholder="One responsibility per line"
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
  const confirm = useConfirm();
  const [dialog, setDialog] = useState<{ open: boolean; item: Stakeholder | null }>(
    { open: false, item: null },
  );
  if (!data) return null;
  const items = data.stakeholders;
  const glossary = (data.project.glossary as { id: string; term: string; definition: string }[]) ?? [];

  return (
    <div>
      <ModuleHeader
        eyebrow="Overview"
        title="Stakeholders"
        description="Who matters on this engagement, and what they’re responsible for."
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
          {/* The header button is gone, so this is the way to add another
              once the list is no longer empty. */}
          <button
            onClick={() => setDialog({ open: true, item: null })}
            className="text-muted-foreground hover:border-primary hover:text-primary flex min-h-[92px] items-center justify-center gap-2 rounded-[var(--radius-lg)] border border-dashed text-[13.5px] font-medium transition md:order-last"
          >
            <Plus className="size-4" /> Add stakeholder
          </button>
          {items.map((s) => (
            <article
              key={s.id}
              onDoubleClick={() => setDialog({ open: true, item: s })}
              title="Double-click to edit"
              className="group shadow-xs rounded-[var(--radius-lg)] border bg-[var(--panel)] p-4 transition hover:shadow-md"
            >
              <header className="flex items-start gap-3">
                <span className="bg-foreground text-background mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full text-[12px] font-bold">
                  {initials(s.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="font-serif-display truncate text-[16px] font-medium leading-snug">
                    {s.name || "Unnamed"}
                  </h3>
                  {(s.title || s.role) && (
                    <p className="text-muted-foreground truncate text-[12.5px]">
                      {s.title}
                      {s.title && s.role ? " · " : ""}
                      {s.role}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => setDialog({ open: true, item: s })}
                    title="Edit stakeholder"
                    className="text-muted-foreground hover:bg-muted hover:text-foreground rounded-[var(--radius-sm)] p-1.5 transition"
                  >
                    <Pencil className="size-3.5" />
                  </button>
                  <button
                    onClick={async () => {
                      if (await confirm({ title: `Delete “${s.name || "this stakeholder"}”?` }))
                        del.mutate(s.id, {
                          onError: (e) => toast.error((e as Error).message),
                        });
                    }}
                    title="Delete stakeholder"
                    className="text-muted-foreground/70 rounded-[var(--radius-sm)] p-1.5 transition hover:bg-[color-mix(in_oklch,var(--t-red)_12%,transparent)] hover:text-[var(--t-red)]"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </header>

              {s.responsibility && (
                <div className="mt-3">
                  <p className="eyebrow mb-1.5">Responsibility</p>
                  <ResponsibilityBody text={s.responsibility} glossary={glossary} />
                </div>
              )}

              {s.contact && (
                <a
                  href={`mailto:${s.contact}`}
                  className="text-muted-foreground hover:text-primary mt-3 inline-flex items-center gap-1.5 border-t pt-2.5 text-[12.5px] transition"
                >
                  <Mail className="size-3.5" /> {s.contact}
                </a>
              )}
            </article>
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
