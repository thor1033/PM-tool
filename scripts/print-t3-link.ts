// Prints a T3 Code prompt link for one sample task, to open by hand.
//   npx tsx scripts/print-t3-link.ts
import { taskBrief, t3PromptLink } from "../lib/code-handoff";

const brief = taskBrief(
  {
    id: "t_duh2aci",
    title: "Give the PM-tool MCP a compact project projection an agent can actually read",
    description:
      "pm_get_project returns ~86KB even when asked only for tasks and milestones. Add a compact projection: one line per task (id, track, status, end, milestoneId, owner, title).",
    status: "inprogress",
    end: "2026-10-09",
    assignees: ["Thor Bøje Simonsen"],
  },
  { projectId: "ca4749f1-624f-437c-9552-6031da90c5f9", projectName: "Teqneo", trackLabel: "PM tool", subtasks: [], dependsOn: [] },
);
console.log(t3PromptLink(brief, { repo: "thor1033/PM-tool" }));
