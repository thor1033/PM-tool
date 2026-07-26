"use client";

import Link from "next/link";
import { toast } from "sonner";
import { MoreVertical, FolderTree, Trash2 } from "lucide-react";
import { useProjects, useDeleteProject } from "@/lib/api/hooks";
import type { ProjectSummary } from "@/lib/types";
import { accent } from "@/lib/colors";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CreateProjectDialog } from "@/components/projects/create-project-dialog";

function timeAgo(iso: string) {
  const d = Date.now() - new Date(iso).getTime();
  const day = 86400000;
  if (d < day) return "today";
  const days = Math.floor(d / day);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function ProjectCard({
  p,
  childrenProjects,
}: {
  p: ProjectSummary;
  childrenProjects: ProjectSummary[];
}) {
  const del = useDeleteProject();
  const pct = p.taskCount ? Math.round((p.doneCount / p.taskCount) * 100) : 0;

  return (
    <div className="group hover:border-primary/40 relative flex flex-col rounded-xl border p-4 transition">
      <div className="flex items-start justify-between">
        <Link
          href={`/projects/${p.id}/dashboard`}
          className="flex items-center gap-2.5"
        >
          <span className={cn("size-2.5 rounded-full", accent(p.color).dot)} />
          <div>
            <div className="font-medium leading-tight">{p.name}</div>
            {p.code ? (
              <div className="text-muted-foreground text-xs">{p.code}</div>
            ) : null}
          </div>
        </Link>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 opacity-0 group-hover:opacity-100"
            >
              <MoreVertical className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => {
                if (confirm(`Delete "${p.name}"? This cannot be undone.`)) {
                  del.mutate(p.id, {
                    onSuccess: () => toast.success("Project deleted"),
                    onError: (e) => toast.error((e as Error).message),
                  });
                }
              }}
            >
              <Trash2 className="size-4" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Link href={`/projects/${p.id}/dashboard`} className="mt-4 block">
        <div className="text-muted-foreground mb-1 flex justify-between text-xs">
          <span>
            {p.doneCount}/{p.taskCount} tasks
          </span>
          <span>{pct}%</span>
        </div>
        <Progress value={pct} className="h-1.5" />
      </Link>

      {childrenProjects.length > 0 && (
        <div className="mt-3 space-y-1 border-t pt-3">
          <div className="text-muted-foreground flex items-center gap-1 text-xs">
            <FolderTree className="size-3" /> Sub-projects
          </div>
          {childrenProjects.map((c) => (
            <Link
              key={c.id}
              href={`/projects/${c.id}/dashboard`}
              className="hover:bg-muted flex items-center gap-2 rounded-md px-1.5 py-1 text-sm"
            >
              <span className={cn("size-2 rounded-full", accent(c.color).dot)} />
              {c.name}
            </Link>
          ))}
        </div>
      )}

      <div className="text-muted-foreground mt-3 text-xs">
        Updated {timeAgo(p.updatedAt)}
      </div>
    </div>
  );
}

export function ProjectsView() {
  const { data, isLoading, error } = useProjects();

  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-40 rounded-xl" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-dashed p-10 text-center">
        <p className="text-muted-foreground">
          Couldn&apos;t load projects: {(error as Error).message}
        </p>
      </div>
    );
  }

  const projects = data ?? [];
  const byParent = new Map<string, ProjectSummary[]>();
  for (const p of projects) {
    if (p.parentId) {
      const arr = byParent.get(p.parentId) ?? [];
      arr.push(p);
      byParent.set(p.parentId, arr);
    }
  }
  const roots = projects.filter((p) => !p.parentId);

  if (projects.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-12 text-center">
        <h2 className="text-lg font-medium">No projects yet</h2>
        <p className="text-muted-foreground mx-auto mt-1 max-w-sm text-sm">
          Create your first project — start blank or let Claude draft the plan
          from a short brief.
        </p>
        <div className="mt-5 flex justify-center">
          <CreateProjectDialog />
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {roots.map((p) => (
        <ProjectCard
          key={p.id}
          p={p}
          childrenProjects={byParent.get(p.id) ?? []}
        />
      ))}
    </div>
  );
}
