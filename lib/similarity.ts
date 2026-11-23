/* Finds tasks that say the same thing.
 *
 * The secretary agent turns meeting transcripts into tasks, and a transcript
 * restates the same topic many times — at one point fifteen near-identical
 * tasks. Nothing on the agent's side can tell "new" from "already there", so
 * this gives it the answer: how closely a draft overlaps what the project
 * already holds.
 *
 * Plain TF-IDF cosine over title and the start of the description. IDF is
 * computed over the project's own tasks, so words every task uses ("agent",
 * "hub", "build") count for little and the distinctive ones carry the match.
 * No model call: it runs on every create, so it has to be instant and free.
 * Transcripts are Danish while task text is mostly English, so the stop list
 * covers both and a crude suffix-strip folds plurals together in either. */

export interface Matchable {
  id: string;
  title: string;
  description?: string | null;
  status?: string;
}

const STOP = new Set(
  (
    "a an the and or of to in on for with from by at as is are be it its this that these those not no do does " +
    "we our us you your i he she they them their will can should must may have has had been into out up about " +
    "so if then than also more most all any each per via how what when where which who why " +
    "og i at er en et til af for med den det de som på har ikke vi os vores kan skal vil der om fra men så " +
    "også eller hvis når hvad hvem hvor hvordan være blive bliver blev lave laver lav "
  ).split(/\s+/),
);

/** Words that name the activity rather than the subject. "Build X" and
 *  "Write X" about the same X are the same task, so the verb must not be
 *  what two tasks are matched on. */
const FILLER = new Set(
  "build write make create add set define decide review check find get put let use new task tasks agent".split(
    " ",
  ),
);

function stem(w: string): string {
  if (w.length > 5 && w.endsWith("ing")) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith("ies")) return w.slice(0, -3) + "y";
  if (w.length > 4 && w.endsWith("es")) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s")) return w.slice(0, -1);
  if (w.length > 5 && (w.endsWith("erne") || w.endsWith("ene"))) return w.slice(0, -3);
  if (w.length > 4 && (w.endsWith("er") || w.endsWith("en") || w.endsWith("et"))) return w.slice(0, -2);
  return w;
}

export function tokens(text: string): string[] {
  return (text.toLowerCase().match(/[a-zæøå0-9]+/g) ?? [])
    .filter((w) => w.length > 2 && !STOP.has(w) && !FILLER.has(w))
    .map(stem);
}

/** Title counts three times: it is the part somebody chose carefully. The
 *  description is capped, because a long one is mostly background and would
 *  make every task look like every other. */
function bag(t: Pick<Matchable, "title" | "description">): Map<string, number> {
  const counts = new Map<string, number>();
  const add = (words: string[], weight: number) => {
    for (const w of words) counts.set(w, (counts.get(w) ?? 0) + weight);
  };
  add(tokens(t.title), 3);
  add(tokens((t.description ?? "").slice(0, 500)), 1);
  return counts;
}

interface Index {
  idf: (w: string) => number;
  vec: (b: Map<string, number>) => { v: Map<string, number>; norm: number };
}

function indexOf(docs: Map<string, number>[]): Index {
  const df = new Map<string, number>();
  for (const d of docs) for (const w of d.keys()) df.set(w, (df.get(w) ?? 0) + 1);
  const n = docs.length + 1;
  const idf = (w: string) => Math.log(1 + n / (1 + (df.get(w) ?? 0)));
  return {
    idf,
    vec(b) {
      const v = new Map<string, number>();
      let sum = 0;
      for (const [w, c] of b) {
        const x = (1 + Math.log(c)) * idf(w);
        v.set(w, x);
        sum += x * x;
      }
      return { v, norm: Math.sqrt(sum) };
    },
  };
}

function cosine(
  a: { v: Map<string, number>; norm: number },
  b: { v: Map<string, number>; norm: number },
): { score: number; shared: string[] } {
  if (!a.norm || !b.norm) return { score: 0, shared: [] };
  let dot = 0;
  const shared: { w: string; x: number }[] = [];
  const [small, big] = a.v.size <= b.v.size ? [a.v, b.v] : [b.v, a.v];
  for (const [w, x] of small) {
    const y = big.get(w);
    if (y !== undefined) {
      dot += x * y;
      shared.push({ w, x: x * y });
    }
  }
  shared.sort((p, q) => q.x - p.x);
  return { score: dot / (a.norm * b.norm), shared: shared.slice(0, 5).map((s) => s.w) };
}

export interface Similar {
  id: string;
  title: string;
  status?: string;
  /** 0–1. Roughly: above 0.5 say the same thing; 0.3–0.5 share a topic. */
  score: number;
  /** The distinctive words the two have in common — why they were matched. */
  sharedTerms: string[];
}

/** Existing tasks most like a draft, best first. */
export function similarTo(
  draft: Pick<Matchable, "title" | "description">,
  existing: Matchable[],
  opts: { minScore?: number; limit?: number } = {},
): Similar[] {
  const minScore = opts.minScore ?? 0.3;
  const bags = existing.map(bag);
  const draftBag = bag(draft);
  const index = indexOf([...bags, draftBag]);
  const q = index.vec(draftBag);
  const out: Similar[] = [];
  existing.forEach((t, i) => {
    const { score, shared } = cosine(q, index.vec(bags[i]));
    if (score >= minScore) {
      out.push({
        id: t.id,
        title: t.title,
        status: t.status,
        score: Math.round(score * 100) / 100,
        sharedTerms: shared,
      });
    }
  });
  return out.sort((a, b) => b.score - a.score).slice(0, opts.limit ?? 5);
}

/** The same draft written in several languages, checked against what exists.
 *  Matching is by shared words, so a Danish draft cannot find an English task
 *  and the reverse. Checking each wording and keeping each task's best score
 *  closes that gap: whichever language the existing task is in, one of the
 *  wordings shares its words. */
export function similarToAny(
  drafts: Pick<Matchable, "title" | "description">[],
  existing: Matchable[],
  opts: { minScore?: number; limit?: number } = {},
): Similar[] {
  const best = new Map<string, Similar>();
  for (const draft of drafts) {
    if (!draft.title.trim()) continue;
    for (const hit of similarTo(draft, existing, { ...opts, limit: existing.length })) {
      const prev = best.get(hit.id);
      if (!prev || hit.score > prev.score) best.set(hit.id, hit);
    }
  }
  return [...best.values()].sort((a, b) => b.score - a.score).slice(0, opts.limit ?? 5);
}

export interface OverlapPair {
  a: { id: string; title: string };
  b: { id: string; title: string };
  score: number;
  sharedTerms: string[];
}

/** Pairs among existing tasks that overlap enough to be worth merging. */
export function overlappingPairs(
  tasks: Matchable[],
  opts: { minScore?: number; limit?: number } = {},
): OverlapPair[] {
  const minScore = opts.minScore ?? 0.4;
  const bags = tasks.map(bag);
  const index = indexOf(bags);
  const vecs = bags.map((b) => index.vec(b));
  const out: OverlapPair[] = [];
  for (let i = 0; i < tasks.length; i++) {
    for (let j = i + 1; j < tasks.length; j++) {
      const { score, shared } = cosine(vecs[i], vecs[j]);
      if (score >= minScore) {
        out.push({
          a: { id: tasks[i].id, title: tasks[i].title },
          b: { id: tasks[j].id, title: tasks[j].title },
          score: Math.round(score * 100) / 100,
          sharedTerms: shared,
        });
      }
    }
  }
  return out.sort((x, y) => y.score - x.score).slice(0, opts.limit ?? 15);
}
