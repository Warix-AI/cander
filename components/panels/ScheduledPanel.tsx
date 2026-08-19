"use client";

import { useState } from "react";
import { useApp } from "@/components/app/AppProvider";
import { PanelChrome } from "@/components/panels/PanelChrome";
import { ProjectsBrowser } from "@/components/panels/ProjectsBrowser";
import { Pill } from "@/components/spaces/ItemSet";
import { projects, scheduledJobs as seed } from "@/lib/data";
import type { ScheduledJob, ScheduledStatus } from "@/lib/types";

const cadences = [
  "Every weekday 09:00",
  "Every day 07:30",
  "Every Monday 09:00",
  "Every Friday 16:00",
  "1st of each month",
];

export function ScheduledPanel() {
  const { jobId, openThread, workspaceId, panelIntent } = useApp();
  const [jobs, setJobs] = useState<ScheduledJob[]>(seed);
  const list = jobs.filter((job) => job.workspaceId === workspaceId);
  const selected = list.find((job) => job.id === jobId) ?? list[0];
  const execute = panelIntent === "execute" || Boolean(jobId);
  const project = projects.find((item) => item.id === selected?.projectId);

  const update = (id: string, patch: Partial<ScheduledJob>) => {
    setJobs((current) =>
      current.map((job) => (job.id === id ? { ...job, ...patch } : job)),
    );
  };

  if (!execute) {
    return <ProjectsBrowser />;
  }

  if (!selected) {
    return (
      <p className="p-4 text-[13px] text-muted-foreground">
        No scheduled chats in this workspace.
      </p>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-sidebar">
      <PanelChrome kicker="Scheduled" title={selected.name} />
      <div className="min-h-0 flex-1 overflow-y-auto bg-background">
        <div className="relative h-40 overflow-hidden media-c">
          <div className="grain-layer" />
          <div className="absolute inset-x-0 bottom-0 p-5 text-white">
            <p className="font-mono text-[11px] tracking-[0.08em] text-white/70 uppercase">
              Next {selected.nextRun}
            </p>
            <p className="mt-1 text-[1.35rem] font-semibold tracking-[-0.04em]">
              {selected.name}
            </p>
          </div>
        </div>
        <div className="space-y-3 p-4">
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            {selected.snippet}
          </p>
          <p className="font-mono text-[11px] text-muted-foreground">
            {project?.name ?? selected.space} · {selected.owner}
          </p>
          <label className="block">
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
              {[
                selected.schedule,
                ...cadences.filter((item) => item !== selected.schedule),
              ].map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </label>
          <label className="block">
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
              {["upcoming", "active", "paused", "completed", "failed"].map(
                (id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ),
              )}
            </select>
          </label>
          <div className="flex flex-wrap gap-2 pt-1">
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
        </div>
      </div>
    </div>
  );
}
