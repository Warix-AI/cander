"use client";

import { useApp } from "@/components/app/AppProvider";
import { SectionLabel } from "@/components/panels/Bits";
import { SegTabs } from "@/components/ui/Controls";
import { projects, scheduledJobs } from "@/lib/data";
import { cn } from "@/lib/utils";

const filters = [
  { id: "upcoming", label: "Upcoming" },
  { id: "active", label: "Active" },
  { id: "paused", label: "Paused" },
  { id: "completed", label: "Completed" },
  { id: "failed", label: "Failed" },
  { id: "history", label: "History" },
];

export function ScheduledPanel() {
  const { scheduledFilter, setScheduledFilter, jobId, openProject, workspaceId } =
    useApp();

  const jobs = scheduledJobs.filter((job) => {
    if (scheduledFilter === "history") return true;
    if (scheduledFilter === "upcoming") {
      return job.status === "upcoming" || job.status === "active";
    }
    return job.status === scheduledFilter;
  });

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-3 py-2">
        <SegTabs
          items={filters}
          value={scheduledFilter}
          onChange={setScheduledFilter}
        />
      </div>
      <div className="p-3 pt-4">
        <SectionLabel>Runs</SectionLabel>
        {jobs.length ? (
          jobs.map((job) => {
            const project = projects.find((item) => item.id === job.projectId);
            return (
              <button
                key={job.id}
                type="button"
                onClick={() => project && openProject(project.id)}
                className={cn(
                  "mb-1 w-full rounded-lg px-3 py-2.5 text-left transition-colors duration-200 hover:bg-muted",
                  jobId === job.id && "bg-muted",
                  job.workspaceId !== workspaceId && "opacity-80",
                )}
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className="text-[13.5px] tracking-[-0.015em]">
                    {job.name}
                  </span>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {job.status}
                  </span>
                </span>
                <span className="mt-1 block text-[12px] text-muted-foreground">
                  {project ? `${project.name} · ` : ""}
                  {job.schedule} · next {job.nextRun}
                </span>
                <span className="mt-0.5 block font-mono text-[10.5px] text-muted-foreground">
                  {job.owner} · last {job.lastRun}
                </span>
              </button>
            );
          })
        ) : (
          <p className="px-3 py-6 text-[13px] text-muted-foreground">
            Nothing in this state. Chat can create a run from any project.
          </p>
        )}
      </div>
    </div>
  );
}
