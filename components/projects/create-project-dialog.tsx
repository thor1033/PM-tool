"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Sparkles, PlusCircle } from "lucide-react";
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
import { ACCENTS, accent } from "@/lib/colors";
import { cn } from "@/lib/utils";
import { useCreateProject } from "@/lib/api/hooks";
import { AiSetupDialog } from "@/components/projects/ai-setup-dialog";

export function CreateProjectDialog({
  parentId = null,
  trigger,
}: {
  parentId?: string | null;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [color, setColor] = useState<string>("indigo");
  const router = useRouter();
  const create = useCreateProject();

  async function handleCreate() {
    try {
      const project = await create.mutateAsync({
        name: name.trim() || "Untitled project",
        code: code.trim(),
        color,
        parentId,
      });
      toast.success("Project created");
      setOpen(false);
      setName("");
      setCode("");
      router.push(`/projects/${project.id}/dashboard`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <>
      <span onClick={() => setOpen(true)}>
        {trigger ?? (
          <Button>
            <PlusCircle className="size-4" /> New project
          </Button>
        )}
      </span>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
            <DialogDescription>
              Start blank, or let Claude draft the plan from a short brief.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="proj-name">Project name</Label>
              <Input
                id="proj-name"
                placeholder="e.g. Helios Platform Modernisation"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="proj-code">Code (optional)</Label>
              <Input
                id="proj-code"
                placeholder="PRJ-2026-014"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Colour</Label>
              <div className="flex flex-wrap gap-2">
                {ACCENTS.map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setColor(a)}
                    className={cn(
                      "size-6 rounded-full ring-offset-2 transition",
                      accent(a).dot,
                      color === a && "ring-primary ring-2",
                    )}
                    aria-label={a}
                  />
                ))}
              </div>
            </div>
          </div>

          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <Button
              variant="outline"
              onClick={() => {
                setOpen(false);
                setAiOpen(true);
              }}
            >
              <Sparkles className="size-4" /> Draft with AI
            </Button>
            <Button onClick={handleCreate} disabled={create.isPending}>
              {create.isPending ? "Creating…" : "Create blank"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AiSetupDialog open={aiOpen} onOpenChange={setAiOpen} parentId={parentId} />
    </>
  );
}
