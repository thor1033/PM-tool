import {
  LayoutDashboard,
  KanbanSquare,
  FileText,
  Target,
  Microscope,
  TriangleAlert,
  Users,
  Network,
  Files,
  Megaphone,
  Gauge,
  Tag,
  BotMessageSquare,
  ListTodo,
  BarChart3,
  TrendingUp,
  Lightbulb,
  Boxes,
  History,
  Layers,
  NotebookPen,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  slug: string;
  label: string;
  icon: LucideIcon;
  /** Short description used on the dashboard "jump to" cards. */
  hint: string;
  /** Collapsible group this item belongs to. Items without a group are always visible. */
  group?: "overview" | "strategy" | "delivery";
}

/** Module tabs shown inside a project workspace (order matches the sidebar). */
export const PROJECT_NAV: NavItem[] = [
  { slug: "dashboard",  label: "Overview",            icon: LayoutDashboard, hint: "Project health at a glance" },
  { slug: "workspace",  label: "Workspace",            icon: Layers,          hint: "Per-person task hub" },
  { slug: "actions",    label: "Tasks",                icon: ListTodo,        hint: "Tasks, kanban, gantt and calendar" },
  { slug: "business-case", label: "Business case",    icon: FileText,        hint: "Why, outcomes and finances",         group: "overview" },
  { slug: "scope",         label: "Scope",            icon: Target,          hint: "In and out of scope",                group: "overview" },
  { slug: "notes",         label: "Notes",            icon: NotebookPen,     hint: "Notes by track or task",             group: "overview" },
  { slug: "preanalysis",   label: "Pre-analysis",     icon: Microscope,      hint: "Findings and as-is / to-be",         group: "overview" },
  { slug: "risks",         label: "Risks",            icon: TriangleAlert,   hint: "Risk register and mitigation",        group: "overview" },
  { slug: "stakeholders",  label: "Stakeholders",     icon: Users,           hint: "People, influence and interest",      group: "overview" },
  { slug: "org",           label: "Org chart",        icon: Network,         hint: "Team structure",                      group: "overview" },
  { slug: "catalogue",     label: "Files",            icon: Files,           hint: "Files and deliverables",              group: "overview" },
  { slug: "plans",         label: "Comms & change",   icon: Megaphone,       hint: "Communication and change plans",      group: "overview" },
  { slug: "kpis",          label: "KPIs",             icon: Gauge,           hint: "Metrics and targets",                 group: "overview" },
  { slug: "glossary",      label: "Glossary",         icon: Tag,             hint: "Terms highlighted across the project", group: "overview" },
  { slug: "strategy",      label: "Strategy",         icon: Lightbulb,       hint: "Mission, canvases, personas and GTM", group: "strategy" },
  { slug: "features",      label: "Features & packages", icon: Boxes,        hint: "Feature library and bundled packages",group: "strategy" },
  { slug: "capacity",      label: "Capacity",         icon: BarChart3,       hint: "Team load vs capacity heatmap",       group: "delivery" },
  { slug: "financials",    label: "Financials",       icon: TrendingUp,      hint: "Contract, budget and progress",       group: "delivery" },
  { slug: "forecast",      label: "Forecast",         icon: Gauge,           hint: "Critical path, buffer and delays",    group: "delivery" },
  { slug: "audit",         label: "Audit trail",      icon: History,         hint: "Every change kept for 5 weeks",       group: "delivery" },
  { slug: "plan",          label: "Update plan from chat", icon: BotMessageSquare, hint: "AI-powered plan updates",      group: "delivery" },
];

export const DEFAULT_PROJECT_TAB = "dashboard";
