"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Package, Library, ChevronDown, ChevronRight, X } from "lucide-react";
import { useProject, useUpdateProject } from "@/lib/api/hooks";
import { blankStartup } from "@/lib/templates";
import { ModuleHeader } from "@/components/project/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type FeatureItem = {
  id: string; name: string; desc: string;
  how: string; what: string;
  audience?: string; outcomes?: string[];
};
type FeatureGroup = { id: string; label: string; items: FeatureItem[] };
type FeaturePackage = { id: string; name: string; tagline: string; featureIds: string[] };

interface FeaturesDoc {
  groups: FeatureGroup[];
  packages: FeaturePackage[];
}

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}`;
}

const OUTCOME_OPTS = [
  { key: "cost",    label: "Reduce cost",      cls: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300" },
  { key: "time",    label: "Save time",         cls: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300" },
  { key: "flow",    label: "Optimise flow",     cls: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300" },
  { key: "quality", label: "Increase quality",  cls: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" },
  { key: "replace", label: "Replace output",    cls: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300" },
];

// ── FeatureCard ───────────────────────────────────────────────────────────────

function FeatureCard({
  item, onPatch, onRemove,
}: {
  item: FeatureItem;
  onPatch: (k: keyof FeatureItem, v: unknown) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const outcomes = item.outcomes ?? [];

  return (
    <div className="rounded-xl border bg-card">
      <div className="flex items-start gap-2 p-3">
        <div className="min-w-0 flex-1">
          <input
            className="w-full border-0 bg-transparent text-sm font-medium outline-none placeholder:text-muted-foreground/40"
            value={item.name}
            onChange={(e) => onPatch("name", e.target.value)}
            placeholder="Feature name"
          />
          <input
            className="mt-0.5 w-full border-0 bg-transparent text-xs text-muted-foreground outline-none placeholder:text-muted-foreground/40"
            value={item.desc}
            onChange={(e) => onPatch("desc", e.target.value)}
            placeholder="Short description…"
          />
        </div>
        <button
          onClick={() => setOpen((o) => !o)}
          className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
          title="Expand"
        >
          {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </button>
        <button onClick={onRemove} className="shrink-0 text-muted-foreground/40 hover:text-red-500">
          <Trash2 className="size-3.5" />
        </button>
      </div>

      {/* Outcome chips (always visible) */}
      <div className="flex flex-wrap gap-1 px-3 pb-2">
        {OUTCOME_OPTS.map((o) => (
          <button
            key={o.key}
            type="button"
            onClick={() => onPatch("outcomes", outcomes.includes(o.key)
              ? outcomes.filter((x) => x !== o.key)
              : [...outcomes, o.key])}
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-medium transition",
              outcomes.includes(o.key) ? o.cls : "bg-muted text-muted-foreground hover:bg-muted/80",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>

      {open && (
        <div className="border-t px-3 pb-3 pt-2 space-y-3">
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">How — delivery</p>
            <Textarea
              value={item.how}
              onChange={(e) => onPatch("how", e.target.value)}
              placeholder="How is this feature delivered / built?"
              rows={2}
              className="text-sm"
            />
          </div>
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">What — client output</p>
            <Textarea
              value={item.what}
              onChange={(e) => onPatch("what", e.target.value)}
              placeholder="What does the client receive or experience?"
              rows={2}
              className="text-sm"
            />
          </div>
          {(item.audience !== undefined || true) && (
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Target audience</p>
              <Input
                value={item.audience ?? ""}
                onChange={(e) => onPatch("audience", e.target.value)}
                placeholder="Who is this feature for?"
                className="h-7 text-sm"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Feature Library tab ───────────────────────────────────────────────────────

function LibraryTab({
  groups, setGroups,
}: {
  groups: FeatureGroup[];
  setGroups: (g: FeatureGroup[]) => void;
}) {
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  function patchGroup(gid: string, fn: (g: FeatureGroup) => FeatureGroup) {
    setGroups(groups.map((g) => (g.id === gid ? fn(g) : g)));
  }

  function patchItem(gid: string, iid: string, k: keyof FeatureItem, v: unknown) {
    patchGroup(gid, (g) => ({
      ...g,
      items: g.items.map((it) => (it.id === iid ? { ...it, [k]: v } : it)),
    }));
  }

  function addItem(gid: string) {
    patchGroup(gid, (g) => ({
      ...g,
      items: [
        ...(g.items ?? []),
        { id: uid("ft"), name: "", desc: "", how: "", what: "", audience: "", outcomes: [] },
      ],
    }));
    setOpenGroups((o) => ({ ...o, [gid]: true }));
  }

  return (
    <div className="space-y-3">
      {groups.map((g) => {
        const isOpen = openGroups[g.id] ?? true;
        return (
          <Collapsible key={g.id} open={isOpen} onOpenChange={(v) => setOpenGroups((o) => ({ ...o, [g.id]: v }))}>
            <div className="rounded-xl border bg-muted/30 p-3">
              <div className="flex items-center gap-2">
                <CollapsibleTrigger asChild>
                  <button className="flex flex-1 items-center gap-2 text-left">
                    {isOpen ? <ChevronDown className="size-4 text-muted-foreground" /> : <ChevronRight className="size-4 text-muted-foreground" />}
                    <input
                      className="min-w-0 flex-1 border-0 bg-transparent text-sm font-semibold outline-none"
                      value={g.label}
                      onChange={(e) => patchGroup(g.id, (gr) => ({ ...gr, label: e.target.value }))}
                      onClick={(e) => e.stopPropagation()}
                      placeholder="Category name"
                    />
                    <Badge variant="secondary" className="text-xs">{g.items.length}</Badge>
                  </button>
                </CollapsibleTrigger>
                <button onClick={() => addItem(g.id)} className="text-muted-foreground hover:text-foreground" title="Add feature">
                  <Plus className="size-4" />
                </button>
                <button
                  onClick={() => setGroups(groups.filter((x) => x.id !== g.id))}
                  className="text-muted-foreground/40 hover:text-red-500"
                  title="Remove category"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>

              <CollapsibleContent>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {g.items.map((item) => (
                    <FeatureCard
                      key={item.id}
                      item={item}
                      onPatch={(k, v) => patchItem(g.id, item.id, k, v)}
                      onRemove={() => patchGroup(g.id, (gr) => ({ ...gr, items: gr.items.filter((x) => x.id !== item.id) }))}
                    />
                  ))}
                  {g.items.length === 0 && (
                    <p className="col-span-2 text-sm text-muted-foreground">No features yet.</p>
                  )}
                </div>
                <Button variant="ghost" size="sm" className="mt-2 text-muted-foreground" onClick={() => addItem(g.id)}>
                  <Plus className="size-3.5" /> Add feature
                </Button>
              </CollapsibleContent>
            </div>
          </Collapsible>
        );
      })}
      <Button variant="outline" onClick={() => setGroups([...groups, { id: uid("fg"), label: "New category", items: [] }])}>
        <Plus className="size-4" /> Add category
      </Button>
    </div>
  );
}

// ── Packages tab ──────────────────────────────────────────────────────────────

function PackageCard({
  pkg,
  allFeatures,
  onPatch,
  onRemove,
}: {
  pkg: FeaturePackage;
  allFeatures: { group: string; item: FeatureItem }[];
  onPatch: (k: keyof FeaturePackage, v: unknown) => void;
  onRemove: () => void;
}) {
  const [picking, setPicking] = useState(false);
  const [search, setSearch] = useState("");

  const includedItems = pkg.featureIds
    .map((fid) => allFeatures.find((f) => f.item.id === fid))
    .filter(Boolean) as { group: string; item: FeatureItem }[];

  const availableItems = allFeatures.filter(
    (f) => !pkg.featureIds.includes(f.item.id),
  );
  const filtered = availableItems.filter((f) =>
    f.item.name.toLowerCase().includes(search.toLowerCase()) ||
    f.group.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex items-start gap-2">
        <Package className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <input
            className="w-full border-0 bg-transparent text-sm font-semibold outline-none placeholder:text-muted-foreground/40"
            value={pkg.name}
            onChange={(e) => onPatch("name", e.target.value)}
            placeholder="Package name"
          />
          <input
            className="mt-0.5 w-full border-0 bg-transparent text-xs text-muted-foreground outline-none placeholder:text-muted-foreground/40"
            value={pkg.tagline}
            onChange={(e) => onPatch("tagline", e.target.value)}
            placeholder="One-line tagline…"
          />
        </div>
        <button onClick={onRemove} className="shrink-0 text-muted-foreground/40 hover:text-red-500">
          <Trash2 className="size-3.5" />
        </button>
      </div>

      {/* Bundled features */}
      <div className="space-y-1">
        {includedItems.map((f, idx) => (
          <div key={f.item.id} className="flex items-center gap-1.5 rounded border bg-muted/30 px-2 py-1 text-xs">
            <span className="min-w-0 flex-1 truncate">{f.item.name || "Untitled"}</span>
            <span className="shrink-0 text-muted-foreground/60">{f.group}</span>
            <button
              onClick={() => onPatch("featureIds", pkg.featureIds.filter((x) => x !== f.item.id))}
              className="shrink-0 text-muted-foreground/40 hover:text-muted-foreground"
            >
              <X className="size-3" />
            </button>
          </div>
        ))}
        {includedItems.length === 0 && (
          <p className="text-xs text-muted-foreground">No features bundled yet.</p>
        )}
      </div>

      <Button variant="ghost" size="sm" className="mt-2 h-7 text-xs text-muted-foreground" onClick={() => setPicking(true)}>
        <Plus className="size-3.5" /> Add feature
      </Button>

      {/* Feature picker dialog */}
      <Dialog open={picking} onOpenChange={setPicking}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add feature to "{pkg.name || "package"}"</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            placeholder="Search features…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="mb-2"
          />
          <div className="max-h-72 overflow-y-auto space-y-1">
            {filtered.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">No features available.</p>
            )}
            {filtered.map((f) => (
              <button
                key={f.item.id}
                className="flex w-full items-center gap-3 rounded-lg border p-2 text-left text-sm hover:bg-muted/50 transition"
                onClick={() => {
                  onPatch("featureIds", [...pkg.featureIds, f.item.id]);
                  setPicking(false);
                  setSearch("");
                }}
              >
                <div className="min-w-0 flex-1">
                  <span className="font-medium">{f.item.name || "Untitled"}</span>
                  {f.item.desc && <span className="ml-2 text-muted-foreground">{f.item.desc}</span>}
                </div>
                <Badge variant="outline" className="shrink-0 text-[10px]">{f.group}</Badge>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PackagesTab({
  packages, groups, setPackages,
}: {
  packages: FeaturePackage[];
  groups: FeatureGroup[];
  setPackages: (p: FeaturePackage[]) => void;
}) {
  // Flatten all features with their group label
  const allFeatures = useMemo(
    () => groups.flatMap((g) => (g.items ?? []).map((item) => ({ group: g.label || "Ungrouped", item }))),
    [groups],
  );

  function patchPkg(id: string, k: keyof FeaturePackage, v: unknown) {
    setPackages(packages.map((p) => (p.id === id ? { ...p, [k]: v } : p)));
  }

  return (
    <div className="space-y-4">
      {packages.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Packages bundle features into sellable offerings. Build your feature library first, then create packages here.
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {packages.map((pkg) => (
          <PackageCard
            key={pkg.id}
            pkg={pkg}
            allFeatures={allFeatures}
            onPatch={(k, v) => patchPkg(pkg.id, k, v)}
            onRemove={() => setPackages(packages.filter((x) => x.id !== pkg.id))}
          />
        ))}
      </div>
      <Button
        variant="outline"
        onClick={() => setPackages([...packages, { id: uid("pkg"), name: "New package", tagline: "", featureIds: [] }])}
      >
        <Package className="size-4" /> New package
      </Button>
    </div>
  );
}

// ── Module ────────────────────────────────────────────────────────────────────

export function FeaturesModule({ projectId }: { projectId: string }) {
  const { data: ws } = useProject(projectId);
  const updateProject = useUpdateProject(projectId);

  const features = useMemo((): FeaturesDoc => {
    if (!ws) return { groups: [], packages: [] };
    const raw = (ws.project.startup as { features?: Partial<FeaturesDoc> } | null)?.features;
    return { groups: raw?.groups ?? [], packages: raw?.packages ?? [] };
  }, [ws]);

  if (!ws) return null;

  function save(patch: Partial<FeaturesDoc>) {
    const next: FeaturesDoc = { ...features, ...patch };
    const startup = (ws!.project.startup as Record<string, unknown>) ?? {};
    updateProject.mutate(
      { startup: { ...startup, features: next } },
      { onError: (e) => toast.error((e as Error).message) },
    );
  }

  return (
    <div>
      <ModuleHeader
        title="Features & packages"
        description="Build your feature library grouped by category, then bundle them into sellable packages."
      />
      <Tabs defaultValue="library">
        <TabsList className="mb-6">
          <TabsTrigger value="packages" className="gap-1.5 text-xs">
            <Package className="size-3.5" /> Packages {features.packages.length > 0 && <Badge variant="secondary" className="ml-1 text-[10px]">{features.packages.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="library" className="gap-1.5 text-xs">
            <Library className="size-3.5" /> Feature library {features.groups.length > 0 && <Badge variant="secondary" className="ml-1 text-[10px]">{features.groups.reduce((s, g) => s + g.items.length, 0)}</Badge>}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="library">
          <LibraryTab
            groups={features.groups}
            setGroups={(groups) => save({ groups })}
          />
        </TabsContent>
        <TabsContent value="packages">
          <PackagesTab
            packages={features.packages}
            groups={features.groups}
            setPackages={(packages) => save({ packages })}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
