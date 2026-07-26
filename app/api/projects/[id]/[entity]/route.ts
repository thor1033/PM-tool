import { NextResponse, type NextRequest } from "next/server";
import { requireApiAuth } from "@/lib/api/guard";
import { createEntity } from "@/lib/db/queries";
import { entityConfig, isEntityName } from "@/lib/entities";

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
  if (typeof body.id === "string") data.id = body.id;
  const row = await createEntity(ctx.orgId, id, entity, data);
  return NextResponse.json(row, { status: 201 });
}
