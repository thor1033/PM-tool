"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import {
  useProject,
  useCreateEntity,
  useUpdateEntity,
  useDeleteEntity,
} from "@/lib/api/hooks";
import type { EntityName } from "@/lib/entities";
import { ACCENTS, accent } from "@/lib/colors";
import { cn } from "@/lib/utils";
import { ModuleHeader, SectionCard } from "@/components/project/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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

export function TaxonomyModule({ projectId }: { projectId: string }) {
  const { data } = useProject(projectId);
  if (!data) return null;
  return (
    <div>
      <ModuleHeader
        title="Taxonomy"
        description="The tags, phases and categories used across this project."
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
        <TaxSection
          projectId={projectId}
          entity="categories"
          title="Categories"
          items={data.categories}
          defaultColor="purple"
        />
      </div>
    </div>
  );
}
