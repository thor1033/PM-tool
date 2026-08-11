"use client";

import { useRef } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { apiFetch } from "./client";
import type { EntityName } from "@/lib/entities";
import type { ProjectSummary, WorkingSet } from "@/lib/types";

const projectsKey = ["projects"] as const;
const projectKey = (id: string) => ["project", id] as const;

const tempId = () => `tmp_${Math.random().toString(36).slice(2, 9)}`;

function patchWorkingSet(
  qc: QueryClient,
  projectId: string,
  fn: (ws: WorkingSet) => WorkingSet,
) {
  qc.setQueryData<WorkingSet>(projectKey(projectId), (old) =>
    old ? fn(old) : old,
  );
}

// ---------- projects list ----------
export function useProjects() {
  return useQuery({
    queryKey: projectsKey,
    queryFn: () => apiFetch<ProjectSummary[]>("/api/projects"),
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      name?: string;
      code?: string;
      color?: string;
      parentId?: string | null;
    }) =>
      apiFetch<WorkingSet["project"]>("/api/projects", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSettled: () => qc.invalidateQueries({ queryKey: projectsKey }),
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/projects/${id}`, { method: "DELETE" }),
    onMutate: async (id: string) => {
      await qc.cancelQueries({ queryKey: projectsKey });
      const previous = qc.getQueryData<ProjectSummary[]>(projectsKey);
      qc.setQueryData<ProjectSummary[]>(projectsKey, (old) =>
        (old ?? []).filter((p) => p.id !== id),
      );
      return { previous };
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.previous) qc.setQueryData(projectsKey, ctx.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: projectsKey }),
  });
}

// ---------- single project working set ----------
export function useProject(id: string) {
  return useQuery({
    queryKey: projectKey(id),
    queryFn: () => apiFetch<WorkingSet>(`/api/projects/${id}`),
    enabled: !!id,
  });
}

/** Patch project-level fields / JSONB document sections (optimistic). */
export function useUpdateProject(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Record<string, unknown>) =>
      apiFetch(`/api/projects/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    onMutate: async (patch: Record<string, unknown>) => {
      await qc.cancelQueries({ queryKey: projectKey(id) });
      const previous = qc.getQueryData<WorkingSet>(projectKey(id));
      patchWorkingSet(qc, id, (ws) => ({
        ...ws,
        project: { ...ws.project, ...patch },
      }));
      return { previous };
    },
    onError: (_e, _patch, ctx) => {
      if (ctx?.previous) qc.setQueryData(projectKey(id), ctx.previous);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: projectKey(id) });
      qc.invalidateQueries({ queryKey: projectsKey });
    },
  });
}

// ---------- entity mutations (optimistic) ----------
// `entity` matches the WorkingSet array key (tasks, risks, …), so we can update
// the cached working set in place before the server responds.

const ARRAY_DEFAULTS = {
  tags: [],
  assignees: [],
  deps: [],
  taskIds: [],
} as const;

export function useCreateEntity(projectId: string, entity: EntityName) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (raw: Record<string, unknown>) =>
      apiFetch(`/api/projects/${projectId}/${entity}`, {
        method: "POST",
        body: JSON.stringify(withCompletionDate(entity, raw)),
      }),
    onMutate: async (raw: Record<string, unknown>) => {
      const data = withCompletionDate(entity, raw);
      await qc.cancelQueries({ queryKey: projectKey(projectId) });
      const previous = qc.getQueryData<WorkingSet>(projectKey(projectId));
      const optimistic = {
        ...ARRAY_DEFAULTS,
        id: (data.id as string) ?? tempId(),
        orgId: "",
        projectId,
        ...data,
        _optimistic: true,
      };
      patchWorkingSet(qc, projectId, (ws) => ({
        ...ws,
        [entity]: [...(ws[entity] as unknown[]), optimistic],
      }));
      return { previous };
    },
    onError: (_e, _data, ctx) => {
      if (ctx?.previous) qc.setQueryData(projectKey(projectId), ctx.previous);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: projectKey(projectId) });
      qc.invalidateQueries({ queryKey: projectsKey });
    },
  });
}

/** Stamps a task's real completion date whenever its status changes.
 *
 *  Applied centrally rather than at each call site: status is changed from the
 *  list, board, kanban drag, workspace, task editor, subtask toggles and the
 *  AI plan, and one missed path would silently lose the date. An explicit
 *  `completedOn` in the payload always wins, so a manual correction sticks. */
function withCompletionDate(
  entity: EntityName,
  data: Record<string, unknown>,
): Record<string, unknown> {
  if (entity !== "tasks") return data;
  if (!("status" in data) || "completedOn" in data) return data;
  return {
    ...data,
    completedOn: data.status === "done" ? new Date().toISOString().slice(0, 10) : "",
  };
}

export function useUpdateEntity(projectId: string, entity: EntityName) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: Record<string, unknown>;
    }) =>
      apiFetch(`/api/projects/${projectId}/${entity}/${id}`, {
        method: "PATCH",
        body: JSON.stringify(withCompletionDate(entity, data)),
      }),
    onMutate: async ({ id, data: raw }) => {
      const data = withCompletionDate(entity, raw);
      await qc.cancelQueries({ queryKey: projectKey(projectId) });
      const previous = qc.getQueryData<WorkingSet>(projectKey(projectId));
      patchWorkingSet(qc, projectId, (ws) => ({
        ...ws,
        [entity]: (ws[entity] as { id: string }[]).map((it) =>
          it.id === id ? { ...it, ...data } : it,
        ),
      }));
      return { previous };
    },
    onError: (_e, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(projectKey(projectId), ctx.previous);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: projectKey(projectId) });
      qc.invalidateQueries({ queryKey: projectsKey });
    },
  });
}

