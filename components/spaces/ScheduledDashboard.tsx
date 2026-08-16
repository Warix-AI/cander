"use client";

import { useMemo, useState } from "react";
import { Kpi } from "@/components/platform/Charts";
import { useApp } from "@/components/app/AppProvider";
import { DashFrame, LayoutToggle, Pill } from "@/components/spaces/ItemSet";
import { scheduledJobs as seed, spaces } from "@/lib/data";
import type { ScheduledJob, ScheduledStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const cadences = [
  "Every weekday 09:00",
  "Every day 07:30",
  "Every Monday 09:00",
  "Every Friday 16:00",
  "1st of each month",
];

export function ScheduledDashboard() {
  const {
    workspaceId,
    jobId,
    openJob,
    openThread,
    spaceLayout,
    setSpaceLayout,
  } = useApp();
  const [jobs, setJobs] = useState<ScheduledJob[]>(seed);

  const visible = useMemo(
    () => jobs.filter((job) => job.workspaceId === workspaceId),
    [jobs, workspaceId],
  );
  const selected =
    visible.find((job) => job.id === jobId) ?? visible[0] ?? null;

  const update = (id: string, patch: Partial<ScheduledJob>) => {
    setJobs((current) =>
      current.map((job) => (job.id === id ? { ...job, ...patch } : job)),
    );
  };

  const counts = {
    upcoming: visible.filter((j) => j.status === "upcoming").length,
    active: visible.filter((j) => j.status === "active").length,
    paused: visible.filter((j) => j.status === "paused").length,
  };

  return (
    <DashFrame
      kicker="Chats that run on a clock"
      title="Scheduled"
      actions={<LayoutToggle layout={spaceLayout} onChange={setSpaceLayout} />}
    >
      <div className="mt-6 flex flex-wrap gap-px overflow-hidden rounded-[10px] border border-border bg-border">
        <Kpi label="Upcoming" value={String(counts.upcoming)} />
        <Kpi label="Active" value={String(counts.active)} />
        <Kpi label="Paused" value={String(counts.paused)} />
        <Kpi label="Failed" value="0" />
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div>
          <p className="mb-3 font-mono text-[10.5px] tracking-[0.08em] text-muted-foreground uppercase">
            Chats
          </p>
          <div className={spaceLayout === "cards" ? "grid gap-3 sm:grid-cols-2" : ""}>
            {visible.map((job) => {
              const space = spaces.find((item) => item.id === job.space)?.label;
              const active = selected?.id === job.id;
              return (
                <button
                  key={job.id}
                  type="button"
                  onClick={() => {
                    openJob(job.id);
                    if (job.threadId) openThread(job.threadId);
                  }}
                  className={cn(
                    "w-full rounded-[10px] border border-border bg-card p-4 text-left transition-colors duration-200 hover:bg-muted",
                    active && "border-foreground/20 bg-muted",
                    spaceLayout === "list" && "mb-1",
                  )}
                >
                  <p className="text-[14px] font-medium tracking-[-0.02em]">
                    {job.name}
                  </p>
                  <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">
                    {job.snippet}
                  </p>
                  <p className="mt-3 font-mono text-[11px] text-muted-foreground">
                    {space} · {job.schedule} · {job.status}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {selected ? (
          <aside className="h-fit rounded-[10px] border border-border bg-card p-4">
            <p className="font-mono text-[10.5px] tracking-[0.08em] text-muted-foreground uppercase">
              Schedule
            </p>
            <p className="mt-2 text-[16px] font-medium tracking-[-0.03em]">
              {selected.name}
            </p>
            <label className="mt-4 block">
              <span className="font-mono text-[11px] text-muted-foreground">
                Cadence
              </span>
              <select
                value={selected.schedule}
                onChange={(event) =>
                  update(selected.id, { schedule: event.target.value })
                }
                className="mt-1 h-10 w-full rounded-[10px] border border-foreground/10 bg-background px-3 text-[13px] outline-none"
              >
                {[selected.schedule, ...cadences.filter((c) => c !== selected.schedule)].map(
                  (option) => (
                    <option key={option}>{option}</option>
                  ),
                )}
              </select>
            </label>
            <div className="mt-3 flex items-baseline justify-between text-[12.5px]">
              <span className="text-muted-foreground">Next</span>
              <span className="font-mono">{selected.nextRun}</span>
            </div>
            <div className="mt-1.5 flex items-baseline justify-between text-[12.5px]">
              <span className="text-muted-foreground">Last</span>
              <span className="font-mono">{selected.lastRun}</span>
            </div>
            <label className="mt-3 block">
              <span className="font-mono text-[11px] text-muted-foreground">
                Status
              </span>
              <select
                value={selected.status}
                onChange={(event) =>
                  update(selected.id, {
                    status: event.target.value as ScheduledStatus,
                  })
                }
                className="mt-1 h-10 w-full rounded-[10px] border border-foreground/10 bg-background px-3 text-[13px] outline-none"
              >
                {["upcoming", "active", "paused", "completed", "failed"].map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>
            </label>
            <div className="mt-4 flex flex-col gap-2">
              <Pill
                onClick={() =>
                  update(selected.id, {
                    status: selected.status === "paused" ? "active" : "paused",
                  })
                }
              >
                {selected.status === "paused" ? "Resume" : "Pause"}
              </Pill>
              {selected.threadId ? (
                <Pill primary onClick={() => openThread(selected.threadId!)}>
                  Open chat
                </Pill>
              ) : null}
            </div>
          </aside>
        ) : (
          <p className="text-[13px] text-muted-foreground">
            No scheduled chats in this workspace.
          </p>
        )}
      </div>
    </DashFrame>
  );
}
