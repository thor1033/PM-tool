import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireApiAuth } from "@/lib/api/guard";
import { askJSON } from "@/lib/ai/anthropic";

/* A written summary of today's activity, grouped by track.
 *
 * The raw feed lists every recorded change, so one piece of work shows up as
 * "Added", "Moved", "Renamed" and "Rescheduled" on four separate lines.
 * Nobody reads that to find out what happened. This asks the model to say
 * what actually moved, in a line or two per track.
 *
 * The client sends the events it has already built and grouped: which track
 * an event belongs to is a fact the digest resolves properly from task and
 * milestone ids, and a summary that misfiles work is worse than none. The
 * model only chooses the wording — it never decides where something belongs. */

const Body = z.object({
  tracks: z
    .array(
      z.object({
        track: z.string().min(1).max(120),
        lines: z.array(z.string().min(1).max(400)).min(1).max(60),
      }),
    )
    .min(1)
    .max(20),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireApiAuth();
  if (ctx instanceof NextResponse) return ctx;
  await params;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const { tracks } = parsed.data;

  const blocks = tracks
    .map((t) => `## ${t.track}\n${t.lines.map((l) => `- ${l}`).join("\n")}`)
    .join("\n\n");

  const prompt = `Below are today's change-log entries from a project management tool, already grouped under the track they belong to.

Write a short standup-style summary for each track. Rules:
- One to three bullets per track. Fewer is better.
- Combine entries about the same piece of work into one bullet — "added", "renamed", "moved" and "rescheduled" on the same item is one thing happening, not four.
- Say what changed in plain language and in the past tense. Do not use the tool's field names.
- Name the specific work when it is informative. Never pad with filler like "various updates were made".
- Do not invent anything that is not in the entries, and do not mention a track that is not listed.
- Keep every bullet under 110 characters.

Return ONLY minified JSON of this shape, using each track name exactly as given:
{"summary":[{"track":"...","points":["...","..."]}]}

${blocks}`;

  const ai = await askJSON<{ summary?: { track?: string; points?: string[] }[] }>(prompt, {
    maxTokens: 900,
  });

  // The model can be unreachable (no API key, transient failure) or return
  // something unusable. Both land here as an empty summary, and the caller
  // shows the raw feed rather than an error or a misleadingly quiet day.
  const known = new Set(tracks.map((t) => t.track));
  const summary = (ai?.summary ?? [])
    .filter((s): s is { track: string; points: string[] } =>
      typeof s?.track === "string" && Array.isArray(s.points) && known.has(s.track),
    )
    .map((s) => ({
      track: s.track,
      points: s.points.filter((p) => typeof p === "string" && p.trim()).slice(0, 3),
    }))
    .filter((s) => s.points.length > 0);

  return NextResponse.json({ summary, unavailable: summary.length === 0 });
}
