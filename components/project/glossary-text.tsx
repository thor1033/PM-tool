"use client";

import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";

interface Term {
  id: string;
  term: string;
  definition: string;
}

/** Renders `text` with glossary terms underlined and wrapped in a hover-card definition. */
export function GlossaryText({ text, terms }: { text: string; terms: Term[] }) {
  const active = terms.filter((t) => t.term && t.definition);
  if (!active.length || !text) return <>{text}</>;

  const sorted = [...active].sort((a, b) => b.term.length - a.term.length);
  const escaped = sorted.map((t) => t.term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`(${escaped.join("|")})`, "gi");
  const parts = text.split(pattern);

  return (
    <>
      {parts.map((part, i) => {
        const match = sorted.find((t) => t.term.toLowerCase() === part.toLowerCase());
        if (!match) return part;
        return (
          <HoverCard key={i} openDelay={250} closeDelay={100}>
            <HoverCardTrigger asChild>
              <span className="cursor-help underline decoration-dotted underline-offset-2">
                {part}
              </span>
            </HoverCardTrigger>
            <HoverCardContent side="top" className="w-72">
              <p className="mb-1 text-sm font-semibold">{match.term}</p>
              <p className="text-sm text-muted-foreground leading-snug">
                {match.definition}
              </p>
            </HoverCardContent>
          </HoverCard>
        );
      })}
    </>
  );
}
