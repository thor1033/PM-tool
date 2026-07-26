"use client";

import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { useProject, useUpdateProject } from "@/lib/api/hooks";
import { ModuleHeader, EmptyState } from "@/components/project/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface Term {
  id: string;
  term: string;
  definition: string;
}

export function GlossaryModule({ projectId }: { projectId: string }) {
  const { data } = useProject(projectId);
  const update = useUpdateProject(projectId);
  if (!data) return null;
  const items = (data.project.glossary as Term[]) ?? [];

  function commit(next: Term[]) {
    update.mutate(
      { glossary: next },
      { onError: (e) => toast.error((e as Error).message) },
    );
  }

  function add() {
    commit([
      ...items,
      { id: `gl_${Math.random().toString(36).slice(2, 8)}`, term: "", definition: "" },
    ]);
  }
  function patch(id: string, key: "term" | "definition", value: string) {
    commit(items.map((t) => (t.id === id ? { ...t, [key]: value } : t)));
  }

  return (
    <div>
      <ModuleHeader
        title="Glossary"
        description="Shared terminology so everyone speaks the same language."
        actions={
          <Button onClick={add}>
            <Plus className="size-4" /> Add term
          </Button>
        }
      />
      {items.length === 0 ? (
        <EmptyState
          title="No terms yet"
          body="Define the acronyms and jargon specific to this engagement."
          action={
            <Button onClick={add}>
              <Plus className="size-4" /> Add term
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {items.map((t) => (
            <div
              key={t.id}
              className="grid gap-2 rounded-xl border p-3 sm:grid-cols-[200px_1fr_auto]"
            >
              <Input
                defaultValue={t.term}
                placeholder="Term"
                className="font-medium"
                onBlur={(e) =>
                  e.target.value !== t.term && patch(t.id, "term", e.target.value)
                }
              />
              <Textarea
                defaultValue={t.definition}
                placeholder="Definition"
                rows={2}
                onBlur={(e) =>
                  e.target.value !== t.definition &&
                  patch(t.id, "definition", e.target.value)
                }
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => commit(items.filter((x) => x.id !== t.id))}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
