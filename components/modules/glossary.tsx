"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Search, X, ClipboardPaste, Tag } from "lucide-react";
import { useProject, useUpdateProject } from "@/lib/api/hooks";
import { cn } from "@/lib/utils";
import { ModuleHeader } from "@/components/project/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

interface Term {
  id: string;
  term: string;
  definition: string;
}

function newId() {
  return `gl_${Math.random().toString(36).slice(2, 8)}`;
}

// ── bulk parsing ─────────────────────────────────────────────────────────────

/** A colon always wins as the separator; a dash only counts when surrounded by
 *  spaces, so hyphenated terms ("single-sign-on: …") stay intact. */
const COLON_SEP = /^([^:]+):\s*(.*)$/;
const DASH_SEP = /^(.+?)\s+[-–—]\s+(.*)$/;

/** Accepts either a bare list ("SSO, ETL; UAT") or one "term: definition" per
 *  line. Commas only split a line that has no separator, so commas inside a
 *  definition are kept as content. */
export function parseGlossaryBulk(raw: string): { term: string; definition: string }[] {
  const out: { term: string; definition: string }[] = [];
  raw.split(/[\n;]+/).map((l) => l.trim()).filter(Boolean).forEach((line) => {
    const m = line.match(COLON_SEP) ?? line.match(DASH_SEP);
    if (m) {
      out.push({ term: m[1].trim(), definition: m[2].trim() });
      return;
    }
    line.split(",").map((p) => p.trim()).filter(Boolean)
      .forEach((term) => out.push({ term, definition: "" }));
  });
  return out.filter((t) => t.term);
}

