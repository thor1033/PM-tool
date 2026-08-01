"use client";

import { useEffect, useRef, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, List, FileText, Users } from "lucide-react";
import { useProject, useUpdateProject } from "@/lib/api/hooks";
import { blankStartup } from "@/lib/templates";
import { ModuleHeader } from "@/components/project/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { WorkingSet } from "@/lib/types";

// ── Types ─────────────────────────────────────────────────────────────────────

type StartupDoc = ReturnType<typeof blankStartup> & {
  valueProp: {
    headline: string;
    segments: {
      id: string; segment: string; context?: string;
      jobs: string[]; pains: string[]; gains: string[];
      products?: string[]; relievers?: string[]; creators?: string[];
    }[];
  };
  gtm: {
    motion: string; channels: string[]; launch: string[];
    pricing?: { id: string; tier: string; price: string; includes: string[] }[];
  };
  bmc: Record<string, unknown> & { _mode?: Record<string, "list" | "notes"> };
  lean: Record<string, unknown>;
};

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}`;
}

// ── useStartup hook ───────────────────────────────────────────────────────────

function useStartup(ws: WorkingSet, updateProject: ReturnType<typeof useUpdateProject>) {
  const startup = useMemo((): StartupDoc => {
    const raw = ws.project.startup as Partial<StartupDoc> | null;
    const blank = blankStartup() as StartupDoc;
    if (!raw) return blank;
    return {
      mission:   { ...blank.mission,   ...(raw.mission   ?? {}) },
      valueProp: { ...blank.valueProp, ...(raw.valueProp ?? {}) },
      bmc:       raw.bmc   ?? {},
      lean:      raw.lean  ?? {},
      personas:  raw.personas  ?? [],
      market:    { ...blank.market, ...(raw.market ?? {}) },
      gtm:       { ...blank.gtm,   ...(raw.gtm   ?? {}) },
      features:  raw.features ?? blank.features,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws.project.startup]);

  function setKey<K extends keyof StartupDoc>(
    k: K,
    v: StartupDoc[K] | ((prev: StartupDoc[K]) => StartupDoc[K]),
  ) {
    const next = typeof v === "function" ? (v as (p: StartupDoc[K]) => StartupDoc[K])(startup[k]) : v;
    updateProject.mutate(
      { startup: { ...startup, [k]: next } },
      { onError: (e) => toast.error((e as Error).message) },
    );
  }

  return [startup, setKey] as const;
}

// ── Shared primitives ─────────────────────────────────────────────────────────

function StrList({ items, onChange, placeholder = "Add item…", accentCls = "" }: {
  items?: string[]; onChange: (v: string[]) => void; placeholder?: string; accentCls?: string;
}) {
  const list = items ?? [];
  function add() { onChange([...list, ""]); }
  return (
    <div className="space-y-0.5">
      {list.map((item, i) => (
        <div key={i} className="group flex items-center gap-1">
          <span className={cn("mt-0.5 size-1.5 shrink-0 rounded-full", accentCls || "bg-muted-foreground/40")} />
          <input
            className="min-w-0 flex-1 border-0 bg-transparent py-0.5 text-sm outline-none placeholder:text-muted-foreground/40"
            value={item}
            onChange={(e) => onChange(list.map((x, j) => (j === i ? e.target.value : x)))}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); add(); }
              if (e.key === "Backspace" && !item) onChange(list.filter((_, j) => j !== i));
            }}
            placeholder={placeholder}
          />
          <button
            onClick={() => onChange(list.filter((_, j) => j !== i))}
            className="shrink-0 text-muted-foreground/30 opacity-0 hover:text-muted-foreground group-hover:opacity-100"
          >×</button>
        </div>
      ))}
      <button onClick={add} className="mt-1 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <Plus className="size-3" /> Add
      </button>
    </div>
  );
}

function AutoTextarea({ value, onChange, placeholder, className }: {
  value: string; onChange: (v: string) => void; placeholder?: string; className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    ref.current.style.height = "auto";
    ref.current.style.height = ref.current.scrollHeight + "px";
  }, [value]);
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={3}
      className={cn(
        "w-full resize-none rounded-md bg-transparent p-1 text-sm leading-relaxed outline-none ring-inset focus:ring-1 focus:ring-border",
        className,
      )}
    />
  );
}

function BoxLabel({ children }: { children: React.ReactNode }) {
  return <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{children}</p>;
}

function StgBox({ title, hint, children, className }: {
  title: string; hint?: string; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2 rounded-lg border bg-card p-3", className)}>
      <div>
        <p className="text-xs font-semibold">{title}</p>
        {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

// ── 1. Mission / Vision / Values ──────────────────────────────────────────────

function MissionTab({ st, set }: { st: StartupDoc; set: ReturnType<typeof useStartup>[1] }) {
  const m = st.mission;
  const patch = (k: string, v: unknown) => set("mission", { ...m, [k]: v });
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <StgBox title="Mission" hint="Why the organisation exists.">
          <AutoTextarea value={m.mission} onChange={(v) => patch("mission", v)} placeholder="We exist to…" />
        </StgBox>
        <StgBox title="Vision" hint="Where you want to be in 5–10 years.">
          <AutoTextarea value={m.vision} onChange={(v) => patch("vision", v)} placeholder="By 2030 we will…" />
        </StgBox>
      </div>
      <StgBox title="Core values" hint="The principles that guide how the team behaves.">
        <StrList items={m.values} onChange={(v) => patch("values", v)} placeholder="A value…" />
      </StgBox>
    </div>
  );
}

// ── 2. Value Proposition Canvas ───────────────────────────────────────────────

function SegCard({ seg, onPatch, onRemove }: {
  seg: StartupDoc["valueProp"]["segments"][number];
  onPatch: (k: string, v: unknown) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <Users className="size-4 text-muted-foreground" />
        <input
          className="min-w-0 flex-1 border-0 bg-transparent text-sm font-semibold outline-none placeholder:text-muted-foreground/40"
          value={seg.segment}
          onChange={(e) => onPatch("segment", e.target.value)}
          placeholder="Client type (e.g. Startups)"
        />
        <button onClick={onRemove} className="text-muted-foreground/40 hover:text-muted-foreground">
          <Trash2 className="size-3.5" />
        </button>
      </div>
      <input
        className="mb-3 w-full border-0 bg-transparent text-xs text-muted-foreground outline-none placeholder:text-muted-foreground/40"
        value={seg.context ?? ""}
        onChange={(e) => onPatch("context", e.target.value)}
        placeholder="One-line context — size, stage, situation…"
      />
      <div className="grid grid-cols-2 gap-4">
        <div>
          <BoxLabel>Their world</BoxLabel>
          <div className="space-y-3">
            <div>
              <BoxLabel>Jobs — what they're trying to get done</BoxLabel>
              <StrList items={seg.jobs} onChange={(v) => onPatch("jobs", v)} accentCls="bg-indigo-400" />
            </div>
            <div>
              <BoxLabel>Pains — what frustrates them</BoxLabel>
              <StrList items={seg.pains} onChange={(v) => onPatch("pains", v)} accentCls="bg-red-400" />
            </div>
            <div>
              <BoxLabel>Gains — what a good outcome looks like</BoxLabel>
              <StrList items={seg.gains} onChange={(v) => onPatch("gains", v)} accentCls="bg-teal-400" />
            </div>
          </div>
        </div>
        <div>
          <BoxLabel>How we answer it</BoxLabel>
          <div className="space-y-3">
            <div>
              <BoxLabel>Products & services</BoxLabel>
              <StrList items={seg.products ?? []} onChange={(v) => onPatch("products", v)} accentCls="bg-blue-400" />
            </div>
            <div>
              <BoxLabel>Pain relievers</BoxLabel>
              <StrList items={seg.relievers ?? []} onChange={(v) => onPatch("relievers", v)} accentCls="bg-green-400" />
            </div>
            <div>
              <BoxLabel>Gain creators</BoxLabel>
              <StrList items={seg.creators ?? []} onChange={(v) => onPatch("creators", v)} accentCls="bg-amber-400" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ValuePropTab({ st, set }: { st: StartupDoc; set: ReturnType<typeof useStartup>[1] }) {
  const vp = st.valueProp;
  const segs = vp.segments ?? [];
  const setVP = (k: string, v: unknown) => set("valueProp", { ...vp, [k]: v });
  const patchSeg = (id: string, k: string, v: unknown) =>
    setVP("segments", segs.map((x) => x.id === id ? { ...x, [k]: v } : x));

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card p-4">
        <Label className="text-xs text-muted-foreground">Headline value proposition</Label>
        <AutoTextarea
          value={vp.headline}
          onChange={(v) => setVP("headline", v)}
          placeholder="We help [customer] achieve [outcome] by [how], unlike [alternative]."
          className="mt-1 text-base font-medium"
        />
      </div>
      {segs.map((sg) => (
        <SegCard
          key={sg.id}
          seg={sg}
          onPatch={(k, v) => patchSeg(sg.id, k, v)}
          onRemove={() => setVP("segments", segs.filter((x) => x.id !== sg.id))}
        />
      ))}
      <Button variant="outline" onClick={() => setVP("segments", [...segs, { id: uid("seg"), segment: "", context: "", jobs: [], pains: [], gains: [], products: [], relievers: [], creators: [] }])}>
        <Plus className="size-4" /> Add client type
      </Button>
    </div>
  );
}

// ── 3. Business Model Canvas ──────────────────────────────────────────────────

const BMC_BLOCKS: [string, string, string][] = [
  ["partners",      "Key Partners",          "Who helps us deliver?"],
  ["activities",    "Key Activities",         "What must we do well?"],
  ["resources",     "Key Resources",          "What assets do we need?"],
  ["value",         "Value Propositions",     "What value do we deliver?"],
  ["relationships", "Customer Relationships", "How do we engage them?"],
  ["channels",      "Channels",               "How do we reach them?"],
  ["segments",      "Customer Segments",      "Who are we serving?"],
  ["costs",         "Cost Structure",          "What drives our costs?"],
  ["revenue",       "Revenue Streams",         "How do we earn?"],
];

// explicit CSS grid placement — same 5-col layout as the BMC reference
const BMC_STYLE: Record<string, React.CSSProperties> = {
  partners:      { gridColumn: "1",     gridRow: "1 / 3" },
  activities:    { gridColumn: "2",     gridRow: "1"     },
  resources:     { gridColumn: "2",     gridRow: "2"     },
  value:         { gridColumn: "3",     gridRow: "1 / 3" },
  relationships: { gridColumn: "4",     gridRow: "1"     },
  channels:      { gridColumn: "4",     gridRow: "2"     },
  segments:      { gridColumn: "5",     gridRow: "1 / 3" },
  costs:         { gridColumn: "1 / 4", gridRow: "3"     },
  revenue:       { gridColumn: "4 / 6", gridRow: "3"     },
};

function BmcBlock({ blockKey, title, hint, bmc, onPatch, onMode }: {
  blockKey: string; title: string; hint: string;
  bmc: StartupDoc["bmc"];
  onPatch: (k: string, v: unknown) => void;
  onMode: (k: string, m: "list" | "notes") => void;
}) {
  const mode = (bmc._mode?.[blockKey]) ?? "list";
  return (
    <div className="flex flex-col gap-1.5 overflow-hidden rounded-lg border bg-card p-3" style={BMC_STYLE[blockKey]}>
      <div className="flex items-center justify-between gap-1">
        <p className="text-xs font-semibold">{title}</p>
        <div className="flex gap-0.5">
          <button
            title="Bullet list"
            onClick={() => onMode(blockKey, "list")}
            className={cn("rounded p-0.5", mode === "list" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")}
          ><List className="size-3" /></button>
          <button
            title="Free text"
            onClick={() => onMode(blockKey, "notes")}
            className={cn("rounded p-0.5", mode === "notes" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")}
          ><FileText className="size-3" /></button>
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground">{hint}</p>
      {mode === "notes" ? (
        <AutoTextarea
          value={(bmc[blockKey + "_note"] as string) ?? ""}
          onChange={(v) => onPatch(blockKey + "_note", v)}
          placeholder="Write as much as you need…"
        />
      ) : (
        <StrList
          items={(bmc[blockKey] as string[] | undefined)}
          onChange={(v) => onPatch(blockKey, v)}
        />
      )}
    </div>
  );
}

function BMCTab({ st, set }: { st: StartupDoc; set: ReturnType<typeof useStartup>[1] }) {
  const bmc = st.bmc;
  const patch = (k: string, v: unknown) => set("bmc", { ...bmc, [k]: v });
  const setMode = (k: string, m: "list" | "notes") =>
    set("bmc", { ...bmc, _mode: { ...(bmc._mode ?? {}), [k]: m } });

  return (
    <div>
      <p className="mb-4 text-sm text-muted-foreground">
        The nine building blocks of how the business creates, delivers and captures value.
        Toggle any block between bullet list and free-form notes.
      </p>
      <div
        className="grid gap-px bg-border rounded-xl overflow-hidden"
        style={{ gridTemplateColumns: "repeat(5, 1fr)", gridTemplateRows: "1fr 1fr auto" }}
      >
        {BMC_BLOCKS.map(([k, title, hint]) => (
          <BmcBlock key={k} blockKey={k} title={title} hint={hint} bmc={bmc} onPatch={patch} onMode={setMode} />
        ))}
      </div>
    </div>
  );
}

// ── 4. Lean Canvas ────────────────────────────────────────────────────────────

const LEAN_BLOCKS: [string, string, string][] = [
  ["problem",  "Problem",                   "Top 1–3 problems"],
  ["solution", "Solution",                  "Top features"],
  ["uvp",      "Unique Value Proposition",  "Single, clear, compelling message"],
  ["advantage","Unfair Advantage",          "Can't be easily copied or bought"],
  ["segments", "Customer Segments",         "Target customers & users"],
  ["metrics",  "Key Metrics",               "Numbers that tell you how you're doing"],
  ["channels", "Channels",                  "Path to customers"],
  ["costs",    "Cost Structure",            "Customer acquisition, hosting, people…"],
  ["revenue",  "Revenue Streams",           "Revenue model, pricing, LTV"],
];

const LEAN_STYLE: Record<string, React.CSSProperties> = {
  problem:  { gridColumn: "1",     gridRow: "1 / 3" },
  solution: { gridColumn: "2",     gridRow: "1"     },
  metrics:  { gridColumn: "2",     gridRow: "2"     },
  uvp:      { gridColumn: "3",     gridRow: "1 / 3" },
  advantage:{ gridColumn: "4",     gridRow: "1"     },
  channels: { gridColumn: "4",     gridRow: "2"     },
  segments: { gridColumn: "5",     gridRow: "1 / 3" },
  costs:    { gridColumn: "1 / 4", gridRow: "3"     },
  revenue:  { gridColumn: "4 / 6", gridRow: "3"     },
};

function LeanTab({ st, set }: { st: StartupDoc; set: ReturnType<typeof useStartup>[1] }) {
  const lean = st.lean;
  const patch = (k: string, v: string[]) => set("lean", { ...lean, [k]: v });
  return (
    <div>
      <p className="mb-4 text-sm text-muted-foreground">
        A one-page startup model — the leaner, problem/risk-focused cousin of the Business Model Canvas.
      </p>
      <div
        className="grid gap-px bg-border rounded-xl overflow-hidden"
        style={{ gridTemplateColumns: "repeat(5, 1fr)", gridTemplateRows: "1fr 1fr auto" }}
      >
        {LEAN_BLOCKS.map(([k, title, hint]) => (
          <div
            key={k}
            className="flex flex-col gap-1.5 overflow-hidden rounded-lg border bg-card p-3"
            style={LEAN_STYLE[k]}
          >
            <p className="text-xs font-semibold">{title}</p>
            <p className="text-[10px] text-muted-foreground">{hint}</p>
            <StrList items={(lean[k] as string[] | undefined)} onChange={(v) => patch(k, v)} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 5. Personas / ICP ─────────────────────────────────────────────────────────

function PersonasTab({ st, set }: { st: StartupDoc; set: ReturnType<typeof useStartup>[1] }) {
  const list = st.personas;
  const patch = (id: string, k: string, v: unknown) =>
    set("personas", list.map((x) => x.id === id ? { ...x, [k]: v } : x));
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((p) => (
          <div key={p.id} className="rounded-xl border bg-card p-4 space-y-3">
            <div className="flex items-start gap-2">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted">
                <Users className="size-4 text-muted-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <input
                  className="w-full border-0 bg-transparent text-sm font-semibold outline-none placeholder:text-muted-foreground/40"
                  value={p.name}
                  onChange={(e) => patch(p.id, "name", e.target.value)}
                  placeholder="Persona name"
                />
                <input
                  className="w-full border-0 bg-transparent text-xs text-muted-foreground outline-none placeholder:text-muted-foreground/40"
                  value={p.role}
                  onChange={(e) => patch(p.id, "role", e.target.value)}
                  placeholder="Role / title"
                />
              </div>
              <button onClick={() => set("personas", list.filter((x) => x.id !== p.id))} className="text-muted-foreground/40 hover:text-muted-foreground">
                <Trash2 className="size-3.5" />
              </button>
            </div>
            <input
              className="w-full border-0 bg-transparent text-xs text-muted-foreground outline-none placeholder:text-muted-foreground/40"
              value={p.segment}
              onChange={(e) => patch(p.id, "segment", e.target.value)}
              placeholder="Segment / company type"
            />
            <div>
              <BoxLabel>Goals / jobs</BoxLabel>
              <StrList items={p.goals} onChange={(v) => patch(p.id, "goals", v)} accentCls="bg-teal-400" />
            </div>
            <div>
              <BoxLabel>Pains</BoxLabel>
              <StrList items={p.pains} onChange={(v) => patch(p.id, "pains", v)} accentCls="bg-red-400" />
            </div>
            <div>
              <BoxLabel>Notes</BoxLabel>
              <AutoTextarea value={p.note} onChange={(v) => patch(p.id, "note", v)} placeholder="Context, quote, behaviour…" />
            </div>
          </div>
        ))}
      </div>
      <Button variant="outline" onClick={() => set("personas", [...list, { id: uid("per"), name: "", role: "", segment: "", goals: [], pains: [], note: "" }])}>
        <Plus className="size-4" /> Add persona
      </Button>
    </div>
  );
}

// ── 6. Market & Competition ───────────────────────────────────────────────────

function MarketTab({ st, set }: { st: StartupDoc; set: ReturnType<typeof useStartup>[1] }) {
  const mk = st.market;
  const patch = (k: string, v: unknown) => set("market", { ...mk, [k]: v });
  const comp = mk.competitors ?? [];
  const patchC = (id: string, k: string, v: string) =>
    patch("competitors", comp.map((x) => x.id === id ? { ...x, [k]: v } : x));

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        {([["tam", "TAM", "Total addressable market"], ["sam", "SAM", "Serviceable available market"], ["som", "SOM", "Serviceable obtainable market"]] as const).map(([k, label, hint]) => (
          <StgBox key={k} title={label} hint={hint}>
            <AutoTextarea value={(mk as unknown as Record<string, string>)[k] ?? ""} onChange={(v) => patch(k, v)} placeholder="€ or unit size…" />
          </StgBox>
        ))}
      </div>
      <StgBox title="Positioning statement" hint="How you win against alternatives.">
        <AutoTextarea value={mk.positioning} onChange={(v) => patch("positioning", v)} placeholder="For [segment] who [need], [product] is the [category] that [benefit], unlike [alternatives]." />
      </StgBox>
      <div>
        <p className="mb-2 text-sm font-semibold">Competitors</p>
        <div className="space-y-2">
          {comp.map((c) => (
            <div key={c.id} className="flex items-start gap-2 rounded-lg border p-3">
              <Input
                className="h-7 w-40 shrink-0 text-sm"
                value={c.name}
                onChange={(e) => patchC(c.id, "name", e.target.value)}
                placeholder="Name"
              />
              <AutoTextarea value={c.note} onChange={(v) => patchC(c.id, "note", v)} placeholder="Strengths, weaknesses, differentiators…" className="flex-1" />
              <button onClick={() => patch("competitors", comp.filter((x) => x.id !== c.id))} className="shrink-0 text-muted-foreground/40 hover:text-muted-foreground mt-1">
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
        <Button variant="outline" size="sm" className="mt-2" onClick={() => patch("competitors", [...comp, { id: uid("comp"), name: "", note: "" }])}>
          <Plus className="size-3.5" /> Add competitor
        </Button>
      </div>
    </div>
  );
}

// ── 7. Go-to-Market ───────────────────────────────────────────────────────────

function GTMTab({ st, set }: { st: StartupDoc; set: ReturnType<typeof useStartup>[1] }) {
  const g = st.gtm;
  const patch = (k: string, v: unknown) => set("gtm", { ...g, [k]: v });
  const pricing = g.pricing ?? [];
  const patchT = (id: string, k: string, v: unknown) =>
    patch("pricing", pricing.map((x) => x.id === id ? { ...x, [k]: v } : x));

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <StgBox title="Sales motion" hint="How deals actually get done (self-serve, inside sales, partner-led…).">
          <AutoTextarea value={g.motion} onChange={(v) => patch("motion", v)} placeholder="Describe how a prospect becomes a paying customer…" />
        </StgBox>
        <StgBox title="Channels" hint="Where you find and reach your customers.">
          <StrList items={g.channels} onChange={(v) => patch("channels", v)} accentCls="bg-blue-400" />
        </StgBox>
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold">Pricing tiers</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {pricing.map((t) => (
            <div key={t.id} className="relative rounded-xl border bg-card p-3">
              <button onClick={() => patch("pricing", pricing.filter((x) => x.id !== t.id))} className="absolute right-2 top-2 text-muted-foreground/40 hover:text-muted-foreground">
                <Trash2 className="size-3" />
              </button>
              <input
                className="w-full border-0 bg-transparent text-sm font-semibold outline-none placeholder:text-muted-foreground/40"
                value={t.tier}
                onChange={(e) => patchT(t.id, "tier", e.target.value)}
                placeholder="Tier name"
              />
              <input
                className="mt-1 w-full border-0 bg-transparent text-xl font-bold outline-none placeholder:text-muted-foreground/40"
                value={t.price}
                onChange={(e) => patchT(t.id, "price", e.target.value)}
                placeholder="€ —"
              />
              <BoxLabel>Includes</BoxLabel>
              <StrList items={t.includes} onChange={(v) => patchT(t.id, "includes", v)} />
            </div>
          ))}
          <Button
            variant="outline"
            className="h-auto rounded-xl py-4 text-muted-foreground"
            onClick={() => patch("pricing", [...pricing, { id: uid("tier"), tier: "", price: "", includes: [] }])}
          >
            <Plus className="size-4" /> Add tier
          </Button>
        </div>
      </div>

      <StgBox title="Launch plan" hint="The sequence of moves to get to first customers.">
        <StrList items={g.launch} onChange={(v) => patch("launch", v)} accentCls="bg-amber-400" />
      </StgBox>
    </div>
  );
}

// ── Module ────────────────────────────────────────────────────────────────────

const TAB_ITEMS = [
  { value: "mission",   label: "Mission" },
  { value: "valueprop", label: "Value prop" },
  { value: "bmc",       label: "BMC" },
  { value: "lean",      label: "Lean canvas" },
  { value: "personas",  label: "Personas" },
  { value: "market",    label: "Market" },
  { value: "gtm",       label: "Go-to-market" },
] as const;

export function StrategyModule({ projectId }: { projectId: string }) {
  const { data: ws } = useProject(projectId);
  const updateProject = useUpdateProject(projectId);

  if (!ws) return null;

  const [startup, setKey] = useStartup(ws, updateProject);

  return (
    <div>
      <ModuleHeader
        title="Strategy"
        description="Mission, value proposition, canvases, personas, market and go-to-market."
      />
      <Tabs defaultValue="mission">
        <TabsList className="mb-6 flex-wrap h-auto gap-1">
          {TAB_ITEMS.map((t) => (
            <TabsTrigger key={t.value} value={t.value} className="text-xs">{t.label}</TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="mission">
          <MissionTab st={startup} set={setKey} />
        </TabsContent>
        <TabsContent value="valueprop">
          <ValuePropTab st={startup} set={setKey} />
        </TabsContent>
        <TabsContent value="bmc">
          <BMCTab st={startup} set={setKey} />
        </TabsContent>
        <TabsContent value="lean">
          <LeanTab st={startup} set={setKey} />
        </TabsContent>
        <TabsContent value="personas">
          <PersonasTab st={startup} set={setKey} />
        </TabsContent>
        <TabsContent value="market">
          <MarketTab st={startup} set={setKey} />
        </TabsContent>
        <TabsContent value="gtm">
          <GTMTab st={startup} set={setKey} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
