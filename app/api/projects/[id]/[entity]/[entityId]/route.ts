import { NextResponse, type NextRequest } from "next/server";
import { requireApiAuth } from "@/lib/api/guard";
import { updateEntity, deleteEntity, getWorkingSet, updateTaskWithSubtasks } from "@/lib/db/queries";
import { entityConfig, isEntityName } from "@/lib/entities";
import {
  checkMilestone,
  checkTask,
  milestoneLeftBehind,
  cascadeToSubtasks,
} from "@/lib/hierarchy";
import { applyDateRules } from "@/lib/task-dates";

type Ctx = { params: Promise<{ id: string; entity: string; entityId: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const ctx = await requireApiAuth();
  if (ctx instanceof NextResponse) return ctx;
  const { id, entity, entityId } = await params;
  if (!isEntityName(entity)) {
    return NextResponse.json({ error: "Unknown entity" }, { status: 404 });
  }
  const body = await req.json().catch(() => ({}));
  const parsed = entityConfig[entity].schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  // The same containment rules as creation. A partial patch that never
  // mentions the parent link leaves it alone and passes untouched, so this
  // blocks clearing a link without forcing every edit to restate it.
  const data = { ...parsed.data } as Record<string, unknown>;
  if (entity === "milestones") {
    const issue = checkMilestone(data, false);
    if (issue) return NextResponse.json(issue, { status: 400 });
    // A milestone moving to another track leaves its tasks where they are:
    // they keep their track and are taken out from under the milestone, since
    // a milestone decides nothing about the tasks beneath it.
    if ("category" in data) {
      const ws = await getWorkingSet(ctx.orgId, id);
      if (!ws) return NextResponse.json({ error: "Not found" }, { status: 404 });
      const nextTrack = String(data.category ?? "");
      for (const t of ws.tasks) {
        if (t.milestoneId === entityId && (t.category ?? "") !== nextTrack) {
          await updateEntity(ctx.orgId, id, "tasks", t.id, { milestoneId: null });
        }
      }
    }
  }
  if (entity === "tasks") {
    const ws = await getWorkingSet(ctx.orgId, id);
    if (!ws) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const self = ws.tasks.find((t) => t.id === entityId);
    // A patch may set parentId, or the row may already be a subtask; either
    // way its placement comes from the parent rather than the payload.
    const parentId = "parentId" in data ? String(data.parentId ?? "") : (self?.parentId ?? "");

    // The row's existing parent is folded in before checking, so a patch that
    // names only a milestone is still judged as the subtask edit it is —
    // otherwise moving a subtask away is silently ignored rather than refused.
    const issue = checkTask(parentId ? { ...data, parentId } : data, false, ws, self);
    if (issue) return NextResponse.json(issue, { status: 400 });
    if (parentId) {
      const parent = ws.tasks.find((t) => t.id === parentId);
      if (parent) {
        data.milestoneId = parent.milestoneId ?? null;
        data.category = parent.category ?? null;
        // A task becoming a subtask joins its parent's stage. An edit to a
        // task that is already a subtask leaves the status alone, so a
        // subtask can still be moved on its own.
        const becomingSubtask = "parentId" in data && self?.parentId !== parentId;
        if (becomingSubtask && !("status" in data)) {
          data.status = parent.status === "done" ? "backlog" : parent.status ?? "backlog";
        }
      }
    } else if ("category" in data && !("milestoneId" in data)) {
      // A task changing track cannot stay under a milestone of the old one.
      // The task's track wins; the milestone link is dropped.
      if (milestoneLeftBehind(data.category as string | null, self?.milestoneId, ws)) {
        data.milestoneId = null;
      }
    }

    // Runs after the status is settled, since every date rule keys off it.
    applyDateRules(data, false, self);

    // Whatever happens to a task happens to its parts: moving it takes them
    // along, and so does changing its status.
    const children = cascadeToSubtasks(
      entityId,
      {
        milestoneId: "milestoneId" in data ? (data.milestoneId as string | null) : undefined,
        category: "category" in data ? (data.category as string | null) : undefined,
        status: "status" in data ? (data.status as string) : undefined,
      },
      ws,
    );
    // Each child goes through the same date rules as the parent did, so a
    // subtask closed by a cascade records the same dates as one closed by
    // hand — and a stale comment about cascadeToSubtasks stamping them no
    // longer describes two implementations.
    for (const child of children) {
      const self = ws.tasks.find((t) => t.id === child.id);
      applyDateRules(child.data, false, self);
    }

    const row = await updateTaskWithSubtasks(ctx.orgId, id, entityId, data, children);
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(row);
  }

  const row = await updateEntity(ctx.orgId, id, entity, entityId, data);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(row);
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const ctx = await requireApiAuth();
  if (ctx instanceof NextResponse) return ctx;
  const { id, entity, entityId } = await params;
  if (!isEntityName(entity)) {
    return NextResponse.json({ error: "Unknown entity" }, { status: 404 });
  }
  await deleteEntity(ctx.orgId, id, entity, entityId);
  return NextResponse.json({ ok: true });
}
