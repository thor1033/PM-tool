"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Sparkles, Loader2, TriangleAlert } from "lucide-react";
import { apiFetch } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const STEPS = [
  "Writing the business case",
  "Planning tasks & timeline",
  "Mapping stakeholders & org",
  "Identifying risks & findings",
];

export function AiSetupDialog({
  open,
  onOpenChange,
  parentId = null,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  parentId?: string | null;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const [stage, setStage] = useState<"form" | "running" | "error">("form");
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({
    name: "",
    domain: "IT / software",
    summary: "",
    start: new Date().toISOString().slice(0, 7),
    weeks: 16,
    budget: "",
    team: "",
    risks: "",
    findings: "",
  });
  const set = (k: string, v: string | number) =>
    setF((p) => ({ ...p, [k]: v }));

  async function generate() {
    setStage("running");
    setError(null);
    try {
      const res = await apiFetch<{ id: string }>("/api/ai/setup", {
        method: "POST",
        body: JSON.stringify({ ...f, parentId }),
      });
      qc.invalidateQueries({ queryKey: ["projects"] });
      onOpenChange(false);
      router.push(`/projects/${res.id}/dashboard`);
    } catch (e) {
      setError((e as Error).message);
      setStage("error");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => stage !== "running" && onOpenChange(v)}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="text-primary size-5" /> Set up with AI
          </DialogTitle>
          <DialogDescription>
            Answer a few questions and Claude drafts the business case, tasks,
            timeline, people, risks and findings. Edit anything afterwards.
          </DialogDescription>
        </DialogHeader>

        {stage === "running" ? (
          <div className="space-y-3 py-4">
            {STEPS.map((s) => (
              <div key={s} className="flex items-center gap-2 text-sm">
                <Loader2 className="text-primary size-4 animate-spin" />
                {s}
              </div>
            ))}
            <p className="text-muted-foreground pt-2 text-xs">
              This usually takes 10–20 seconds.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
              <div className="space-y-1.5">
                <Label>Project name</Label>
                <Input
                  autoFocus
                  value={f.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="e.g. Helios Platform Modernisation"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Kind of project</Label>
                <Input
                  value={f.domain}
                  onChange={(e) => set("domain", e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>What is this project about?</Label>
              <Textarea
                rows={2}
                value={f.summary}
                onChange={(e) => set("summary", e.target.value)}
                placeholder="One or two sentences on the goal and why it matters."
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Starts</Label>
                <Input
                  type="month"
                  value={f.start}
                  onChange={(e) => set("start", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Duration (weeks)</Label>
                <Input
                  type="number"
                  min={2}
                  max={104}
                  value={f.weeks}
                  onChange={(e) => set("weeks", Number(e.target.value))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Budget context</Label>
                <Input
                  value={f.budget}
                  onChange={(e) => set("budget", e.target.value)}
                  placeholder="~€500k"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>
                Who&apos;s on the team?{" "}
                <span className="text-muted-foreground font-normal">
                  one per line — name — role
                </span>
              </Label>
              <Textarea
                rows={3}
                value={f.team}
                onChange={(e) => set("team", e.target.value)}
                placeholder={"Dev Patel — Tech Lead\nMaya Rossi — Design Lead"}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Known risks / concerns</Label>
                <Textarea
                  rows={2}
                  value={f.risks}
                  onChange={(e) => set("risks", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Early findings</Label>
                <Textarea
                  rows={2}
                  value={f.findings}
                  onChange={(e) => set("findings", e.target.value)}
                />
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                {error}
              </div>
            )}
          </div>
        )}

        {stage !== "running" && (
          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={generate} disabled={!f.name.trim()}>
              <Sparkles className="size-4" /> Generate project
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
