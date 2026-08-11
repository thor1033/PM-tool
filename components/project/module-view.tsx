"use client";

import { useProject, useUpdateProject } from "@/lib/api/hooks";
import { EmptyState } from "@/components/project/ui";
import { Button } from "@/components/ui/button";
import { PROJECT_NAV } from "@/lib/nav";
import { DashboardModule } from "@/components/modules/dashboard";
import { BoardModule } from "@/components/modules/board";
import { BusinessCaseModule } from "@/components/modules/business-case";
import { ScopeModule } from "@/components/modules/scope";
import { PreAnalysisModule } from "@/components/modules/preanalysis";
import { RisksModule } from "@/components/modules/risks";
import { StakeholdersModule } from "@/components/modules/stakeholders";
import { OrgModule } from "@/components/modules/org";
import { CatalogueModule } from "@/components/modules/catalogue";
import { PlansModule } from "@/components/modules/plans";
import { KpisModule } from "@/components/modules/kpis";
import { TaxonomyModule } from "@/components/modules/taxonomy";
import { GlossaryModule } from "@/components/modules/glossary";
import { PlanModule } from "@/components/modules/plan";
import { ActionsModule } from "@/components/modules/actions";
import { AuditModule } from "@/components/modules/audit";
import { WorkspaceModule } from "@/components/modules/workspace";
import { NotesModule } from "@/components/modules/notes";
import { StrategyModule } from "@/components/modules/strategy";
import { FeaturesModule } from "@/components/modules/features";
import { CapacityModule } from "@/components/modules/capacity";
import { FinancialsModule } from "@/components/modules/financials";
import { ForecastModule } from "@/components/modules/forecast";

const MODULES: Record<
  string,
  React.ComponentType<{ projectId: string }>
> = {
  dashboard: DashboardModule,
  actions: ActionsModule,
  board: ActionsModule, // legacy slug — redirect to ActionsModule
  "business-case": BusinessCaseModule,
  scope: ScopeModule,
  preanalysis: PreAnalysisModule,
  risks: RisksModule,
  stakeholders: StakeholdersModule,
  org: OrgModule,
  catalogue: CatalogueModule,
  plans: PlansModule,
  kpis: KpisModule,
  taxonomy: TaxonomyModule,
  glossary: GlossaryModule,
  workspace: WorkspaceModule,
  notes: NotesModule,
  audit: AuditModule,
  strategy: StrategyModule,
  features: FeaturesModule,
  capacity: CapacityModule,
  financials: FinancialsModule,
  forecast: ForecastModule,
  plan: PlanModule,
};

export function ModuleView({
  projectId,
  tab,
}: {
  projectId: string;
  tab: string;
}) {
  const { data, error } = useProject(projectId);
  const updateProject = useUpdateProject(projectId);
  const Module = MODULES[tab];

  // A page switched off in Customise is still reachable by URL (a bookmark, or
  // switching it off while looking at it). Rather than blocking access and
  // stranding the user, show it with a way back on.
  const settings = (data?.project.settings as Record<string, unknown> | undefined) ?? {};
  const hasNavPrefs = Array.isArray(settings.navModules);
  const navModules = hasNavPrefs ? (settings.navModules as string[]) : [];
  const navItem = PROJECT_NAV.find((n) => n.slug === tab);
  const hidden = !!navItem?.group && hasNavPrefs && !navModules.includes(tab);

  if (error) {
    return (
      <EmptyState
        title="Couldn't load this project"
        body={(error as Error).message}
      />
    );
  }
  if (!Module) {
    return <EmptyState title="Unknown section" body={`No module "${tab}".`} />;
  }
  return (
    <>
      {hidden && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] border border-dashed px-4 py-3">
          <p className="text-muted-foreground text-[13.5px]">
            <span className="font-medium">{navItem?.label}</span> is switched off
            for this project, so it isn&rsquo;t in the sidebar.
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              updateProject.mutate({
                settings: { ...settings, navModules: [...navModules, tab] },
              })
            }
          >
            Show it again
          </Button>
        </div>
      )}
      <Module projectId={projectId} />
    </>
  );
}
