import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { requireApiAuth } from "@/lib/api/guard";
import { withTenant } from "@/lib/db/tenant";
import { insertWorkspace } from "@/lib/import/atlas";
import { buildAiProject } from "@/lib/ai/setup";
import { schema } from "@/lib/db/client";

// AI drafting runs up to 4 Claude calls; allow headroom on Vercel.
export const maxDuration = 60;

const formSchema = z.object({
  name: z.string().min(1),
  summary: z.string().optional(),
  domain: z.string().optional(),
  start: z.string().optional(),
  weeks: z.coerce.number().optional(),
  team: z.string().optional(),
  risks: z.string().optional(),
  findings: z.string().optional(),
  budget: z.string().optional(),
  color: z.string().optional(),
  parentId: z.string().nullable().optional(),
});

export async function POST(req: NextRequest) {
  const ctx = await requireApiAuth();
  if (ctx instanceof NextResponse) return ctx;

  const body = await req.json().catch(() => ({}));
  const parsed = formSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid form", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  let built;
  try {
    built = await buildAiProject(parsed.data);
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message || "AI generation failed" },
      { status: 502 },
    );
  }

  if (!built) {
    return NextResponse.json(
      {
        error:
          "The AI didn't return usable data (this can happen under rate limits). Try again, or create the project blank and fill it in.",
      },
      { status: 502 },
    );
  }

  const parentId = parsed.data.parentId ?? null;
  const projectId = await withTenant(ctx.orgId, async (tx) => {
    const { idMap } = await insertWorkspace(tx, ctx.orgId, {
      version: 2,
      projects: [built.project],
    });
    const newId = idMap[built.project.id!];
    if (parentId && newId) {
      await tx
        .update(schema.projects)
        .set({ parentId })
        .where(eq(schema.projects.id, newId));
    }
    return newId;
  });

  return NextResponse.json({ id: projectId, produced: built.produced }, {
    status: 201,
  });
}
