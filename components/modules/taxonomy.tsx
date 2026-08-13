"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, X } from "lucide-react";
import {
  useProject,
  useCreateEntity,
  useUpdateEntity,
  useDeleteEntity,
} from "@/lib/api/hooks";
import type { EntityName } from "@/lib/entities";
import type { Category, Task, Stakeholder } from "@/lib/types";
import { ACCENTS, accent } from "@/lib/colors";
import { TRACK_ICONS } from "@/lib/tasks";
import { cn } from "@/lib/utils";
import { ModuleHeader, SectionCard } from "@/components/project/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

function IconPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <button
        type="button"
        onClick={() => onChange(null)}
        title="No icon"
        className={cn(
          "text-muted-foreground hover:text-foreground flex size-7 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border text-[10px]",
          !value && "border-primary bg-primary/10 text-primary",
        )}
      >
        <X className="size-3.5" />
      </button>
      {Object.entries(TRACK_ICONS).map(([key, { label, Icon }]) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          title={label}
          className={cn(
            "text-muted-foreground hover:text-foreground flex size-7 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border",
            value === key && "border-primary bg-primary/10 text-primary",
          )}
        >
          <Icon className="size-3.5" />
        </button>
      ))}
    </div>
  );
}

interface TaxItem {
  id: string;
  label: string;
  color: string;
}

function ColorDots({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex gap-1">
      {ACCENTS.map((a) => (
        <button
          key={a}
          type="button"
          onClick={() => onChange(a)}
          className={cn(
            "size-4 rounded-full",
            accent(a).dot,
            value === a && "ring-primary ring-2 ring-offset-1",
          )}
          aria-label={a}
        />
      ))}
    </div>
  );
}

