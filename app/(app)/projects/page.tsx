import { ProjectsView } from "@/components/projects/projects-view";
import { CreateProjectDialog } from "@/components/projects/create-project-dialog";
import { ImportDialog } from "@/components/projects/import-dialog";

export default function ProjectsPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="text-muted-foreground text-sm">
            Every client engagement, tracked end to end.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ImportDialog />
          <CreateProjectDialog />
        </div>
      </div>
      <ProjectsView />
    </div>
  );
}
