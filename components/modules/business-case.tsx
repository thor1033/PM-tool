"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Save } from "lucide-react";
import { useProject, useUpdateProject } from "@/lib/api/hooks";
import { blankBusinessCase } from "@/lib/templates";
import { ModuleHeader, SectionCard } from "@/components/project/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface Financial {
  label: string;
  value: string;
  note: string;
}
interface BusinessCase {
  purpose: string;
  problem: string;
  perspOurs: string;
  perspUsers: string;
  perspStakeholders: string;
  worsening: string;
  opportunities: string;
  outcomes: string[];
  effProcess: string;
  effSystem: string;
  effBehaviour: string;
  effLeadership: string;
  financial: Financial[];
  justification: string;
  effective: string;
}

function Field({
  label,
  value,
  onChange,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows} />
    </div>
  );
}

export function BusinessCaseModule({ projectId }: { projectId: string }) {
  const { data } = useProject(projectId);
  if (!data) return null;
  const initial = {
    ...blankBusinessCase(),
    ...(data.project.businessCase as object),
  } as BusinessCase;
  // Remount (fresh local state) when switching projects.
  return <BusinessCaseEditor key={projectId} projectId={projectId} initial={initial} />;
}

function BusinessCaseEditor({
  projectId,
  initial,
}: {
  projectId: string;
  initial: BusinessCase;
}) {
  const update = useUpdateProject(projectId);
  const [bc, setBc] = useState<BusinessCase>(initial);
  const [dirty, setDirty] = useState(false);

  const set = <K extends keyof BusinessCase>(k: K, v: BusinessCase[K]) => {
    setBc((p) => ({ ...p, [k]: v }));
    setDirty(true);
  };

  async function save() {
    try {
      await update.mutateAsync({ businessCase: bc });
      toast.success("Business case saved");
      setDirty(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div>
      <ModuleHeader
        title="Business case"
        description="Why this project exists, its outcomes and the numbers."
        actions={
          <Button onClick={save} disabled={!dirty || update.isPending}>
            <Save className="size-4" /> {dirty ? "Save" : "Saved"}
          </Button>
        }
      />

      <div className="space-y-4">
        <SectionCard title="Purpose & problem">
          <div className="space-y-4">
            <Field label="Purpose" value={bc.purpose} onChange={(v) => set("purpose", v)} />
            <Field label="Problem" value={bc.problem} onChange={(v) => set("problem", v)} />
          </div>
        </SectionCard>

        <SectionCard title="Perspectives">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Our perspective" value={bc.perspOurs} onChange={(v) => set("perspOurs", v)} />
            <Field label="Users' perspective" value={bc.perspUsers} onChange={(v) => set("perspUsers", v)} />
            <Field label="Stakeholders' perspective" value={bc.perspStakeholders} onChange={(v) => set("perspStakeholders", v)} />
            <Field label="What worsens if we do nothing" value={bc.worsening} onChange={(v) => set("worsening", v)} />
          </div>
          <div className="mt-4">
            <Field label="Opportunities" value={bc.opportunities} onChange={(v) => set("opportunities", v)} />
          </div>
        </SectionCard>

        <SectionCard title="Target outcomes">
          <div className="space-y-2">
            {bc.outcomes.map((o, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  value={o}
                  onChange={(e) => {
                    const next = [...bc.outcomes];
                    next[i] = e.target.value;
                    set("outcomes", next);
                  }}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    set("outcomes", bc.outcomes.filter((_, j) => j !== i))
                  }
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() => set("outcomes", [...bc.outcomes, ""])}
            >
              <Plus className="size-4" /> Add outcome
            </Button>
          </div>
        </SectionCard>

        <SectionCard title="Effects (process · system · behaviour · leadership)">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Process" value={bc.effProcess} onChange={(v) => set("effProcess", v)} />
            <Field label="System" value={bc.effSystem} onChange={(v) => set("effSystem", v)} />
            <Field label="Behaviour" value={bc.effBehaviour} onChange={(v) => set("effBehaviour", v)} />
            <Field label="Leadership" value={bc.effLeadership} onChange={(v) => set("effLeadership", v)} />
          </div>
        </SectionCard>

        <SectionCard title="Financials">
          <div className="space-y-2">
            {bc.financial.map((row, i) => (
              <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_140px_1fr_auto]">
                <Input
                  placeholder="Label"
                  value={row.label}
                  onChange={(e) => {
                    const next = [...bc.financial];
                    next[i] = { ...row, label: e.target.value };
                    set("financial", next);
                  }}
                />
                <Input
                  placeholder="Value"
                  value={row.value}
                  onChange={(e) => {
                    const next = [...bc.financial];
                    next[i] = { ...row, value: e.target.value };
                    set("financial", next);
                  }}
                />
                <Input
                  placeholder="Note"
                  value={row.note}
                  onChange={(e) => {
                    const next = [...bc.financial];
                    next[i] = { ...row, note: e.target.value };
                    set("financial", next);
                  }}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    set("financial", bc.financial.filter((_, j) => j !== i))
                  }
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                set("financial", [...bc.financial, { label: "", value: "", note: "" }])
              }
            >
              <Plus className="size-4" /> Add line
            </Button>
          </div>
        </SectionCard>

        <SectionCard title="Justification & effectiveness">
          <div className="space-y-4">
            <Field label="Justification" value={bc.justification} onChange={(v) => set("justification", v)} rows={4} />
            <Field label="How we'll ensure it's effective" value={bc.effective} onChange={(v) => set("effective", v)} rows={4} />
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
