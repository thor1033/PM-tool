import { NextResponse, type NextRequest } from "next/server";
import { requireApiAuth } from "@/lib/api/guard";
import {
  getWorkingSet,
  updateProject,
  deleteProject,
} from "@/lib/db/queries";
import { projectDocSchema } from "@/lib/entities";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const ctx = await requireApiAuth();
  if (ctx instanceof NextResponse) return ctx;
  const { id } = await params;
  const ws = await getWorkingSet(ctx.orgId, id);
  if (!ws) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(ws);
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const ctx = await requireApiAuth();
  if (ctx instanceof NextResponse) return ctx;
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = projectDocSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const row = await updateProject(ctx.orgId, id, parsed.data);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(row);
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const ctx = await requireApiAuth();
  if (ctx instanceof NextResponse) return ctx;
  const { id } = await params;
  await deleteProject(ctx.orgId, id);
  return NextResponse.json({ ok: true });
}