export function useDeleteEntity(projectId: string, entity: EntityName) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/projects/${projectId}/${entity}/${id}`, {
        method: "DELETE",
      }),
    onMutate: async (id: string) => {
      await qc.cancelQueries({ queryKey: projectKey(projectId) });
      const previous = qc.getQueryData<WorkingSet>(projectKey(projectId));
      patchWorkingSet(qc, projectId, (ws) => ({
        ...ws,
        [entity]: (ws[entity] as { id: string }[]).filter(
          (it) => it.id !== id,
        ),
      }));
      return { previous };
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.previous) qc.setQueryData(projectKey(projectId), ctx.previous);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: projectKey(projectId) });
      qc.invalidateQueries({ queryKey: projectsKey });
    },
  });
}

// ---------- member mutations with task cascade ----------

export function useDeleteMember(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; name: string }) =>
      apiFetch(`/api/projects/${projectId}/members/${id}`, { method: "DELETE" }),
    onMutate: async ({ id, name }) => {
      await qc.cancelQueries({ queryKey: projectKey(projectId) });
      const previous = qc.getQueryData<WorkingSet>(projectKey(projectId));
      patchWorkingSet(qc, projectId, (ws) => ({
        ...ws,
        members: ws.members.filter((m) => m.id !== id),
        tasks: ws.tasks.map((t) =>
          (t.assignees ?? []).includes(name)
            ? { ...t, assignees: t.assignees.filter((a) => a !== name) }
            : t,
        ),
      }));
      return { previous };
    },
    onError: (_e, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(projectKey(projectId), ctx.previous);
    },
    onSuccess: (_data, { name }) => {
      // cascade to server: patch any tasks that still have this member name
      const ws = qc.getQueryData<WorkingSet>(projectKey(projectId));
      if (!ws) return;
      const affected = ws.tasks.filter((t) => (t.assignees ?? []).includes(name));
      affected.forEach((t) => {
        apiFetch(`/api/projects/${projectId}/tasks/${t.id}`, {
          method: "PATCH",
          body: JSON.stringify({ assignees: t.assignees.filter((a) => a !== name) }),
        }).catch(() => {});
      });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: projectKey(projectId) }),
  });
}

export function useUpdateMember(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; oldName: string; data: Record<string, unknown> }) =>
      apiFetch(`/api/projects/${projectId}/members/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onMutate: async ({ id, oldName, data }) => {
      await qc.cancelQueries({ queryKey: projectKey(projectId) });
      const previous = qc.getQueryData<WorkingSet>(projectKey(projectId));
      const newName = typeof data.name === "string" ? data.name : oldName;
      patchWorkingSet(qc, projectId, (ws) => ({
        ...ws,
        members: ws.members.map((m) => (m.id === id ? { ...m, ...data } : m)),
        tasks: newName !== oldName
          ? ws.tasks.map((t) =>
              (t.assignees ?? []).includes(oldName)
                ? { ...t, assignees: t.assignees.map((a) => (a === oldName ? newName : a)) }
                : t,
            )
          : ws.tasks,
      }));
      return { previous };
    },
    onError: (_e, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(projectKey(projectId), ctx.previous);
    },
    onSuccess: (_data, { oldName, data }) => {
      const newName = typeof data.name === "string" ? data.name : null;
      if (!newName || newName === oldName) return;
      const ws = qc.getQueryData<WorkingSet>(projectKey(projectId));
      if (!ws) return;
      const affected = ws.tasks.filter((t) => (t.assignees ?? []).includes(oldName));
      affected.forEach((t) => {
        apiFetch(`/api/projects/${projectId}/tasks/${t.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            assignees: t.assignees.map((a) => (a === oldName ? newName : a)),
          }),
        }).catch(() => {});
      });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: projectKey(projectId) }),
  });
}

// ---------- audit trail ----------

const auditKey = (projectId: string) => ["audit", projectId] as const;

export function useAudit(projectId: string) {
  return useQuery({
    queryKey: auditKey(projectId),
    queryFn: () => apiFetch<{ id: string; ts: string; kind: string; text: string; actor: string }[]>(
      `/api/projects/${projectId}/audit`,
    ),
    enabled: !!projectId,
    refetchInterval: 60_000,
  });
}

export function useLogActivity(projectId: string) {
  const qc = useQueryClient();
  const recent = useRef<Map<string, number>>(new Map());

  const mutation = useMutation({
    mutationFn: (entry: { kind?: string; text: string; actor?: string; key?: string }) =>
      apiFetch<{ id: string }>(`/api/projects/${projectId}/audit`, {
        method: "POST",
        body: JSON.stringify(entry),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: auditKey(projectId) });
    },
  });

  function log(text: string, opts?: { kind?: string; actor?: string; key?: string }) {
    const key = opts?.key;
    if (key) {
      const lastTs = recent.current.get(key) ?? 0;
      if (Date.now() - lastTs < 300_000) return; // coalesce: skip within 5-min window
      recent.current.set(key, Date.now());
    }
    mutation.mutate({ text, kind: opts?.kind ?? "edit", actor: opts?.actor ?? "", key });
  }

  return log;
}
