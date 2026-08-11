"use client";

import { useMemo } from "react";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";

export interface Term {
  id: string;
  term: string;
  definition: string;
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Renders `text` with glossary terms underlined and hover-definable.
 *
 *  Marks are produced as React nodes rather than by rewriting the DOM: a
 *  highlighter that replaced rendered text nodes would break React's
 *  reconciliation (it removes nodes React still holds references to). */
export function GlossaryText({ text, terms }: { text: string; terms: Term[] }) {
  const { pattern, byLower } = useMemo(() => {
    const active = terms
      .filter((t) => t.term?.trim() && t.definition?.trim())
      // Longest first so multi-word terms win over substrings of themselves
      // ("landing zone" before "zone").
      .sort((a, b) => b.term.length - a.term.length);
    if (!active.length) return { pattern: null, byLower: new Map<string, Term>() };
    const alt = active.map((t) => escapeRegex(t.term.trim())).join("|");
    return {
      // Whole-word only: \b fails on terms with punctuation ("CI/CD"), so the
      // boundaries are asserted against word characters directly.
      pattern: new RegExp(`(?<![\\w-])(${alt})(?![\\w-])`, "gi"),
      byLower: new Map(active.map((t) => [t.term.trim().toLowerCase(), t])),
    };
  }, [terms]);

  if (!pattern || !text) return <>{text}</>;

  const parts = text.split(pattern);
  if (parts.length === 1) return <>{text}</>;

  return (
    <>
      {parts.map((part, i) => {
        const match = byLower.get(part.toLowerCase());
        if (!match) return part;
        return (
          <HoverCard key={i} openDelay={200} closeDelay={100}>
            <HoverCardTrigger asChild>
              <span className="cursor-help underline decoration-dotted decoration-[color-mix(in_oklch,var(--accent-c)_60%,transparent)] underline-offset-[3px]">
                {part}
              </span>
            </HoverCardTrigger>
            <HoverCardContent side="top" className="w-72">
              <p className="mb-1 text-sm font-semibold">{match.term}</p>
              <p className="text-muted-foreground text-sm leading-snug">
                {match.definition}
              </p>
            </HoverCardContent>
          </HoverCard>
        );
      })}
    </>
  );
}
