"use client";

import { Settings2 } from "lucide-react";
import { toast } from "sonner";
import { useUpdateProject } from "@/lib/api/hooks";
import {
  RULES, VIEWS, hiddenSections, ruleEnabled, withAllSectionsShown, withRule, withSectionVisibility,
  type RuleKey, type ViewKey,
} from "@/lib/project-settings";
import type { WorkingSet } from "@/lib/types";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";

/** What a view shows and which rules are on, with setters that save to the
 *  project. */
export function useViewSettings(ws: WorkingSet, projectId: string, view: ViewKey) {
  const updateProject = useUpdateProject(projectId);
  const settings = ws.project.settings;
  const hidden = new Set(hiddenSections(settings, view));

  const save = (next: Record<string, unknown>) =>
    updateProject.mutate(
      { settings: next },
      { onError: (e) => toast.error((e as Error).message) },
    );

  return {
    shows: (section: string) => !hidden.has(section),
    setShown: (section: string, shown: boolean) =>
      save(withSectionVisibility(settings, view, section, shown)),
    showAll: () => save(withAllSectionsShown(settings, view)),
    hiddenCount: hidden.size,
    rule: (key: RuleKey) => ruleEnabled(settings, key),
    setRule: (key: RuleKey, on: boolean) => save(withRule(settings, key, on)),
  };
}

function Row({
  label, hint, checked, onChange,
}: {
  label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <label className="hover:bg-muted flex cursor-pointer items-start justify-between gap-3 rounded-[var(--radius-sm)] px-1.5 py-1.5 text-[12.5px]">
      <span className="min-w-0">
        {label}
        {hint && <span className="text-muted-foreground mt-0.5 block text-[11px] leading-snug">{hint}</span>}
      </span>
      <Switch size="sm" className="mt-0.5" checked={checked} onCheckedChange={(v) => onChange(v === true)} />
    </label>
  );
}

function Heading({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between px-0.5">
      <span className="text-muted-foreground text-[10.5px] font-semibold tracking-[0.08em] uppercase">
        {children}
      </span>
      {action}
    </div>
  );
}

/** The gear on a screen. Two kinds of setting, kept apart: what this screen
 *  shows, and the rules that decide how the tool behaves here. */
export function ViewSettingsButton({
  ws, projectId, view, className,
}: {
  ws: WorkingSet; projectId: string; view: ViewKey; className?: string;
}) {
  const def = VIEWS[view];
  const { shows, setShown, showAll, hiddenCount, rule, setRule } = useViewSettings(ws, projectId, view);
  const rulesOff = def.rules.filter((k) => rule(k) !== RULES[k].default).length;
  const changed = hiddenCount + rulesOff;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={`${def.title} settings`}
          aria-label={`${def.title} settings`}
          className={
            "text-muted-foreground hover:text-foreground hover:bg-muted relative flex size-8 items-center justify-center rounded-[var(--radius-sm)] transition " +
            (className ?? "")
          }
        >
          <Settings2 className="size-4" />
          {changed > 0 && (
            <span className="bg-foreground text-background absolute -top-0.5 -right-0.5 flex size-3.5 items-center justify-center rounded-full font-mono text-[9px]">
              {changed}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 gap-3">
        <span className="px-0.5 text-[13px] font-semibold">{def.title}</span>

        {def.rules.length > 0 && (
          <div className="flex flex-col gap-1">
            <Heading>Rules · how it works</Heading>
            <div className="-mx-1 flex flex-col">
              {def.rules.map((k) => (
                <Row
                  key={k}
                  label={RULES[k].label}
                  hint={RULES[k].hint}
                  checked={rule(k)}
                  onChange={(v) => setRule(k, v)}
                />
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-1 border-t pt-2.5">
          <Heading
            action={hiddenCount > 0 && (
              <button
                type="button"
                onClick={showAll}
                className="text-muted-foreground hover:text-foreground text-[11px] font-medium transition"
              >
                Show all
              </button>
            )}
          >
            View · what you see
          </Heading>
          <div className="-mx-1 flex flex-col">
            {def.toggleable.map((s) => (
              <Row key={s.key} label={s.label} checked={shows(s.key)} onChange={(v) => setShown(s.key, v)} />
            ))}
          </div>
        </div>

        <p className="text-muted-foreground border-t pt-2 text-[11px] leading-snug">
          Always shown: {def.fixed.join(", ")}. Settings apply to everyone on this project.
        </p>
      </PopoverContent>
    </Popover>
  );
}
