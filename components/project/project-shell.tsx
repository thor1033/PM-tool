"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useState } from "react";
import { ChevronsUpDown, ArrowLeft, Check, ChevronDown, Star } from "lucide-react";
import { PROJECT_NAV } from "@/lib/nav";
import { useProject, useProjects, useUpdateProject } from "@/lib/api/hooks";
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

const GROUP_LABELS: Record<string, string> = {
  overview: "Overview",
  strategy: "Strategy",
  delivery: "Delivery",
};

export function ProjectShell({ children }: { children: React.ReactNode }) {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const pathname = usePathname();
  const { data, isLoading } = useProject(id);
  const { data: allProjects } = useProjects();
  const updateProject = useUpdateProject(id);

  const project = data?.project;
  const activeSlug = pathname.split("/")[3] ?? "dashboard";

  const settings = (project?.settings as Record<string, unknown> | undefined) ?? {};
  const navFavs: string[] = Array.isArray(settings.navFavs) ? (settings.navFavs as string[]) : [];

  const activeItem = PROJECT_NAV.find((n) => n.slug === activeSlug);
  const activeGroup = activeItem?.group;

  const [groupOpen, setGroupOpen] = useState<Record<string, boolean>>({
    overview: activeGroup === "overview",
    strategy: activeGroup === "strategy",
    delivery: activeGroup === "delivery",
  });

  function toggleFav(slug: string) {
    if (!project) return;
    const next = navFavs.includes(slug)
      ? navFavs.filter((s) => s !== slug)
      : [...navFavs, slug];
    updateProject.mutate({ settings: { ...settings, navFavs: next } });
  }

  const pinned = PROJECT_NAV.filter((n) => !n.group);
  const favItems = PROJECT_NAV.filter((n) => n.group && navFavs.includes(n.slug));
  const groups = (["overview", "strategy", "delivery"] as const).map((key) => ({
    key,
    label: GROUP_LABELS[key],
    items: PROJECT_NAV.filter((n) => n.group === key),
  }));

  function NavLink({ item, indent = false }: { item: (typeof PROJECT_NAV)[number]; indent?: boolean }) {
    const active = activeSlug === item.slug;
    const Icon = item.icon;
    const isFav = navFavs.includes(item.slug);
    return (
      <div className="group/ni flex items-center">
        <Link
          href={`/projects/${id}/${item.slug}`}
          className={cn(
            "flex flex-1 items-center gap-3 rounded-[var(--radius-sm)] px-3 py-2.5 text-[15px] font-medium transition",
            indent && "pl-5",
            active
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          <Icon className={cn("size-[18px] shrink-0", active ? "opacity-100" : "opacity-80")} />
          {item.label}
        </Link>
        {item.group && (
          <button
            onClick={() => toggleFav(item.slug)}
            className={cn(
              "ml-0.5 rounded p-1 opacity-0 transition group-hover/ni:opacity-100",
              isFav ? "text-[var(--t-amber)] opacity-100" : "text-muted-foreground hover:text-[var(--t-amber)]",
              active && !isFav && "text-background/70 hover:text-[var(--t-amber)]",
            )}
            title={isFav ? "Unpin" : "Pin to top"}
          >
            <Star className="size-3.5" fill={isFav ? "currentColor" : "none"} />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1920px] items-start gap-0 px-0 py-0">
      {/* Sidebar — pinned, full-height, visually separated panel */}
      <aside className="bg-card sticky top-16 hidden h-[calc(100dvh-4rem)] w-72 shrink-0 flex-col border-r md:flex">
        <div className="flex-1 overflow-y-auto p-5">
          <Link
            href="/projects"
            className="text-muted-foreground hover:text-foreground mb-4 flex items-center gap-1.5 text-sm font-medium"
          >
            <ArrowLeft className="size-4" /> All projects
          </Link>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="mb-5 h-auto w-full justify-between px-3 py-2.5"
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <span
                    className={cn(
                      "size-3 shrink-0 rounded-full",
                      accent(project?.color).dot,
                    )}
                  />
                  <span className="truncate text-left text-[15px] font-semibold">
                    {project?.name ?? "Loading…"}
                  </span>
                </span>
                <ChevronsUpDown className="text-muted-foreground size-4 shrink-0" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-64" align="start">
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

          <nav className="space-y-1">
            {/* Always-visible pinned items */}
            {pinned.map((item) => (
              <NavLink key={item.slug} item={item} />
            ))}

            {/* Favourites pinned to top */}
            {favItems.length > 0 && (
              <div className="mt-4 border-t pt-4">
                <p className="eyebrow mb-2 px-3 text-[11px]">Pinned</p>
                {favItems.map((item) => (
                  <NavLink key={`fav-${item.slug}`} item={item} />
                ))}
              </div>
            )}

            {/* Collapsible groups */}
            {groups.map((g) => (
              <Collapsible
                key={g.key}
                open={groupOpen[g.key]}
                onOpenChange={(v) => setGroupOpen((s) => ({ ...s, [g.key]: v }))}
                className="mt-4"
              >
                <CollapsibleTrigger asChild>
                  <button className="eyebrow flex w-full items-center justify-between rounded-md px-3 py-2 text-[11.5px] transition hover:bg-muted hover:text-muted-foreground">
                    {g.label}
                    <ChevronDown
                      className={cn(
                        "size-3.5 transition-transform",
                        groupOpen[g.key] && "rotate-180",
                      )}
                    />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-1 pb-1">
                  {g.items.map((item) => (
                    <NavLink key={item.slug} item={item} indent />
                  ))}
                </CollapsibleContent>
              </Collapsible>
            ))}
          </nav>
        </div>
      </aside>

      {/* Content */}
      <main className="min-w-0 flex-1 px-6 py-6 lg:px-10 lg:py-8">
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
