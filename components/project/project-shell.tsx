"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { ChevronsUpDown, ArrowLeft, Check } from "lucide-react";
import { PROJECT_NAV } from "@/lib/nav";
import { useProject, useProjects } from "@/lib/api/hooks";
import { accent } from "@/lib/colors";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";

export function ProjectShell({ children }: { children: React.ReactNode }) {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const pathname = usePathname();
  const { data, isLoading } = useProject(id);
  const { data: allProjects } = useProjects();

  const project = data?.project;
  const activeSlug = pathname.split("/")[3] ?? "dashboard";

  return (
    <div className="mx-auto flex w-full max-w-7xl gap-6 px-4 py-6">
      {/* Sidebar */}
      <aside className="sticky top-20 hidden h-fit w-56 shrink-0 md:block">
        <Link
          href="/projects"
          className="text-muted-foreground hover:text-foreground mb-3 flex items-center gap-1.5 text-sm"
        >
          <ArrowLeft className="size-3.5" /> All projects
        </Link>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              className="mb-4 h-auto w-full justify-between px-2.5 py-2"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className={cn(
                    "size-2.5 shrink-0 rounded-full",
                    accent(project?.color).dot,
                  )}
                />
                <span className="truncate text-left text-sm font-medium">
                  {project?.name ?? "Loading…"}
                </span>
              </span>
              <ChevronsUpDown className="text-muted-foreground size-4 shrink-0" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="start">
            <DropdownMenuLabel>Switch project</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {(allProjects ?? []).map((p) => (
              <DropdownMenuItem key={p.id} asChild>
                <Link href={`/projects/${p.id}/${activeSlug}`}>
                  <span
                    className={cn("size-2 rounded-full", accent(p.color).dot)}
                  />
                  <span className="truncate">{p.name}</span>
                  {p.id === id && <Check className="ml-auto size-4" />}
                </Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <nav className="space-y-0.5">
          {PROJECT_NAV.map((item) => {
            const Icon = item.icon;
            const active = activeSlug === item.slug;
            return (
              <Link
                key={item.slug}
                href={`/projects/${id}/${item.slug}`}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition",
                  active
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Content */}
      <main className="min-w-0 flex-1">
        {/* Mobile module switcher */}
        <div className="mb-4 md:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="w-full justify-between">
                {PROJECT_NAV.find((n) => n.slug === activeSlug)?.label ??
                  "Menu"}
                <ChevronsUpDown className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56">
              {PROJECT_NAV.map((item) => (
                <DropdownMenuItem key={item.slug} asChild>
                  <Link href={`/projects/${id}/${item.slug}`}>
                    <item.icon className="size-4" />
                    {item.label}
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : (
          children
        )}
      </main>
    </div>
  );
}
