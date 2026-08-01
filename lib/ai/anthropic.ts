import "server-only";
import Anthropic from "@anthropic-ai/sdk";

// Default drafting model — fast + capable for structured generation. The hub's
// agent logic is authored against Claude; swap behind this module if a client
// requires routing to their own licensed model (LiteLLM gateway, phase 2).
export const DRAFT_MODEL = "claude-sonnet-4-6";

let client: Anthropic | null = null;
export function getAnthropic(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
    client = new Anthropic({ apiKey });
  }
  return client;
}

const SYSTEM =
  "You are a senior project-management consultant helping set up a new client engagement. " +
  "You always respond with ONLY minified JSON that matches the requested shape — no markdown, no code fences, no commentary.";

/** Single completion returning raw text. System prompt is cached across calls. */
export async function complete(
  prompt: string,
  opts: { maxTokens?: number; model?: string } = {},
): Promise<string> {
  const res = await getAnthropic().messages.create({
    model: opts.model ?? DRAFT_MODEL,
    max_tokens: opts.maxTokens ?? 1500,
    system: [
      {
        type: "text",
        text: SYSTEM,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: prompt }],
  });
  return res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

/** Tolerant JSON extraction — ported from the legacy app's stripJSON. */
export function stripJSON<T = unknown>(text: string | null): T | null {
  if (!text) return null;
  let t = String(text).trim();
  t = t.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const first = Math.min(
    ...["{", "["].map((c) => {
      const i = t.indexOf(c);
      return i === -1 ? Infinity : i;
    }),
  );
  if (first === Infinity) return null;
  const open = t[first];
  const close = open === "{" ? "}" : "]";
  const last = t.lastIndexOf(close);
  if (last !== -1) {
    try {
      return JSON.parse(t.slice(first, last + 1)) as T;
    } catch {
      /* fall through to recovery */
    }
  }
  // recovery for a response truncated mid-array
  if (open === "[") {
    const lb = t.lastIndexOf("}");
    if (lb > first) {
      const frag = t.slice(first, lb + 1).replace(/,\s*$/, "");
      try {
        return JSON.parse(frag + "]") as T;
      } catch {
        /* ignore */
      }
    }
  }
  return null;
}

export async function askJSON<T = unknown>(
  prompt: string,
  opts?: { maxTokens?: number; model?: string },
): Promise<T | null> {
  try {
    const out = await complete(prompt, opts);
    return stripJSON<T>(out);
  } catch (e) {
    console.warn("AI call failed", e);
    return null;
  }
}

/** Same contract as `askJSON`, but rethrows instead of swallowing the error —
 *  for callers (like the plan route) that need to tell "the API call itself
 *  failed" apart from "the model responded but with nothing usable", so a
 *  bad/missing API key surfaces as a real error instead of a silent no-op. */
export async function askJSONOrThrow<T = unknown>(
  prompt: string,
  opts?: { maxTokens?: number; model?: string },
): Promise<T | null> {
  const out = await complete(prompt, opts);
  return stripJSON<T>(out);
}
