"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Rows3, GitBranch, Calendar, KanbanSquare, Tag } from "lucide-react";
import { useProject } from "@/lib/api/hooks";
import { taskMatchesFilter } from "@/lib/tasks";
import type { Task, Milestone } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ModuleHeader } from "@/components/project/ui";
import { CardModal } from "@/components/project/card-modal";
import { MilestoneModal } from "@/components/project/milestone-modal";
import { CategoriesModal } from "@/components/project/categories-modal";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ListView } from "@/components/modules/actions/list-view";
import { TimelineView } from "@/components/modules/actions/timeline-view";
import { CalendarView } from "@/components/modules/actions/calendar-view";
import { KanbanView } from "@/components/modules/actions/kanban-view";
import type { ActionsView } from "@/components/modules/actions/shared";
import { VIEW_STORAGE_KEY } from "@/components/modules/actions/shared";

const VIEWS: { id: ActionsView | "kanban"; label: string; icon: typeof Rows3 }[] = [
  { id: "list", label: "List", icon: Rows3 },
  { id: "timeline", label: "Timeline", icon: GitBranch },
  { id: "calendar", label: "Calendar", icon: Calendar },
  { id: "kanban", label: "Kanban", icon: KanbanSquare },
];

type View = (typeof VIEWS)[number]["id"];

export function ActionsModule({ projectId }: { projectId: string }) {
  const { data: ws } = useProject(projectId);
  const [view, setView] = useState<View>("list");
  const [fCat, setFCat] = useState<string[]>([]);
  const [fWho, setFWho] = useState<string[]>([]);
  const [taskDialog, setTaskDialog] = useState<{ open: boolean; task: Task | null; defaultCategoryId?: string | null; defaultStatus?: string }>({ open: false, task: null });
  const [msDialog, setMsDialog] = useState<{ open: boolean; milestone: Milestone | null; defaultCategoryId?: string | null }>({ open: false, milestone: null });
  const [catDialogOpen, setCatDialogOpen] = useState(false);

  // restore + persist the chosen view per browser, matching the reference app
  useEffect(() => {
    try {
      const saved = localStorage.getItem(VIEW_STORAGE_KEY) as View | null;
      if (saved && VIEWS.some((v) => v.id === saved)) setView(saved);
    } catch {
      // ignore
    }
  }, []);
  function changeView(v: View) {
    setView(v);
    try { localStorage.setItem(VIEW_STORAGE_KEY, v); } catch { /* ignore */ }
  }

  if (!ws) return null;

  // Dependency lookups always resolve against the FULL task list — filtering
  // only changes what's rendered, never whether a block resolves correctly.
  const filtered = useMemo(
    () => ws.tasks.filter((t) => taskMatchesFilter(t, fCat, fWho)),
    [ws.tasks, fCat, fWho],
  );
  const hasActiveFilter = fCat.length > 0 || fWho.length > 0;

  function openTask(t: Task | null, defaultCategoryId?: string | null, defaultStatus?: string) {
    setTaskDialog({ open: true, task: t, defaultCategoryId, defaultStatus });
  }
  function openMilestone(m: Milestone | null, defaultCategoryId?: string | null) {
    setMsDialog({ open: true, milestone: m, defaultCategoryId });
  }

  return (
    <div>
      <ModuleHeader
        eyebrow="Delivery"
        title="Actions & timeline"
        description="Tasks, gantt, calendar and kanban — grouped by track or sorted by date, one source of truth."
        actions={
          <>
            <Button variant="outline" onClick={() => setCatDialogOpen(true)}>
              <Tag className="size-4" /> Categories
            </Button>
            {view !== "kanban" && (
              <Button onClick={() => openTask(null)}>
                <Plus className="size-4" /> Add task
              </Button>
            )}
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-[var(--radius-sm)] border bg-[var(--paper-2)] p-1">
          {VIEWS.map((v) => {
            const Icon = v.icon;
            const active = view === v.id;
            return (
              <button
                key={v.id}
                onClick={() => changeView(v.id)}
                className={cn(
                  "flex items-center gap-1.5 rounded-[6px] px-3 py-1.5 text-xs font-semibold transition",
                  active ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-3.5" /> {v.label}
              </button>
            );
          })}
        </div>

        {view !== "kanban" && (
          <div className="flex flex-wrap items-center gap-2.5">
            <Select value={fCat[0] ?? "all"} onValueChange={(v) => setFCat(v === "all" ? [] : [v])}>
              <SelectTrigger className="h-8 w-40 text-xs"><SelectValue placeholder="All tracks" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All tracks</SelectItem>
                {ws.categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={fWho[0] ?? "all"} onValueChange={(v) => setFWho(v === "all" ? [] : [v])}>
              <SelectTrigger className="h-8 w-40 text-xs"><SelectValue placeholder="Anyone" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Anyone</SelectItem>
                <SelectItem value="__unassigned">Unassigned</SelectItem>
                {ws.members.map((m) => <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {hasActiveFilter && (
              <button onClick={() => { setFCat([]); setFWho([]); }} className="text-muted-foreground hover:text-foreground text-xs font-medium transition">
                Clear filters
              </button>
            )}
          </div>
        )}
      </div>

      {view === "list" && (
        <ListView
          ws={ws} projectId={projectId} filtered={filtered} hasActiveFilter={hasActiveFilter}
          onEdit={openTask} onEditMilestone={openMilestone}
        />
      )}
      {view === "timeline" && (
        <TimelineView ws={ws} projectId={projectId} filtered={filtered} onEdit={openTask} onEditMilestone={(m) => openMilestone(m)} />
      )}
      {view === "calendar" && (
        <CalendarView ws={ws} filtered={filtered} onEdit={openTask} onEditMilestone={(m) => openMilestone(m)} />
      )}
      {view === "kanban" && (
        <KanbanView
          ws={ws} projectId={projectId}
          onOpen={(t) => openTask(t)}
          onNew={(status) => openTask(null, undefined, status)}
        />
      )}

      {taskDialog.open && (
        <CardModal
          ws={ws} projectId={projectId} task={taskDialog.task}
          defaultCategoryId={taskDialog.defaultCategoryId} defaultStatus={taskDialog.defaultStatus}
          open={taskDialog.open} onOpenChange={(v) => setTaskDialog((d) => ({ ...d, open: v }))}
        />
      )}
      {msDialog.open && (
        <MilestoneModal
          ws={ws} projectId={projectId} milestone={msDialog.milestone} defaultCategoryId={msDialog.defaultCategoryId}
          open={msDialog.open} onOpenChange={(v) => setMsDialog((d) => ({ ...d, open: v }))}
        />
      )}
      {catDialogOpen && (
        <CategoriesModal ws={ws} projectId={projectId} open={catDialogOpen} onOpenChange={setCatDialogOpen} />
      )}
    </div>
  );
}
