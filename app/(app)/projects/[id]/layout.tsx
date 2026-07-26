import { ProjectShell } from "@/components/project/project-shell";

export default function ProjectLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ProjectShell>{children}</ProjectShell>;
}
