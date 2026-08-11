"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

interface ConfirmOptions {
  title: string;
  body?: string;
  /** Label on the confirming button. Defaults to "Delete". */
  confirmLabel?: string;
  /** Destructive styling — red button and warning icon. Defaults to true,
   *  since every current caller is a delete. */
  destructive?: boolean;
}

type Resolver = (ok: boolean) => void;

const ConfirmContext = createContext<((o: ConfirmOptions) => Promise<boolean>) | null>(null);

/** Replaces window.confirm with a dialog in the app's own design language.
 *
 *  Exposed as a promise so call sites keep reading top-to-bottom:
 *    if (!(await confirm({ title: "Delete this?" }))) return;
 */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const [resolver, setResolver] = useState<{ fn: Resolver } | null>(null);

  const confirm = useCallback((o: ConfirmOptions) => {
    setOpts(o);
    return new Promise<boolean>((resolve) => setResolver({ fn: resolve }));
  }, []);

  function settle(ok: boolean) {
    resolver?.fn(ok);
    setResolver(null);
    setOpts(null);
  }

  const destructive = opts?.destructive !== false;

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog
        open={!!opts}
        // Dismissing by escape or backdrop counts as "no".
        onOpenChange={(v) => { if (!v) settle(false); }}
      >
        <DialogContent className="no-gloss sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif-display flex items-center gap-2.5 font-medium">
              {destructive && (
                <span
                  className="flex size-7 shrink-0 items-center justify-center rounded-full"
                  style={{ background: "color-mix(in oklch, var(--t-red) 14%, transparent)" }}
                >
                  <TriangleAlert className="size-4 text-[var(--t-red)]" />
                </span>
              )}
              {opts?.title}
            </DialogTitle>
          </DialogHeader>

          {opts?.body && (
            <p className="text-muted-foreground text-[13.5px] leading-relaxed">{opts.body}</p>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => settle(false)}>Cancel</Button>
            <Button
              variant={destructive ? "destructive" : "default"}
              onClick={() => settle(true)}
              autoFocus
            >
              {opts?.confirmLabel ?? "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ConfirmContext.Provider>
  );
}

/** Returns an async confirm(). Falls back to window.confirm if used outside
 *  the provider, so a stray call site still behaves rather than silently
 *  doing nothing. */
export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  return useCallback(
    (o: ConfirmOptions) =>
      ctx ? ctx(o) : Promise.resolve(window.confirm(o.title)),
    [ctx],
  );
}
