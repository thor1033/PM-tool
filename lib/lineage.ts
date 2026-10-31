import type { Task, Product } from "@/lib/types";
import type { ResolvedDep } from "@/lib/tasks";

/* A task's lineage, laid out as a history that reads left to right: older
 * work on the left, what came of it on the right.
 *
 *   ● origin ─────────────── ● follow-up ──── ● next follow-up
 *   │  ╲▢ doc      ◌ dep ╌╌╌┘│
 *   ├──── ○ subtask         └──── ○ subtask
 *
 * Everything a task led to sits one column to its right. Its first follow-up
 * stays on the task's own row, so a run of follow-ups is one straight line:
 * the spine of how the work developed. Its other follow-ups and its subtasks
 * stack underneath, tied in by a line dropping from the task.
 *
 * The tree starts at the origin of the whole history — walking back from the
 * task through the work it was split from (its parent) and the work it was
 * spun off from (its follow-up link) — so the task is always seen in the
 * context of where it came from, not only of what came after.
 *
 * Each task's descendants take a contiguous block of rows, all right of the
 * task. So the line dropping from a task only ever runs past empty space, and
 * nothing can be drawn over anything else.
 *
 * What a task depends on comes before it, so it stands to its left: a
 * column of task-sized circles just below the line into the task, each tied
 * across into it. A task that depends on others is moved one column further
 * right to make room, and its block of rows is at least as tall as its
 * dependencies, so the next thing stacked below starts underneath them.
 *
 * Pure: takes rows, returns positions and paths. The renderer draws, this
 * decides where. Every walk is cycle-safe — a malformed link stops the walk
 * rather than looping, and a task reachable twice is drawn once, at the
 * first place it is reached. */

// ── geometry ─────────────────────────────────────────────────────────────────

/** Horizontal distance between a task and what it led to. Wide enough for
 *  the label beside a node. */
export const COL = 240;
export const TASK_R = 13;
export const SUB_R = 8;
/** Space between one row's lowest point and the next row's highest. */
const ROW_GAP = 36;
/** Vertical step between documents stacked under a node. */
const DOC_STEP = 28;
/** Where the first document sits below its node's centre. */
const DOC_TOP = 46;
/** How far right of its node a document sits — clear of the line that drops
 *  straight down from the node to what sits below it. */
const DOC_DX = 30;
export const DOC_SIZE = 16;
const PAD = 28;
/** Corner radius where a dropping line turns towards its task. */
const CORNER = 10;

// The column of dependencies left of a node.
/** Dependencies drawn before the rest fold into "+N more". */
export const SHELF_MAX = 3;
/** Room for the "+N more" line under the last circle. */
const MORE_H = 18;
/** Where the dependency lines gather before turning into the node — left of
 *  it, clear of the line from the previous task and the labels beside the
 *  dependency circles. */
const GATHER_DX = 20;

/** One dependency as the graph draws it. */
export interface LineageDep {
  dep: ResolvedDep;
  /** The task depended on, when it is one — so its circle can open it. */
  taskId?: string;
  /** Files attached to the task depended on, hung under its circle. */
  docs: Product[];
}

export interface LineageShelf {
  items: (LineageDep & { x: number; y: number })[];
  /** How many are folded into the last line. */
  more: number;
  moreX: number;
  moreY: number;
}

// ── output ───────────────────────────────────────────────────────────────────

