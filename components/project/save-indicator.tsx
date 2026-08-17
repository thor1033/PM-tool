"use client";

import { useEffect, useRef, useState } from "react";
import { useIsMutating } from "@tanstack/react-query";
import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/** Shows "Saving…" while any mutation is in flight, then "Saved" briefly.
 *
 *  Edits here commit on blur rather than behind a Save button, so this is the
 *  confirmation that the change actually landed. It watches React Query's
 *  global mutation count, so every page gets it without wiring per-form. */
export function SaveIndicator() {
  const pending = useIsMutating();
  // "Saving" is just derived from the live mutation count. Only the brief
  // "Saved" confirmation needs state, since it outlives the mutation.
  const [flashSaved, setFlashSaved] = useState(false);
  const wasPending = useRef(false);

  useEffect(() => {
    if (pending > 0) {
      wasPending.current = true;
      return;
    }
    // Only flash after something was actually in flight, so it doesn't
    // appear on a quiet page load.
    if (!wasPending.current) return;
    wasPending.current = false;
    setFlashSaved(true);
    const t = setTimeout(() => setFlashSaved(false), 1800);
    return () => clearTimeout(t);
  }, [pending]);

  const state = pending > 0 ? "saving" : flashSaved ? "saved" : "idle";
  if (state === "idle") return null;

  return (
    <div
      className={cn(
        // Above every modal (100–110): edits now autosave from inside the
        // task and track editors, so the confirmation has to be visible
        // exactly where those dialogs cover the page.
        "pointer-events-none fixed bottom-5 left-1/2 z-[200] -translate-x-1/2",
        "flex items-center gap-2 rounded-full border px-4 py-2 shadow-lg transition-opacity",
        state === "saved"
          ? "border-[color-mix(in_oklch,var(--hue-done)_38%,transparent)] bg-[color-mix(in_oklch,var(--hue-done)_14%,var(--panel))]"
          : "bg-[var(--panel)]",
      )}
      role="status"
      aria-live="polite"
    >
      {state === "saving" ? (
        <>
          <Loader2 className="text-muted-foreground size-3.5 animate-spin" />
          <span className="text-muted-foreground text-[12.5px] font-medium">Saving…</span>
        </>
      ) : (
        <>
          <Check className="size-4 text-[var(--hue-done)]" />
          <span
            className="text-[13px] font-semibold"
            style={{ color: "color-mix(in oklch, var(--hue-done) 72%, var(--ink))" }}
          >
            Saved
          </span>
        </>
      )}
    </div>
  );
}