function TaxSection({
  projectId,
  entity,
  title,
  items,
  defaultColor,
}: {
  projectId: string;
  entity: EntityName;
  title: string;
  items: TaxItem[];
  defaultColor: string;
}) {
  const create = useCreateEntity(projectId, entity);
  const update = useUpdateEntity(projectId, entity);
  const del = useDeleteEntity(projectId, entity);
  const [label, setLabel] = useState("");
  const [color, setColor] = useState(defaultColor);

  function add() {
    if (!label.trim()) return;
    create.mutate(
      { label: label.trim(), color },
      {
        onSuccess: () => setLabel(""),
        onError: (e) => toast.error((e as Error).message),
      },
    );
  }

  return (
    <SectionCard title={title}>
      <div className="space-y-2">
        {items.map((it) => (
          <div key={it.id} className="flex items-center gap-2">
            <ColorDots
              value={it.color}
              onChange={(c) =>
                update.mutate({ id: it.id, data: { color: c } })
              }
            />
            <Input
              defaultValue={it.label}
              onBlur={(e) => {
                if (e.target.value !== it.label)
                  update.mutate({ id: it.id, data: { label: e.target.value } });
              }}
              className="h-8"
            />
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={() => del.mutate(it.id)}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
        {items.length === 0 && (
          <p className="text-muted-foreground text-sm">None yet.</p>
        )}
      </div>
      <div className="mt-3 flex items-center gap-2 border-t pt-3">
        <ColorDots value={color} onChange={setColor} />
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="Add…"
          className="h-8"
        />
        <Button size="icon" className="size-8" onClick={add}>
          <Plus className="size-4" />
        </Button>
      </div>
    </SectionCard>
  );
}

// Tracks are mandatory on every task, so — unlike tags/phases — deleting
// one that's still in use needs a safe reassignment step first, not a bare
// delete. Everything else about the row (rename, recolor, add) matches
// TaxSection.

function TrackRow({
  projectId, cat, tasksIn, otherCategories, stakeholders,
}: {
  projectId: string; cat: Category; tasksIn: Task[]; otherCategories: Category[];
  stakeholders: Stakeholder[];
}) {
  const update = useUpdateEntity(projectId, "categories");
  const updateTask = useUpdateEntity(projectId, "tasks");
  const del = useDeleteEntity(projectId, "categories");
  const [confirming, setConfirming] = useState(false);
  const [reassignTo, setReassignTo] = useState(otherCategories[0]?.id ?? "");
  const taskCount = tasksIn.length;

  function startDelete() {
    if (taskCount === 0) {
      del.mutate(cat.id, { onError: (e) => toast.error((e as Error).message) });
      return;
    }
    setConfirming(true);
  }

  function confirmDelete() {
    if (!reassignTo) return;
    tasksIn.forEach((t) => updateTask.mutate({ id: t.id, data: { category: reassignTo } }));
    del.mutate(cat.id, { onError: (e) => toast.error((e as Error).message) });
    setConfirming(false);
  }

  return (
    <div className="rounded-[var(--radius-md)] border bg-[var(--paper-2)] p-2">
      <div className="flex items-center gap-2">
        <ColorDots value={cat.color} onChange={(c) => update.mutate({ id: cat.id, data: { color: c } })} />
        <Input
          defaultValue={cat.label}
          onBlur={(e) => {
            if (e.target.value !== cat.label) update.mutate({ id: cat.id, data: { label: e.target.value } });
          }}
          className="h-8"
        />
        <Button variant="ghost" size="icon" className="size-8" onClick={startDelete}>
          <Trash2 className="size-4" />
        </Button>
      </div>
      <div className="mt-2 border-t pt-2">
        <IconPicker value={cat.icon} onChange={(icon) => update.mutate({ id: cat.id, data: { icon } })} />
      </div>
      {/* Owner is stored as a stakeholder id, so the list is exactly the
          people on the Stakeholders page — a track cannot be owned by
          someone who does not exist there. */}
      <div className="mt-2 flex items-center gap-2 border-t pt-2">
        <span className="text-muted-foreground shrink-0 text-xs">Responsible</span>
        <Select
          value={cat.owner ?? "none"}
          onValueChange={(v) =>
            update.mutate(
              { id: cat.id, data: { owner: v === "none" ? null : v } },
              { onError: (e) => toast.error((e as Error).message) },
            )
          }
        >
          <SelectTrigger className="h-8 flex-1 text-xs">
            <SelectValue placeholder="Nobody yet" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">— nobody —</SelectItem>
            {stakeholders.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}{p.title ? ` · ${p.title}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {stakeholders.length === 0 && (
        <p className="text-muted-foreground mt-1 text-[11px]">
          Add people on the Stakeholders page to assign one here.
        </p>
      )}
      {confirming && (
        <div className="mt-2 space-y-2 border-t pt-2">
          {otherCategories.length === 0 ? (
            <>
              <p className="text-xs text-[var(--t-red)]">
                This is the only track and it has {taskCount} task{taskCount === 1 ? "" : "s"} — create another track first so they have somewhere to go.
              </p>
              <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>Cancel</Button>
            </>
          ) : (
            <>
              <p className="text-muted-foreground text-xs">
                {taskCount} task{taskCount === 1 ? "" : "s"} in &ldquo;{cat.label}&rdquo; will move to:
              </p>
              <div className="flex items-center gap-2">
                <Select value={reassignTo} onValueChange={setReassignTo}>
                  <SelectTrigger className="h-8 flex-1 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {otherCategories.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button size="sm" variant="destructive" onClick={confirmDelete} disabled={!reassignTo}>Move &amp; delete</Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>Cancel</Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function TrackSection({
  projectId, categories, tasks, stakeholders,
}: {
  projectId: string; categories: Category[]; tasks: Task[]; stakeholders: Stakeholder[];
}) {
  const create = useCreateEntity(projectId, "categories");
  const [label, setLabel] = useState("");
  const [color, setColor] = useState<string>("purple");

  function add() {
    if (!label.trim()) return;
    create.mutate(
      { label: label.trim(), color },
      { onSuccess: () => setLabel(""), onError: (e) => toast.error((e as Error).message) },
    );
  }

  return (
    <SectionCard title="Tracks">
      <p className="text-muted-foreground -mt-1 mb-3 text-xs leading-relaxed">
        Every task belongs to exactly one track — deleting one that&rsquo;s still in use
        moves its tasks to another track first.
      </p>
      <div className="space-y-2">
        {categories.map((c) => (
          <TrackRow
            key={c.id}
            projectId={projectId}
            cat={c}
            tasksIn={tasks.filter((t) => t.category === c.id)}
            otherCategories={categories.filter((x) => x.id !== c.id)}
            stakeholders={stakeholders}
          />
        ))}
        {categories.length === 0 && (
          <p className="text-muted-foreground text-sm">None yet.</p>
        )}
      </div>
      <div className="mt-3 flex items-center gap-2 border-t pt-3">
        <ColorDots value={color} onChange={setColor} />
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="Add…"
          className="h-8"
        />
        <Button size="icon" className="size-8" onClick={add}>
          <Plus className="size-4" />
        </Button>
      </div>
    </SectionCard>
  );
}

export function TaxonomyModule({ projectId }: { projectId: string }) {
  const { data } = useProject(projectId);
  if (!data) return null;
  return (
    <div>
      <ModuleHeader
        title="Taxonomy"
        description="The tags, phases and tracks used across this project."
      />
      <div className="grid gap-4 md:grid-cols-3">
        <TaxSection
          projectId={projectId}
          entity="tags"
          title="Tags"
          items={data.tags}
          defaultColor="blue"
        />
        <TaxSection
          projectId={projectId}
          entity="phases"
          title="Phases"
          items={data.phases}
          defaultColor="teal"
        />
        <TrackSection
          projectId={projectId}
          categories={data.categories}
          tasks={data.tasks}
          stakeholders={data.stakeholders}
        />
      </div>
    </div>
  );
}
