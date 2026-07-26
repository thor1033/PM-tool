"use client";

import { useParams } from "next/navigation";
import { ModuleView } from "@/components/project/module-view";

export default function ProjectTabPage() {
  const { id, tab } = useParams<{ id: string; tab: string }>();
  return <ModuleView projectId={id} tab={tab} />;
}
