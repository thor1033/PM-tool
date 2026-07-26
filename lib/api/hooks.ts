"use client";

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
    mutationFn: (data: Record<string, unknown>) =>
      apiFetch(`/api/projects/${projectId}/${entity}`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onMutate: async (data: Record<string, unknown>) => {
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
        body: JSON.stringify(data),
      }),
    onMutate: async ({ id, data }) => {
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
    onSettled: () => qc.invalidateQueries({ queryKey: projectKey(projectId) }),
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
