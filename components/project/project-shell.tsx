"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useState } from "react";
import { ChevronsUpDown, ArrowLeft, Check, ChevronDown, Star, SlidersHorizontal } from "lucide-react";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SaveIndicator } from "@/components/project/save-indicator";

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
  /* Which groupable pages this project shows. A project that has never been
     customised has no stored list — that's treated as "show everything" so
     existing work doesn't vanish, while a saved list is respected exactly
     (including an empty one, meaning the user switched everything off). */
  const hasNavPrefs = Array.isArray(settings.navModules);
  const enabledModules: string[] = hasNavPrefs ? (settings.navModules as string[]) : [];
  const isEnabled = (slug: string) => !hasNavPrefs || enabledModules.includes(slug);

  const activeItem = PROJECT_NAV.find((n) => n.slug === activeSlug);
  const activeGroup = activeItem?.group;

  const [customiseOpen, setCustomiseOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState<Record<string, boolean>>({
    overview: activeGroup === "overview",
    strategy: activeGroup === "strategy",
    delivery: activeGroup === "delivery",
  });

  function toggleModule(slug: string) {
    if (!project) return;
    // First customisation starts from "everything on", which is what the user
    // is currently looking at.
    const base = hasNavPrefs
      ? enabledModules
      : PROJECT_NAV.filter((n) => n.group).map((n) => n.slug);
    const next = base.includes(slug)
      ? base.filter((s) => s !== slug)
      : [...base, slug];
    updateProject.mutate({ settings: { ...settings, navModules: next } });
  }

  function setAllModules(on: boolean) {
    if (!project) return;
    const next = on ? PROJECT_NAV.filter((n) => n.group).map((n) => n.slug) : [];
    updateProject.mutate({ settings: { ...settings, navModules: next } });
  }

  function toggleFav(slug: string) {
    if (!project) return;
    const next = navFavs.includes(slug)
      ? navFavs.filter((s) => s !== slug)
      : [...navFavs, slug];
    updateProject.mutate({ settings: { ...settings, navFavs: next } });
  }

  const groupableCount = PROJECT_NAV.filter((n) => n.group).length;
  const shownCount = PROJECT_NAV.filter((n) => n.group && isEnabled(n.slug)).length;
  const glossaryCount = ((data?.project.glossary as { term?: string }[] | undefined) ?? [])
    .filter((t) => t.term?.trim()).length;
  const pinned = PROJECT_NAV.filter((n) => !n.group);
  const favItems = PROJECT_NAV.filter(
    (n) => n.group && navFavs.includes(n.slug) && isEnabled(n.slug),
  );
  const groups = (["overview", "strategy", "delivery"] as const)
    .map((key) => ({
      key,
      label: GROUP_LABELS[key],
      items: PROJECT_NAV.filter((n) => n.group === key && isEnabled(n.slug)),
    }))
    // A section with nothing switched on shouldn't render an empty header.
    .filter((g) => g.items.length > 0);

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
          <span className="flex-1">{item.label}</span>
          {item.slug === "glossary" && glossaryCount > 0 && (
            <span
              className={cn(
                "shrink-0 rounded-full px-1.5 py-0.5 font-mono text-[10.5px] font-semibold",
                active ? "bg-background/20" : "bg-muted text-muted-foreground",
              )}
              title={`${glossaryCount} term${glossaryCount === 1 ? "" : "s"}`}
            >
              {glossaryCount}
            </span>
          )}
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

        {/* Customise — which optional pages this project shows. */}
        <div className="shrink-0 border-t p-3">
          <button
            onClick={() => setCustomiseOpen(true)}
            className="text-muted-foreground hover:bg-muted hover:text-foreground flex w-full items-center gap-2.5 rounded-[var(--radius-sm)] px-3 py-2 text-[13.5px] font-medium transition"
          >
            <SlidersHorizontal className="size-4 shrink-0" />
            Customise pages
            <span className="ml-auto font-mono text-[11px]">
              {shownCount}/{groupableCount}
            </span>
          </button>
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
              {PROJECT_NAV.filter((n) => !n.group || isEnabled(n.slug)).map((item) => (
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

      <SaveIndicator />

      <Dialog open={customiseOpen} onOpenChange={setCustomiseOpen}>
        <DialogContent className="no-gloss flex max-h-[85dvh] flex-col sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-serif-display font-medium">Customise pages</DialogTitle>
          </DialogHeader>

          <div className="flex items-center justify-between gap-3">
            <p className="text-muted-foreground text-[13.5px] leading-relaxed">
              Choose what this project needs. Overview, Workspace and Tasks are
              always available.
            </p>
            <div className="flex shrink-0 gap-1.5">
              <Button size="sm" variant="outline" onClick={() => setAllModules(true)}>All</Button>
              <Button size="sm" variant="outline" onClick={() => setAllModules(false)}>None</Button>
            </div>
          </div>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
            {(["overview", "strategy", "delivery"] as const).map((key) => (
              <div key={key}>
                <p className="eyebrow mb-2 text-[11px]">{GROUP_LABELS[key]}</p>
                <div className="space-y-1">
                  {PROJECT_NAV.filter((n) => n.group === key).map((item) => {
                    const on = isEnabled(item.slug);
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.slug}
                        onClick={() => toggleModule(item.slug)}
                        className="hover:bg-muted flex w-full items-center gap-3 rounded-[var(--radius-sm)] px-2.5 py-2 text-left transition"
                      >
                        <Icon className={cn("size-4 shrink-0", on ? "text-foreground" : "text-muted-foreground/50")} />
                        <span className="min-w-0 flex-1">
                          <span className={cn("block text-[13.5px] font-medium", !on && "text-muted-foreground")}>
                            {item.label}
                          </span>
                          <span className="text-muted-foreground/70 block text-[12px]">{item.hint}</span>
                        </span>
                        <span
                          className={cn(
                            "relative h-5 w-9 shrink-0 rounded-full transition",
                            on ? "bg-primary" : "bg-[var(--line-strong)]",
                          )}
                          role="switch"
                          aria-checked={on}
                        >
                          <span
                            className={cn(
                              "absolute top-0.5 size-4 rounded-full bg-white transition-all",
                              on ? "left-[18px]" : "left-0.5",
                            )}
                          />
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
