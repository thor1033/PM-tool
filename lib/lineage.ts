import type { Task, Product } from "@/lib/types";
import type { ResolvedDep } from "@/lib/tasks";

/* A task's lineage, laid out as a tree you can read like a decision history.
 *
 *   ● task ──── ○ subtask ──── ○ subtask        subtasks run to the right
 *   │  ╲▢ doc     ╲▢ doc
 *   │
 *   ● follow-up ──── ○ subtask                  follow-ups run down
 *   ├──────────┐
 *   ● next     ● a parallel follow-up
 *
 * The tree starts at the origin of the whole history — walking back from the
 * task through the work it was split from (its parent) and the work it was
 * spun off from (its follow-up link) — so the task is always seen in the
 * context of where it came from, not only of what came after.
 *
 * Follow-ups are left-aligned under the task they came from rather than
 * centred, so a straight run of follow-ups reads as one vertical line: the
 * spine of how the work developed. Branches step out to the right of it.
 *
 * What a task depends on stands above it as a column of task-sized circles
 * — the work it waits for, tied down into it. The column sits right of the
 * node, clear of the follow-up line that drops into the node from above,
 * and a generation only grows taller when one of its tasks depends on others.
 *
 * Pure: takes rows, returns positions and paths. The renderer draws, this
 * decides where. Every walk is cycle-safe — a malformed link stops the walk
 * rather than looping, and a task reachable twice is drawn once, at the
 * first place it is reached. */

// ── geometry ─────────────────────────────────────────────────────────────────

/** Horizontal distance between a task and its subtasks, and between
 *  neighbouring follow-up branches. Wide enough for the label beside a node. */
export const COL = 240;
export const TASK_R = 13;
export const SUB_R = 8;
/** Space between one generation's lowest point and the next one's nodes. */
const GAP = 76;
/** Vertical step between documents stacked under a node. */
const DOC_STEP = 28;
/** Where the first document sits below its node's centre. */
const DOC_TOP = 46;
/** How far right of its node a document sits — clear of the follow-up line
 *  that drops straight down from the node. */
const DOC_DX = 30;
export const DOC_SIZE = 16;
const PAD = 28;
/** Lanes for follow-up lines crossing between two generations. */
const LANE = 8;
const MAX_LANE = 4;

// The column of dependencies above a node.
/** Dependencies drawn before the rest fold into "+N more". */
export const SHELF_MAX = 3;
/** Vertical step between dependency circles — a task circle and a gap. */
const DEP_STEP = TASK_R * 2 + 20;
/** The column's centre line, right of the node's own centre line. */
const DEP_DX = 56;
/** Room for the "+N more" line under the last circle. */
const MORE_H = 18;
/** Gap between the column's lowest point and the title under it. */
const SHELF_GAP = 24;

/** One dependency as the graph draws it. */
export interface LineageDep {
  dep: ResolvedDep;
  /** The task depended on, when it is one — so its circle can open it. */
  taskId?: string;
  /** Files attached to the task depended on, hung under its circle. */
  docs: Product[];
}

/** Vertical step between files stacked under a dependency circle. */
const DEP_DOC_STEP = 24;
/** Where the first such file sits below the circle's centre. */
const DEP_DOC_TOP = TASK_R + 16;

/** The extra height a dependency's files add under its circle. */
const depDocsH = (n: number) => (n ? (n - 1) * DEP_DOC_STEP + DEP_DOC_TOP - TASK_R + DOC_SIZE / 2 + 6 : 0);

export interface LineageShelf {
  items: (LineageDep & { x: number; y: number })[];
  /** How many are folded into the last line. */
  more: number;
  moreX: number;
  moreY: number;
}

function shelfHeight(deps: LineageDep[]): number {
  if (!deps.length) return 0;
  const shown = deps.slice(0, SHELF_MAX);
  return shown.reduce((h, d) => h + DEP_STEP + depDocsH(d.docs.length), 0) + (deps.length > SHELF_MAX ? MORE_H : 0);
}

// ── output ───────────────────────────────────────────────────────────────────

export interface LineageTaskNode {
  kind: "task" | "subtask";
  id: string;
  task: Task;
  x: number;
  y: number;
  r: number;
  /** Generation: how many follow-up steps below the origin. */
  depth: number;
  /** The task this lineage was built for. */
  focus: boolean;
  /** What it depends on, drawn above it. */
  shelf: LineageShelf | null;
}

