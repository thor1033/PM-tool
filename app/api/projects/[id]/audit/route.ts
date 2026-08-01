import { NextResponse, type NextRequest } from "next/server";
import { and, eq, gte, desc, lt } from "drizzle-orm";
import { requireApiAuth } from "@/lib/api/guard";
import { withTenant } from "@/lib/db/tenant";
import { schema } from "@/lib/db/client";
import { genId } from "@/lib/entities";

type Ctx = { params: Promise<{ id: string }> };

const FIVE_WEEKS_MS = 35 * 24 * 60 * 60 * 1000;
const FIVE_MIN_MS = 5 * 60 * 1000;

export async function GET(_req: NextRequest, { params }: Ctx) {
  const ctx = await requireApiAuth();
  if (ctx instanceof NextResponse) return ctx;
  const { id } = await params;

  const cutoff = new Date(Date.now() - FIVE_WEEKS_MS);

  const rows = await withTenant(ctx.orgId, async (tx) => {
    // Prune entries older than 5 weeks while we're here
    await tx
      .delete(schema.activity)
      .where(
        and(
          eq(schema.activity.projectId, id),
          lt(schema.activity.ts, cutoff),
        ),
      );

    return tx
      .select()
      .from(schema.activity)
      .where(
        and(
          eq(schema.activity.projectId, id),
          gte(schema.activity.ts, cutoff),
        ),
      )
      .orderBy(desc(schema.activity.ts));
  });

  return NextResponse.json(rows);
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const ctx = await requireApiAuth();
  if (ctx instanceof NextResponse) return ctx;
  const { id } = await params;

  const body = await req.json().catch(() => ({})) as {
    kind?: string; text?: string; actor?: string; key?: string;
  };
  const text = String(body.text ?? "").trim();
  if (!text) return NextResponse.json({ error: "text required" }, { status: 400 });

  const kind = String(body.kind ?? "edit");
  const actor = String(body.actor ?? "");
  const key = body.key ? String(body.key) : null;

  // Coalesce: if an entry with the same key (or same text when no key) was
  // written in the last 5 min, update it instead of inserting a new entry.
  const coalesceCutoff = new Date(Date.now() - FIVE_MIN_MS);

  const row = await withTenant(ctx.orgId, async (tx) => {
    if (key) {
      // Try to find a recent entry by key to coalesce into
      const existing = await tx
        .select()
        .from(schema.activity)
        .where(
          and(
            eq(schema.activity.projectId, id),
            eq(schema.activity.actor, actor),
            gte(schema.activity.ts, coalesceCutoff),
          ),
        )
        .orderBy(desc(schema.activity.ts));

      // Check client-side if any match our key (stored in text prefix hack — simplest without schema change)
      const match = existing.find((e) => e.text === text || e.id === key);
      if (match) {
        // Update ts on the existing row — effectively coalesces the edit
        await tx
          .update(schema.activity)
          .set({ ts: new Date(), text })
          .where(
            and(
              eq(schema.activity.projectId, match.projectId),
              eq(schema.activity.id, match.id),
            ),
          );
        return { ...match, ts: new Date(), text };
      }
    }

    const newId = genId("act");
    const values = {
      id: newId,
      orgId: ctx.orgId,
      projectId: id,
      kind,
      text,
      actor,
      ts: new Date(),
    };
    await tx.insert(schema.activity).values(values);
    return values;
  });

  return NextResponse.json(row, { status: 201 });
}