export interface LineageTaskNode {
  kind: "task" | "subtask";
  id: string;
  task: Task;
  x: number;
  y: number;
  r: number;
  /** Generation: how many follow-up steps from the origin. */
  depth: number;
  /** The task this lineage was built for. */
  focus: boolean;
  /** What it depends on, drawn to its left. */
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
  col: number;
  row: number;
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
      task, kind, depth, docs: docsOf.get(task.id) ?? [], deps: depRows(task), subs: [], followups: [], col: 0, row: 0,
    };
    counts.docs += item.docs.length;
    if (item.deps.length) counts.dependent++;
    for (const f of [...(followupsOf.get(task.id) ?? [])].sort(byCreated)) {
      if (placed.has(f.id)) continue;
      counts.followups++;
      item.followups.push(grow(f, "task", depth + 1));
    }
    for (const s of [...(subsOf.get(task.id) ?? [])].sort(bySubOrder)) {
      if (placed.has(s.id)) continue;
      counts.subtasks++;
      item.subs.push(grow(s, "subtask", depth));
    }
    return item;
  };
  const tree = grow(root, "task", 0);

  // What a task led to, in the order it is stacked: follow-ups first, so the
  // first of them continues the task's own row, then its subtasks.
  const kidsOf = (item: Item) => [...item.followups, ...item.subs];

  // ── grid: one column per step, a contiguous block of rows per subtree ──
  const all: Item[] = [];
  let nextRow = 0;
  let maxCol = 0;
  const shownDeps = (item: Item) => Math.min(item.deps.length, SHELF_MAX);
  const assign = (item: Item, col: number) => {
    // Room on the left for what it depends on.
    item.col = col + (item.deps.length ? 1 : 0);
    item.row = nextRow;
    maxCol = Math.max(maxCol, item.col);
    all.push(item);
    const kids = kidsOf(item);
    nextRow = item.row + 1;
    kids.forEach((k, i) => {
      // The first one shares the row; the rest start below what came before.
      if (i === 0) nextRow = item.row;
      assign(k, item.col + 1);
    });
    // Its dependencies take the rows under its own, left of it.
    nextRow = Math.max(nextRow, item.row + 1 + shownDeps(item));
  };
  assign(tree, 0);

  // ── rows: each as tall as its tallest file stack ──
  const rows = nextRow;
  const above = new Array<number>(rows).fill(TASK_R + 18);
  const below = new Array<number>(rows).fill(TASK_R + 18);
  const docsBelow = (n: number) => (n ? DOC_TOP + (n - 1) * DOC_STEP + DOC_SIZE / 2 : 0);
  for (const i of all) {
    below[i.row] = Math.max(below[i.row], docsBelow(i.docs.length));
    i.deps.slice(0, SHELF_MAX).forEach((d, n) => {
      const r = i.row + 1 + n;
      const more = n === shownDeps(i) - 1 && i.deps.length > SHELF_MAX ? MORE_H : 0;
      below[r] = Math.max(below[r], Math.max(TASK_R + 18, docsBelow(d.docs.length)) + more);
    });
  }
  const rowY: number[] = [];
  let y = PAD;
  for (let r = 0; r < rows; r++) {
    y += above[r];
    rowY[r] = y;
    y += below[r] + (r < rows - 1 ? ROW_GAP : 0);
  }

  // ── place ──
  const nodes: LineageNode[] = [];
  const edges: LineageEdge[] = [];
  const pos = new Map<string, { x: number; y: number; r: number }>();

  for (const m of all) {
    const r = m.kind === "task" ? TASK_R : SUB_R;
    const x = PAD + TASK_R + m.col * COL;
    const ny = rowY[m.row];
    pos.set(m.task.id, { x, y: ny, r });

    let shelf: LineageShelf | null = null;
    if (m.deps.length) {
      const cx = x - COL;
      const items = m.deps.slice(0, SHELF_MAX).map((d, n) => ({ ...d, x: cx, y: rowY[m.row + 1 + n] }));
      const last = items[items.length - 1];
      shelf = {
        items,
        more: Math.max(0, m.deps.length - SHELF_MAX),
        moreX: cx + TASK_R + 12,
        moreY: last.y + Math.max(TASK_R + 18, docsBelow(last.docs.length)) + 12,
      };

      // Files of the work depended on hang under its circle, as a task's own
      // files hang under it.
      items.forEach((it) => {
        it.docs.forEach((p, i) => {
          const dx = cx + DOC_DX;
          const dy = it.y + DOC_TOP + i * DOC_STEP;
          const id = `${m.task.id}:dep:${it.dep.id}:${p.id}`;
          nodes.push({ kind: "doc", id, product: p, ownerId: it.taskId ?? m.task.id, x: dx, y: dy });
          const sx = cx + TASK_R * 0.7, sy = it.y + TASK_R * 0.7;
          edges.push({
            kind: "doc", id: `e:${id}`, from: it.taskId ?? m.task.id, to: id,
            d: `M${sx} ${sy} C${sx} ${dy} ${sx} ${dy} ${dx - DOC_SIZE / 2} ${dy}`,
          });
        });
      });

      // Each dependency runs right along its own row, between its name and
      // its status, to a shared line left of the node that rises and turns
      // into the node's lower left — apart from the line from the previous
      // task, which comes in level from the left.
      const gx = x - GATHER_DX;
      const ex = x - r * 0.7;
      const ey = ny + r * 0.7;
      edges.push({
        kind: "dep", id: `dep:${m.task.id}`, from: m.task.id, to: m.task.id,
        d: [
          ...items.map((it) => `M${it.x + TASK_R} ${it.y} H${gx - CORNER} Q${gx} ${it.y} ${gx} ${it.y - CORNER}`),
          `M${gx} ${last.y - CORNER} V${ey + CORNER} Q${gx} ${ey} ${ex} ${ey}`,
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
  }

  // A task to what it led to: straight across to the one on its own row, and
  // down then across to each one stacked below.
  for (const m of all) {
    const a = pos.get(m.task.id)!;
    for (const k of kidsOf(m)) {
      const b = pos.get(k.task.id)!;
      edges.push({
        kind: k.kind === "subtask" ? "subtask" : "followup",
        id: `e:${k.task.id}`, from: m.task.id, to: k.task.id,
        d: link(a, b),
      });
    }
  }

  return {
    rootId: root.id,
    focusId: focus.id,
    nodes,
    edges,
    width: PAD * 2 + TASK_R + maxCol * COL + COL,
    height: y + PAD,
    counts,
  };
}

/** A line from a task to one it led to: straight across when they share a
 *  row, otherwise down from the task and across into the other with a
 *  rounded corner, the way a tree is drawn by hand. */
function link(
  a: { x: number; y: number; r: number },
  b: { x: number; y: number; r: number },
): string {
  if (Math.abs(a.y - b.y) < 0.5) return `M${a.x + a.r} ${a.y} H${b.x - b.r}`;
  const k = Math.min(CORNER, (b.x - a.x) / 2, (b.y - a.y - a.r) / 2);
  return [
    `M${a.x} ${a.y + a.r}`,
    `V${b.y - k}`,
    `Q${a.x} ${b.y} ${a.x + k} ${b.y}`,
    `H${b.x - b.r}`,
  ].join(" ");
}
