import { NextResponse, type NextRequest } from "next/server";
import { requireApiAuth } from "@/lib/api/guard";
import { importWorkspaceForOrg, type AtlasWorkspace } from "@/lib/import/atlas";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const ctx = await requireApiAuth();
  if (ctx instanceof NextResponse) return ctx;

  const body = (await req.json().catch(() => null)) as AtlasWorkspace | null;
  if (!body || !Array.isArray(body.projects)) {
    return NextResponse.json(
      { error: "Not a valid Atlas workspace file (expected { projects: [...] })." },
      { status: 400 },
    );
  }
  if (body.projects.length > 200) {
    return NextResponse.json(
      { error: "Too many projects in one import (max 200)." },
      { status: 413 },
    );
  }

  try {
    const { count } = await importWorkspaceForOrg(ctx.orgId, body);
    return NextResponse.json({ ok: true, count }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message || "Import failed" },
      { status: 500 },
    );
  }
}
