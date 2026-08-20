import { NextResponse, type NextRequest } from "next/server";
import { requireApiAuth } from "@/lib/api/guard";
import { createEntity, getWorkingSet } from "@/lib/db/queries";
import { entityConfig, isEntityName } from "@/lib/entities";
import {
  checkMilestone,
  checkTask,
  trackForTask,
  inheritFromParent,
  clearBacklogDates,
} from "@/lib/hierarchy";

type Ctx = { params: Promise<{ id: string; entity: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  const ctx = await requireApiAuth();
  if (ctx instanceof NextResponse) return ctx;
  const { id, entity } = await params;
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
  // Preserve a client-provided id if present (used by AI setup / import flows).
  const data = { ...parsed.data } as Record<string, unknown>;

  // track → milestone → task → subtask. Enforced here because this endpoint
  // is the one gate every creation path shares, the raw API included.
  if (entity === "milestones") {
    const issue = checkMilestone(data, true);
    if (issue) return NextResponse.json(issue, { status: 400 });
  }
  if (entity === "tasks") {
    const ws = await getWorkingSet(ctx.orgId, id);
    if (!ws) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const issue = checkTask(data, true, ws);
    if (issue) return NextResponse.json(issue, { status: 400 });
    if (data.parentId) {
      // A subtask takes its parent's milestone, track and stage outright.
      inheritFromParent(data, ws, { withStatus: true });
    } else {
      // The milestone owns the track, so it is derived rather than trusted —
      // a caller cannot file a task under a milestone in another track.
      const track = trackForTask(data, ws);
      if (track) data.category = track;
    }

    // Runs after the status is settled: unstarted work carries no start or
    // completion date, and the milestone is what supplies its deadline.
    clearBacklogDates(data, true);
  }
  if (typeof body.id === "string") data.id = body.id;
  const row = await createEntity(ctx.orgId, id, entity, data);
  return NextResponse.json(row, { status: 201 });
}