function BulkImport({ existing, onAdd, onClose }: {
  existing: Term[];
  onAdd: (terms: { term: string; definition: string }[]) => void;
  onClose: () => void;
}) {
  const [raw, setRaw] = useState("");
  const [skipDupes, setSkipDupes] = useState(true);

  const parsed = useMemo(() => parseGlossaryBulk(raw), [raw]);
  const have = useMemo(
    () => new Set(existing.map((t) => t.term.trim().toLowerCase())),
    [existing],
  );
  const { fresh, dupes } = useMemo(() => {
    const seen = new Set<string>();
    const fresh: { term: string; definition: string }[] = [];
    let dupes = 0;
    parsed.forEach((t) => {
      const key = t.term.toLowerCase();
      // Duplicates within the paste itself count too, or the same term would
      // be added twice in one go.
      if (seen.has(key) || (skipDupes && have.has(key))) { dupes += 1; return; }
      seen.add(key);
      fresh.push(t);
    });
    return { fresh, dupes };
  }, [parsed, have, skipDupes]);

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="no-gloss sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-serif-display font-medium">Paste a list</DialogTitle>
        </DialogHeader>

        <p className="text-muted-foreground text-[13.5px] leading-relaxed">
          One per line, or separated by commas or semicolons. Add a definition
          after a colon or a dash — <span className="font-mono">SSO: single sign-on</span>.
        </p>

        <Textarea
          autoFocus
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          rows={8}
          placeholder={"SSO: single sign-on\nETL - extract, transform, load\nUAT, CI/CD"}
          className="font-mono text-[13px]"
        />

        <label className="flex items-center gap-2 text-[13.5px]">
          <input
            type="checkbox"
            checked={skipDupes}
            onChange={(e) => setSkipDupes(e.target.checked)}
            className="size-3.5"
          />
          Skip terms that already exist
        </label>

        {parsed.length > 0 && (
          <div className="rounded-[var(--radius-sm)] border bg-[var(--paper-2)] p-3">
            <p className="font-mono text-[11.5px] font-semibold uppercase tracking-wide text-[var(--ink-soft)]">
              Will add {fresh.length} term{fresh.length === 1 ? "" : "s"}
              {dupes > 0 && ` · ${dupes} duplicate${dupes === 1 ? "" : "s"} skipped`}
            </p>
            {fresh.length > 0 && (
              <ul className="mt-2 space-y-0.5">
                {fresh.slice(0, 8).map((t, i) => (
                  <li key={i} className="truncate text-[13px]">
                    <span className="font-medium">{t.term}</span>
                    {t.definition && <span className="text-muted-foreground"> — {t.definition}</span>}
                  </li>
                ))}
                {fresh.length > 8 && (
                  <li className="text-muted-foreground text-[12.5px]">
                    …and {fresh.length - 8} more
                  </li>
                )}
              </ul>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => { onAdd(fresh); onClose(); }} disabled={fresh.length === 0}>
            Add {fresh.length || ""} term{fresh.length === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── module ───────────────────────────────────────────────────────────────────

export function GlossaryModule({ projectId }: { projectId: string }) {
  const { data } = useProject(projectId);
  const update = useUpdateProject(projectId);
  const [query, setQuery] = useState("");
  const [bulkOpen, setBulkOpen] = useState(false);

  const items = useMemo(
    () => ((data?.project.glossary as Term[]) ?? []),
    [data],
  );

  const sorted = useMemo(
    () => [...items].sort((a, b) => a.term.localeCompare(b.term)),
    [items],
  );

  const q = query.trim().toLowerCase();
  const shown = useMemo(
    () => (q
      ? sorted.filter((t) =>
          t.term.toLowerCase().includes(q) || t.definition.toLowerCase().includes(q))
      : sorted),
    [sorted, q],
  );

  if (!data) return null;

  function commit(next: Term[]) {
    update.mutate({ glossary: next }, { onError: (e) => toast.error((e as Error).message) });
  }
  function add() {
    commit([...items, { id: newId(), term: "New term", definition: "" }]);
  }
  function addMany(terms: { term: string; definition: string }[]) {
    commit([...items, ...terms.map((t) => ({ id: newId(), ...t }))]);
  }
  function patch(id: string, key: "term" | "definition", value: string) {
    commit(items.map((t) => (t.id === id ? { ...t, [key]: value } : t)));
  }
  function remove(t: Term) {
    if (!confirm(`Remove “${t.term || "this term"}”?`)) return;
    commit(items.filter((x) => x.id !== t.id));
  }

  return (
    // The editor must never highlight its own terms, or every field would be
    // marked while you're typing in it.
    <div className="no-gloss">
      <ModuleHeader eyebrow="Insight" title="Glossary" />

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <p className="text-muted-foreground max-w-2xl text-[13.5px] leading-relaxed">
          Project-specific words and their meaning. Every term added here is
          automatically highlighted everywhere it appears in this project —
          hover any underlined word to read the definition.
        </p>
        <div className="flex shrink-0 items-center gap-2.5">
          <Button variant="outline" onClick={() => setBulkOpen(true)}>
            <ClipboardPaste className="size-4" /> Paste list
          </Button>
          <Button onClick={add}>
            <Plus className="size-4" /> Add term
          </Button>
        </div>
      </div>

      {items.length > 0 && (
        <div className="relative mb-5 w-full max-w-sm">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search terms and definitions…"
            className="h-10 pl-9"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2.5 -translate-y-1/2"
              aria-label="Clear search"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      )}

      {items.length === 0 ? (
        <div className="shadow-xs rounded-[var(--radius-lg)] border bg-[var(--panel)] p-12 text-center">
          <Tag className="text-muted-foreground/40 mx-auto mb-3 size-7" />
          <p className="font-serif-display text-[17px] font-medium">No terms yet</p>
          <p className="text-muted-foreground mt-1 text-[13.5px]">
            Define the acronyms and jargon specific to this engagement.
          </p>
          <div className="mt-5 flex items-center justify-center gap-2.5">
            <Button variant="outline" onClick={() => setBulkOpen(true)}>
              <ClipboardPaste className="size-4" /> Paste a list
            </Button>
            <Button onClick={add}>
              <Plus className="size-4" /> Add one
            </Button>
          </div>
        </div>
      ) : shown.length === 0 ? (
        <p className="text-muted-foreground py-12 text-center text-[13.5px]">
          No matches for “{query}”.
        </p>
      ) : (
        <div className="space-y-2.5">
          {shown.map((t) => (
            <div
              key={t.id}
              className="group shadow-xs rounded-[var(--radius-lg)] border bg-[var(--panel)] p-4 transition hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-3">
                <input
                  defaultValue={t.term}
                  placeholder="(unnamed)"
                  onBlur={(e) => {
                    if (e.target.value !== t.term) patch(t.id, "term", e.target.value);
                  }}
                  className="focus:border-primary min-w-0 flex-1 rounded-[var(--radius-sm)] border border-transparent bg-transparent px-2 py-1 font-serif-display text-[17px] font-medium outline-none hover:border-[var(--line)]"
                />
                <button
                  onClick={() => remove(t)}
                  className="text-muted-foreground hover:text-[var(--t-red)] mt-1 shrink-0 opacity-0 transition group-hover:opacity-100"
                  title="Remove term"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
              <textarea
                defaultValue={t.definition}
                placeholder="What does this term mean in this project?"
                rows={2}
                onBlur={(e) => {
                  if (e.target.value !== t.definition) patch(t.id, "definition", e.target.value);
                }}
                className={cn(
                  "focus:border-primary mt-1 w-full resize-y rounded-[var(--radius-sm)] border border-transparent bg-transparent px-2 py-1 text-[13.5px] leading-relaxed outline-none hover:border-[var(--line)]",
                  !t.definition && "text-muted-foreground",
                )}
              />
            </div>
          ))}
        </div>
      )}

      {bulkOpen && (
        <BulkImport
          existing={items}
          onAdd={addMany}
          onClose={() => setBulkOpen(false)}
        />
      )}
    </div>
  );
}
