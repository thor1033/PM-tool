/* Accent color names used across the legacy app (tags, phases, members,
   projects, org nodes) → Tailwind utility classes. */

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
  blue: { bg: "bg-blue-500", text: "text-blue-700 dark:text-blue-300", dot: "bg-blue-500", soft: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200" },
  indigo: { bg: "bg-indigo-500", text: "text-indigo-700 dark:text-indigo-300", dot: "bg-indigo-500", soft: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200" },
  teal: { bg: "bg-teal-500", text: "text-teal-700 dark:text-teal-300", dot: "bg-teal-500", soft: "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-200" },
  green: { bg: "bg-green-500", text: "text-green-700 dark:text-green-300", dot: "bg-green-500", soft: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200" },
  amber: { bg: "bg-amber-500", text: "text-amber-700 dark:text-amber-300", dot: "bg-amber-500", soft: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200" },
  red: { bg: "bg-red-500", text: "text-red-700 dark:text-red-300", dot: "bg-red-500", soft: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200" },
  pink: { bg: "bg-pink-500", text: "text-pink-700 dark:text-pink-300", dot: "bg-pink-500", soft: "bg-pink-100 text-pink-800 dark:bg-pink-950 dark:text-pink-200" },
  purple: { bg: "bg-purple-500", text: "text-purple-700 dark:text-purple-300", dot: "bg-purple-500", soft: "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-200" },
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
