/* Accent color names used across the app (tags, phases, members, projects,
   org nodes, tracks) → Tailwind utility classes.

   Values are wired to the Atlas 8-hue track palette (`--t-*` custom
   properties set in app/globals.css, oklch L≈.64 C≈.10-.16, one hue per
   name) via Tailwind v4 arbitrary values, so `accent(name)` renders the
   exact hues from the reference design system rather than generic
   Tailwind color steps. */

export type Accent =
  | "blue"
  | "indigo"
  | "teal"
  | "green"
  | "amber"
  | "red"
  | "pink"
  | "purple";

export const ACCENTS: Accent[] = [
  "blue",
  "indigo",
  "teal",
  "green",
  "amber",
  "red",
  "pink",
  "purple",
];

const MAP: Record<string, { bg: string; text: string; dot: string; soft: string }> = {
  blue: {
    bg: "bg-[var(--t-blue)]",
    text: "text-[var(--t-blue)]",
    dot: "bg-[var(--t-blue)]",
    soft: "bg-[color-mix(in_oklch,var(--t-blue)_14%,var(--panel))] text-[color-mix(in_oklch,var(--t-blue)_70%,var(--ink))]",
  },
  indigo: {
    bg: "bg-[var(--t-indigo)]",
    text: "text-[var(--t-indigo)]",
    dot: "bg-[var(--t-indigo)]",
    soft: "bg-[color-mix(in_oklch,var(--t-indigo)_14%,var(--panel))] text-[color-mix(in_oklch,var(--t-indigo)_70%,var(--ink))]",
  },
  teal: {
    bg: "bg-[var(--t-teal)]",
    text: "text-[var(--t-teal)]",
    dot: "bg-[var(--t-teal)]",
    soft: "bg-[color-mix(in_oklch,var(--t-teal)_14%,var(--panel))] text-[color-mix(in_oklch,var(--t-teal)_70%,var(--ink))]",
  },
  green: {
    bg: "bg-[var(--t-green)]",
    text: "text-[var(--t-green)]",
    dot: "bg-[var(--t-green)]",
    soft: "bg-[color-mix(in_oklch,var(--t-green)_14%,var(--panel))] text-[color-mix(in_oklch,var(--t-green)_70%,var(--ink))]",
  },
  amber: {
    bg: "bg-[var(--t-amber)]",
    text: "text-[var(--t-amber)]",
    dot: "bg-[var(--t-amber)]",
    soft: "bg-[color-mix(in_oklch,var(--t-amber)_14%,var(--panel))] text-[color-mix(in_oklch,var(--t-amber)_70%,var(--ink))]",
  },
  red: {
    bg: "bg-[var(--t-red)]",
    text: "text-[var(--t-red)]",
    dot: "bg-[var(--t-red)]",
    soft: "bg-[color-mix(in_oklch,var(--t-red)_14%,var(--panel))] text-[color-mix(in_oklch,var(--t-red)_70%,var(--ink))]",
  },
  pink: {
    bg: "bg-[var(--t-pink)]",
    text: "text-[var(--t-pink)]",
    dot: "bg-[var(--t-pink)]",
    soft: "bg-[color-mix(in_oklch,var(--t-pink)_14%,var(--panel))] text-[color-mix(in_oklch,var(--t-pink)_70%,var(--ink))]",
  },
  purple: {
    bg: "bg-[var(--t-purple)]",
    text: "text-[var(--t-purple)]",
    dot: "bg-[var(--t-purple)]",
    soft: "bg-[color-mix(in_oklch,var(--t-purple)_14%,var(--panel))] text-[color-mix(in_oklch,var(--t-purple)_70%,var(--ink))]",
  },
};

const FALLBACK = MAP.indigo;

export function accent(name: string | null | undefined) {
  return (name && MAP[name]) || FALLBACK;
}

export function accentFromString(seed: string): Accent {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return ACCENTS[h % ACCENTS.length];
}

/** Raw CSS var for a track/tag hue — for inline styles (SVG strokes, charts). */
export function accentVar(name: string | null | undefined): string {
  const key = name && MAP[name] ? name : "indigo";
  return `var(--t-${key})`;
}
