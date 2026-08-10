"use client";

import { useProject } from "@/lib/api/hooks";
import { EmptyState } from "@/components/project/ui";
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
  const { error } = useProject(projectId);
  const Module = MODULES[tab];

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
  return <Module projectId={projectId} />;
}
