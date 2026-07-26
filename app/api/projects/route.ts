import { NextResponse, type NextRequest } from "next/server";
import { requireApiAuth } from "@/lib/api/guard";
import { listProjects, createProject } from "@/lib/db/queries";

export async function GET() {
  const ctx = await requireApiAuth();
  if (ctx instanceof NextResponse) return ctx;
  const rows = await listProjects(ctx.orgId);
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const ctx = await requireApiAuth();
  if (ctx instanceof NextResponse) return ctx;
  const body = await req.json().catch(() => ({}));
  const row = await createProject(ctx.orgId, {
    name: typeof body.name === "string" ? body.name : undefined,
    code: typeof body.code === "string" ? body.code : undefined,
    color: typeof body.color === "string" ? body.color : undefined,
    parentId: typeof body.parentId === "string" ? body.parentId : null,
  });
  return NextResponse.json(row, { status: 201 });
}