export interface LineageDocNode {
  kind: "doc";
  /** Unique per placement — one file can be linked to several tasks. */
  id: string;
  product: Product;
  ownerId: string;
  x: number;
  y: number;
}

export type LineageNode = LineageTaskNode | LineageDocNode;

export interface LineageEdge {
  kind: "followup" | "subtask" | "doc" | "dep";
  id: string;
  from: string;
  to: string;
  /** SVG path data. */
  d: string;
}

export interface Lineage {
  rootId: string;
  focusId: string;
  nodes: LineageNode[];
  edges: LineageEdge[];
  width: number;
  height: number;
  /** Counts, for the caption and for deciding whether there is anything to
   *  draw beyond the task itself. */
  counts: { followups: number; subtasks: number; docs: number; dependent: number };
}

// ── links ────────────────────────────────────────────────────────────────────

const followupOf = (t: Task) => (t.deps ?? []).find((d) => d.type === "followup")?.refId ?? null;

const createdKey = (t: Task) => String(t.createdAt ?? "");

/** The origin of a task's history: up through parents and follow-up links
 *  until neither leads anywhere new. */
export function lineageRoot(task: Task, byId: Map<string, Task>): Task {
  const seen = new Set<string>([task.id]);
  let cur = task;
  while (true) {
    const upId = cur.parentId || followupOf(cur);
    const up = upId ? byId.get(upId) : undefined;
    if (!up || seen.has(up.id)) return cur;
    seen.add(up.id);
    cur = up;
  }
}

// ── tree ─────────────────────────────────────────────────────────────────────

interface Item {
  task: Task;
  kind: "task" | "subtask";
  docs: Product[];
  deps: LineageDep[];
  subs: Item[];
  followups: Item[];
  depth: number;
  /** Left edge of the item's block, relative to its parent's block. */
  offset: number;
  width: number;
}

