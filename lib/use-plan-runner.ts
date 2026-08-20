"use client";

import { useCallback, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api/client";
import {
  useProject,
  useCreateEntity,
  useUpdateEntity,
  useDeleteEntity,
  useUpdateProject,
  useLogActivity,
} from "@/lib/api/hooks";
import { applyOp, type Hooks } from "@/lib/plan-engine";
import type { PlanGroup, PlanResult } from "@/lib/ai/plan-types";

/* The run-and-apply cycle behind "update the plan".
 *
 * Both the overview's command bar and the plan page drive this, so a
 * proposal behaves identically wherever it was approved. The alternative —
 * each screen wiring its own set of entity mutations — is how the two drift
 * into applying the same operation differently. */

export interface PlanRunner {
  groups: PlanGroup[];
  /** Which proposed operations are ticked. Answers are never in here: they
   *  are the model replying, not something to apply. */
  sel: Record<string, boolean>;
  loading: boolean;
  applying: boolean;
  /** Applyable operations across all groups, in display order. */
  ops: PlanGroup["ops"];
  selectedCount: number;
  run: (text: string) => Promise<void>;
  toggle: (id: string) => void;
  setAll: (on: boolean) => void;
  apply: () => Promise<number>;
  reset: () => void;
}

export function usePlanRunner(projectId: string): PlanRunner {
  const { data: ws } = useProject(projectId);
  const qc = useQueryClient();
  const [groups, setGroups] = useState<PlanGroup[]>([]);
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);

  const createTask = useCreateEntity(projectId, "tasks");
  const updateTask = useUpdateEntity(projectId, "tasks");
  const deleteTask = useDeleteEntity(projectId, "tasks");
  const createRisk = useCreateEntity(projectId, "risks");
  const updateRisk = useUpdateEntity(projectId, "risks");
  const createFinding = useCreateEntity(projectId, "findings");
  const createProduct = useCreateEntity(projectId, "products");
  const createMilestone = useCreateEntity(projectId, "milestones");
  const updateMilestone = useUpdateEntity(projectId, "milestones");
  const createMember = useCreateEntity(projectId, "members");
  const updateMember = useUpdateEntity(projectId, "members");
  const createCategory = useCreateEntity(projectId, "categories");
  const createTag = useCreateEntity(projectId, "tags");
  const updateProject = useUpdateProject(projectId);
  const logActivity = useLogActivity(projectId);

  const run = useCallback(
    async (text: string) => {
      if (!text.trim()) return;
      setLoading(true);
      setGroups([]);
      setSel({});
      try {
        const result = await apiFetch<PlanResult>(`/api/projects/${projectId}/plan`, {
          method: "POST",
          body: JSON.stringify({ text }),
        });
        // Everything the model proposes starts ticked: the common case is
        // accepting the read of what happened, not curating it line by line.
        const next: Record<string, boolean> = {};
        (result.groups ?? []).forEach((g) =>
          g.ops.forEach((op) => {
            if (op.type !== "answer") next[String(op._id)] = true;
          }),
        );
        setGroups(result.groups ?? []);
        setSel(next);
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [projectId],
  );

  const ops = useMemo(
    () => groups.flatMap((g) => g.ops).filter((o) => o.type !== "answer"),
    [groups],
  );
  const selectedCount = ops.filter((o) => sel[String(o._id)]).length;

  const toggle = useCallback((id: string) => {
    setSel((s) => ({ ...s, [id]: !s[id] }));
  }, []);

  const setAll = useCallback(
    (on: boolean) => {
      const next: Record<string, boolean> = {};
      ops.forEach((o) => (next[String(o._id)] = on));
      setSel(next);
    },
    [ops],
  );

  const reset = useCallback(() => {
    setGroups([]);
    setSel({});
  }, []);

  const apply = useCallback(async (): Promise<number> => {
    if (!ws) return 0;
    const approved = ops.filter((op) => sel[String(op._id)]);
    if (!approved.length) {
      toast("Nothing selected");
      return 0;
    }

    const hooks: Hooks = {
      createTask, updateTask, deleteTask,
      createRisk, updateRisk,
      createFinding, createProduct,
      createMilestone, updateMilestone,
      createMember, updateMember,
      createCategory, createTag,
      updateProject,
      ws,
      projectId,
    };

    setApplying(true);
    let applied = 0;
    try {
      for (const op of approved) {
        const label = await applyOp(op, hooks);
        if (label) applied++;
      }
      await qc.invalidateQueries({ queryKey: ["project", projectId] });
      await qc.invalidateQueries({ queryKey: ["projects"] });
      toast.success(`Applied ${applied} change${applied === 1 ? "" : "s"}`);
      logActivity(
        `Plan update from chat: ${applied} change${applied === 1 ? "" : "s"} applied`,
        { kind: "import" },
      );
      reset();
      return applied;
    } catch (e) {
      toast.error((e as Error).message);
      return applied;
    } finally {
      setApplying(false);
    }
  }, [
    ws, ops, sel, projectId, qc, logActivity, reset,
    createTask, updateTask, deleteTask, createRisk, updateRisk,
    createFinding, createProduct, createMilestone, updateMilestone,
    createMember, updateMember, createCategory, createTag, updateProject,
  ]);

  return { groups, sel, loading, applying, ops, selectedCount, run, toggle, setAll, apply, reset };
}
