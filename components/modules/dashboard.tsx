"use client";

import Link from "next/link";
import { useProject } from "@/lib/api/hooks";
import { PROJECT_NAV } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { ModuleHeader, SectionCard } from "@/components/project/ui";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { TriangleAlert, Flag, CheckCircle2 } from "lucide-react";

function stat(label: string, value: React.ReactNode, sub?: string) {
  return (
    <div className="rounded-xl border p-4">
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {sub ? <div className="text-muted-foreground text-xs">{sub}</div> : null}
    </div>
  );
}

export function DashboardModule({ projectId }: { projectId: string }) {
  const { data } = useProject(projectId);
  if (!data) return null;
  const { project, tasks, risks, milestones } = data;

  const done = tasks.filter((t) => t.status === "done").length;
  const inprog = tasks.filter((t) => t.status === "inprogress").length;
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
  const openRisks = risks.filter((r) => r.status !== "closed");
  const highRisks = openRisks.filter(
    (r) => r.impact === "high" && r.likelihood === "high",
  );

  const upcoming = [...milestones]
    .filter((m) => m.date)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5);

  return (
    <div>
      <ModuleHeader
        title={project.name}
        description={project.code || "Project overview"}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stat("Progress", `${pct}%`, `${done}/${tasks.length} done`)}
        {stat("In progress", inprog, "active tasks")}
        {stat(
          "Open risks",
          openRisks.length,
          highRisks.length ? `${highRisks.length} critical` : "under control",
        )}
        {stat("Milestones", milestones.length, "planned")}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <SectionCard title="Delivery progress" className="lg:col-span-2">
          <Progress value={pct} className="h-2" />
          <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-slate-400" />
              Backlog{" "}
              <span className="text-muted-foreground ml-auto">
                {tasks.filter((t) => t.status === "backlog").length}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-amber-500" />
              In progress
              <span className="text-muted-foreground ml-auto">{inprog}</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-3.5 text-green-500" />
              Done
              <span className="text-muted-foreground ml-auto">{done}</span>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Top risks">
          {openRisks.length === 0 ? (
            <p className="text-muted-foreground text-sm">No open risks.</p>
          ) : (
            <ul className="space-y-2">
              {openRisks.slice(0, 4).map((r) => (
                <li key={r.id} className="flex items-start gap-2 text-sm">
                  <TriangleAlert
                    className={cn(
                      "mt-0.5 size-3.5 shrink-0",
                      r.impact === "high" ? "text-red-500" : "text-amber-500",
                    )}
                  />
                  <span className="leading-snug">{r.title}</span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      {upcoming.length > 0 && (
        <SectionCard title="Upcoming milestones" className="mt-4">
          <ul className="divide-y">
            {upcoming.map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between gap-3 py-2 text-sm"
              >
                <span className="flex items-center gap-2">
                  <Flag className="text-primary size-3.5" />
                  {m.title}
                  {m.type === "gate" && (
                    <Badge variant="outline" className="text-[10px]">
                      Gate
                    </Badge>
                  )}
                </span>
                <span className="text-muted-foreground">{m.date}</span>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      <div className="mt-6">
        <h3 className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">
          Jump to
        </h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {PROJECT_NAV.filter((n) => n.slug !== "dashboard").map((n) => {
            const Icon = n.icon;
            return (
              <Link
                key={n.slug}
                href={`/projects/${projectId}/${n.slug}`}
                className="hover:border-primary/40 flex items-start gap-3 rounded-lg border p-3 transition"
              >
                <Icon className="text-primary mt-0.5 size-4" />
                <div>
                  <div className="text-sm font-medium">{n.label}</div>
                  <div className="text-muted-foreground text-xs">{n.hint}</div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
