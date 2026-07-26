"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import { apiFetch } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export function ImportDialog() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) setText(await file.text());
  }

  async function run() {
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      toast.error("That doesn't look like valid JSON.");
      return;
    }
    setBusy(true);
    try {
      const res = await apiFetch<{ count: number }>("/api/import", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      qc.invalidateQueries({ queryKey: ["projects"] });
      toast.success(`Imported ${res.count} project${res.count === 1 ? "" : "s"}`);
      setOpen(false);
      setText("");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload className="size-4" /> Import
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import an Atlas workspace</DialogTitle>
          <DialogDescription>
            Upload or paste an Atlas export (<code>.json</code>) from the legacy
            app. Projects are added to your workspace — nothing is overwritten.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="import-file">Export file</Label>
            <input
              id="import-file"
              type="file"
              accept="application/json,.json"
              onChange={onFile}
              className="file:bg-muted file:text-foreground block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:px-3 file:py-1.5"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="import-text">…or paste JSON</Label>
            <Textarea
              id="import-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={6}
              placeholder='{"atlas":true,"version":2,"projects":[…]}'
              className="font-mono text-xs"
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={run} disabled={busy || !text.trim()}>
            {busy ? "Importing…" : "Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
