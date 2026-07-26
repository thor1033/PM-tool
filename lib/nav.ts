import {
  LayoutDashboard,
  KanbanSquare,
  FileText,
  Target,
  Microscope,
  TriangleAlert,
  Users,
  Network,
  Package,
  Megaphone,
  Gauge,
  Tags,
  BookOpen,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  slug: string;
  label: string;
  icon: LucideIcon;
  /** Short description used on the dashboard "jump to" cards. */
  hint: string;
}

/** Module tabs shown inside a project workspace (order matches the sidebar). */
export const PROJECT_NAV: NavItem[] = [
  { slug: "dashboard", label: "Overview", icon: LayoutDashboard, hint: "Project health at a glance" },
  { slug: "board", label: "Board", icon: KanbanSquare, hint: "Tasks, phases and dependencies" },
  { slug: "business-case", label: "Business case", icon: FileText, hint: "Why, outcomes and finances" },
  { slug: "scope", label: "Scope", icon: Target, hint: "In and out of scope" },
  { slug: "preanalysis", label: "Pre-analysis", icon: Microscope, hint: "Findings and as-is / to-be" },
  { slug: "risks", label: "Risks", icon: TriangleAlert, hint: "Risk register and mitigation" },
  { slug: "stakeholders", label: "Stakeholders", icon: Users, hint: "People, influence and interest" },
  { slug: "org", label: "Org chart", icon: Network, hint: "Team structure" },
  { slug: "catalogue", label: "Catalogue", icon: Package, hint: "Deliverables and products" },
  { slug: "plans", label: "Comms & change", icon: Megaphone, hint: "Communication and change plans" },
  { slug: "kpis", label: "KPIs", icon: Gauge, hint: "Metrics and targets" },
  { slug: "taxonomy", label: "Taxonomy", icon: Tags, hint: "Tags, phases and categories" },
  { slug: "glossary", label: "Glossary", icon: BookOpen, hint: "Shared terminology" },
];

export const DEFAULT_PROJECT_TAB = "dashboard";
