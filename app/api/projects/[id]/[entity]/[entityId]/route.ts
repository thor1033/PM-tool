import { NextResponse, type NextRequest } from "next/server";
import { requireApiAuth } from "@/lib/api/guard";
import { updateEntity, deleteEntity, getWorkingSet, updateTaskWithSubtasks } from "@/lib/db/queries";
import { entityConfig, isEntityName } from "@/lib/entities";
import {
  checkMilestone,
  checkTask,
  trackForTask,
  inheritFromParent,
  cascadeToSubtasks,
} from "@/lib/hierarchy";

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
    const issue = checkTask(parentId ? { ...data, parentId } : data, false, ws);
    if (issue) return NextResponse.json(issue, { status: 400 });
    if (parentId) {
      inheritFromParent({ ...data, parentId }, ws);
      const parent = ws.tasks.find((t) => t.id === parentId);
      if (parent) {
        data.milestoneId = parent.milestoneId ?? null;
        data.category = parent.category ?? null;
      }
    } else if ("milestoneId" in data || "parentId" in data) {
      // Re-derive the track whenever the milestone moves, so the two cannot
      // drift apart.
      const track = trackForTask(data, ws);
      if (track) data.category = track;
    }

    // Moving a task takes its subtasks with it — they belong to it, so they
    // cannot be left under a milestone it has left.
    const children = cascadeToSubtasks(
      entityId,
      {
        milestoneId: "milestoneId" in data ? (data.milestoneId as string | null) : undefined,
        category: "category" in data ? (data.category as string | null) : undefined,
      },
      ws,
    );
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
