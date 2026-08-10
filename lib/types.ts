import type {
  Project,
  Task,
  Risk,
  Stakeholder,
  Member,
  Finding,
  Product,
  Milestone,
  Tag,
  Phase,
  Category,
  External,
  Note,
  Activity,
} from "@/lib/db/schema";

export type { Project, Task, Risk, Stakeholder, Member, Finding, Product, Milestone, Tag, Phase, Category, External, Note, Activity };

/** Everything needed to render a single project's module pages. */
export interface WorkingSet {
  project: Project;
  tasks: Task[];
  risks: Risk[];
  stakeholders: Stakeholder[];
  members: Member[];
  findings: Finding[];
  products: Product[];
  milestones: Milestone[];
  tags: Tag[];
  phases: Phase[];
  categories: Category[];
  externals: External[];
  notes: Note[];
  activity: Activity[];
}

/** Summary row for the projects list. */
export interface ProjectSummary {
  id: string;
  name: string;
  code: string;
  color: string;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
  taskCount: number;
  doneCount: number;
}