export function buildLineage(
  focus: Task,
  tasks: Task[],
  products: Product[],
  /** Resolves a task's dependencies, follow-up links excluded — depsOf. Left
   *  to the caller so this module stays free of the lookups it needs. */
  depsFor: (t: Task) => ResolvedDep[] = () => [],
): Lineage {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const subsOf = new Map<string, Task[]>();
  const followupsOf = new Map<string, Task[]>();
  for (const t of tasks) {
    if (t.parentId) subsOf.set(t.parentId, [...(subsOf.get(t.parentId) ?? []), t]);
    const f = followupOf(t);
    if (f) followupsOf.set(f, [...(followupsOf.get(f) ?? []), t]);
  }
  const docsOf = new Map<string, Product[]>();
  for (const p of products) {
    for (const id of p.taskIds ?? []) docsOf.set(id, [...(docsOf.get(id) ?? []), p]);
  }

  // Subtasks in the order the list shows them; follow-ups in the order they
  // happened, which is the point of a history.
  const bySubOrder = (a: Task, b: Task) => (a.position ?? 0) - (b.position ?? 0) || createdKey(a).localeCompare(createdKey(b));
  const byCreated = (a: Task, b: Task) => createdKey(a).localeCompare(createdKey(b));

  const root = lineageRoot(focus, byId);
  const placed = new Set<string>();
  const counts = { followups: 0, subtasks: 0, docs: 0, dependent: 0 };
  const depRows = (t: Task): LineageDep[] => {
    const refs = new Map((t.deps ?? []).map((d) => [d.id, d]));
    return depsFor(t).map((dep) => {
      const raw = refs.get(dep.id);
      const taskId = raw?.type === "task" ? raw.refId : undefined;
      return { dep, taskId, docs: taskId ? docsOf.get(taskId) ?? [] : [] };
    });
  };

  const grow = (task: Task, kind: Item["kind"], depth: number): Item => {
    placed.add(task.id);
    const item: Item = {
      task, kind, depth, docs: docsOf.get(task.id) ?? [], deps: depRows(task), subs: [], followups: [], offset: 0, width: 0,
    };
    counts.docs += item.docs.length;
    if (item.deps.length) counts.dependent++;
    for (const s of [...(subsOf.get(task.id) ?? [])].sort(bySubOrder)) {
      if (placed.has(s.id)) continue;
      counts.subtasks++;
      item.subs.push(grow(s, "subtask", depth));
    }
    for (const f of [...(followupsOf.get(task.id) ?? [])].sort(byCreated)) {
      if (placed.has(f.id)) continue;
      counts.followups++;
      item.followups.push(grow(f, "task", depth + 1));
    }
    return item;
  };
  const tree = grow(root, "task", 0);

  // A task's row: itself, then its subtasks along the rail. The app keeps
  // subtasks one level deep, but an older row nested further is laid out on
  // the same rail, right after the subtask it sits under, rather than lost.
  const rowOf = (item: Item): Item[] => {
    const out: Item[] = [item];
    const add = (i: Item) => i.subs.forEach((s) => { out.push(s); add(s); });
    add(item);
    return out;
  };

  // ── horizontal: block widths, children left-aligned under their source ──
  // A block is a task's row (itself and its subtasks) plus everything that
  // follows from any of them. Follow-ups of a subtask start under that
  // subtask when there is room, so the line from it drops straight down.
  const measure = (item: Item): number => {
    const row = rowOf(item);
    let cursor = 0;
    row.forEach((m, col) => {
      for (const f of m.followups) {
        measure(f);
        f.offset = Math.max(cursor, col * COL);
        cursor = f.offset + f.width;
      }
    });
    item.width = Math.max(row.length * COL, cursor);
    return item.width;
  };
  measure(tree);

  // ── vertical: one band per generation, as deep as its deepest doc stack ──
  const docDepth = new Map<number, number>();
  const walk = (item: Item, fn: (i: Item) => void) => {
    fn(item);
    item.subs.forEach((s) => walk(s, fn));
    item.followups.forEach((f) => walk(f, fn));
  };
  const shelfDepth = new Map<number, number>();
  walk(tree, (i) => {
    docDepth.set(i.depth, Math.max(docDepth.get(i.depth) ?? 0, i.docs.length));
    shelfDepth.set(i.depth, Math.max(shelfDepth.get(i.depth) ?? 0, shelfHeight(i.deps)));
  });
  const generations = Math.max(...docDepth.keys()) + 1;
  const rowY: number[] = [];
  /** Where each generation's band starts: above its titles and shelves.
   *  Follow-up lines cross over just above it. */
  const bandTop: number[] = [];
  let y = PAD;
  for (let d = 0; d < generations; d++) {
    const shelf = shelfDepth.get(d) ?? 0;
    bandTop[d] = y;
    // Room for the shelf, then for the title that sits above the rail.
    y += (shelf ? shelf + SHELF_GAP : 0) + TASK_R + 18;
    rowY[d] = y;
    const docs = docDepth.get(d) ?? 0;
    const below = docs ? DOC_TOP + (docs - 1) * DOC_STEP + DOC_SIZE / 2 : TASK_R + 18;
    y += below + GAP;
  }

  // ── place ──
  const nodes: LineageNode[] = [];
  const edges: LineageEdge[] = [];
  const pos = new Map<string, { x: number; y: number; r: number }>();

  const place = (item: Item, left: number) => {
    const row = rowOf(item);
    row.forEach((m, col) => {
      const r = m.kind === "task" ? TASK_R : SUB_R;
      const x = left + col * COL + PAD + TASK_R;
      const ny = rowY[m.depth];
      pos.set(m.task.id, { x, y: ny, r });

      let shelf: LineageShelf | null = null;
      if (m.deps.length) {
        const h = shelfHeight(m.deps);
        const cx = x + DEP_DX;
        const top = ny - TASK_R - 18 - SHELF_GAP - h;
        let cursor = top;
        const items = m.deps.slice(0, SHELF_MAX).map((d) => {
          const it = { ...d, x: cx, y: cursor + DEP_STEP / 2 };
          cursor += DEP_STEP + depDocsH(d.docs.length);
          return it;
        });
        const last = items[items.length - 1];
        shelf = {
          items,
          more: Math.max(0, m.deps.length - SHELF_MAX),
          moreX: cx + TASK_R + 12,
          moreY: last.y + TASK_R + 14 + depDocsH(last.docs.length),
        };

        // Files of the work depended on hang under its circle, as a task's own
        // files hang under it.
        items.forEach((it) => {
          it.docs.forEach((p, i) => {
            const dx = cx + DOC_DX;
            const dy = it.y + DEP_DOC_TOP + i * DEP_DOC_STEP;
            const id = `${m.task.id}:dep:${it.dep.id}:${p.id}`;
            nodes.push({ kind: "doc", id, product: p, ownerId: it.taskId ?? m.task.id, x: dx, y: dy });
            const sx = cx + TASK_R * 0.7, sy = it.y + TASK_R * 0.7;
            edges.push({
              kind: "doc", id: `e:${id}`, from: it.taskId ?? m.task.id, to: id,
              d: `M${sx} ${sy} C${sx} ${dy} ${sx} ${dy} ${dx - DOC_SIZE / 2} ${dy}`,
            });
          });
        });

        // One dashed line threads the column. From the node it leaves upward,
        // left of the title, and only bends across once it is above the
        // title — so it never runs through the text beside the node.
        const rail = items.slice(1).map((it, i) => `M${cx} ${items[i].y + TASK_R} V${it.y - TASK_R}`);
        const sx = x + r * 0.7;
        const sy = ny - r * 0.7;
        const rise = ny - TASK_R - 26;
        const end = last.y + TASK_R;
        edges.push({
          kind: "dep", id: `dep:${m.task.id}`, from: m.task.id, to: m.task.id,
          d: [
            ...rail,
            `M${sx} ${sy} V${rise} C${sx} ${rise - 14} ${cx} ${end + 14} ${cx} ${end}`,
          ].join(" "),
        });
      }
      nodes.push({ kind: m.kind, id: m.task.id, task: m.task, x, y: ny, r, depth: m.depth, focus: m.task.id === focus.id, shelf });

      m.docs.forEach((p, i) => {
        const dx = x + DOC_DX;
        const dy = ny + DOC_TOP + i * DOC_STEP;
        const id = `${m.task.id}:${p.id}`;
        nodes.push({ kind: "doc", id, product: p, ownerId: m.task.id, x: dx, y: dy });
        // Each file hangs off its node on its own curve, so a stack reads as
        // a handful of attachments rather than a chain.
        const sx = x + r * 0.7, sy = ny + r * 0.7;
        edges.push({
          kind: "doc", id: `e:${id}`, from: m.task.id, to: id,
          d: `M${sx} ${sy} C${sx} ${dy} ${sx} ${dy} ${dx - DOC_SIZE / 2} ${dy}`,
        });
      });
    });

    // The subtask rail: one straight run from the task through its subtasks.
    row.slice(1).forEach((s, i) => {
      const a = pos.get(row[i].task.id)!;
      const b = pos.get(s.task.id)!;
      edges.push({ kind: "subtask", id: `e:${s.task.id}`, from: row[i].task.id, to: s.task.id, d: `M${a.x + a.r} ${a.y} H${b.x - b.r}` });
    });

    // Each source in the row runs its follow-up lines across at its own
    // height, so lines from the task and from its subtasks never merge into
    // one and it stays clear which task a follow-up came from.
    row.forEach((m, col) => {
      for (const f of m.followups) {
        place(f, left + f.offset);
        const a = pos.get(m.task.id)!;
        const b = pos.get(f.task.id)!;
        const bend = bandTop[f.depth] - 10 - Math.min(col, MAX_LANE) * LANE;
        edges.push({ kind: "followup", id: `e:${f.task.id}`, from: m.task.id, to: f.task.id, d: elbow(a, b, bend) });
      }
    });
  };
  place(tree, 0);

  return {
    rootId: root.id,
    focusId: focus.id,
    nodes,
    edges,
    width: tree.width + PAD * 2,
    height: y - GAP + PAD,
    counts,
  };
}

/** A follow-up line: straight down when the child sits under its source,
 *  otherwise down, across just above the child's band at `bend`, and down
 *  into it — with rounded corners, the way a decision tree is drawn by hand. */
function elbow(
  a: { x: number; y: number; r: number },
  b: { x: number; y: number; r: number },
  bend: number,
): string {
  const top = a.y + a.r;
  const bottom = b.y - b.r;
  if (Math.abs(a.x - b.x) < 0.5) return `M${a.x} ${top} V${bottom}`;
  const k = Math.min(10, Math.abs(b.x - a.x) / 2, (bend - top) / 2);
  const dir = b.x > a.x ? 1 : -1;
  return [
    `M${a.x} ${top}`,
    `V${bend - k}`,
    `Q${a.x} ${bend} ${a.x + dir * k} ${bend}`,
    `H${b.x - dir * k}`,
    `Q${b.x} ${bend} ${b.x} ${bend + k}`,
    `V${bottom}`,
  ].join(" ");
}
