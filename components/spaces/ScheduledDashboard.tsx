"use client";

import { useMemo, useState } from "react";
import {
  AreaChart,
  ChartCard,
  FunnelChart,
  Kpi,
} from "@/components/ui/Charts";
import { useApp } from "@/components/app/AppProvider";
import { DashBtn, DashFrame, LayoutToggle, ScopeToggle, SpaceSettingsButton } from "@/components/spaces/ItemSet";
import { PreviewGrid } from "@/components/spaces/PreviewCard";
import { projects, scheduledJobs, spaceStats } from "@/lib/data";
import type { ScheduledJob } from "@/lib/types";

const runSeries = [2, 3, 2, 4, 5, 4, 6, 7, 6, 8, 7, 9];

export function ScheduledDashboard() {
  const {
    workspaceId,
    openJob,
    newChat,
    spaceLayout,
    setSpaceLayout,
  } = useApp();
  const [scope, setScope] = useState("all");

  const visible = scheduledJobs.filter((job) => job.workspaceId === workspaceId);
  const meta = spaceStats.scheduled;
  const grouped = useMemo(() => {
    const names = new Map(projects.map((item) => [item.id, item.name]));
    const groups: { id: string; name: string; items: ScheduledJob[] }[] = [];
    for (const job of visible) {
      const key = job.projectId ?? job.space;
      const current = groups.find((group) => group.id === key);
      if (current) current.items.push(job);
      else {
        groups.push({
          id: key,
          name: names.get(job.projectId ?? "") ?? job.space,
          items: [job],
        });
      }
    }
    return groups;
  }, [visible]);

  const counts = {
    upcoming: visible.filter((job) => job.status === "upcoming").length,
    active: visible.filter((job) => job.status === "active").length,
    paused: visible.filter((job) => job.status === "paused").length,
  };

  return (
    <DashFrame
      space="scheduled"
      kicker={meta.kicker}
      title="Scheduled"
      actions={
        <>
          <SpaceSettingsButton space="scheduled" />
          <DashBtn primary onClick={() => newChat("build")}>
            Ask
          </DashBtn>
        </>
      }
    >
      <div className="mt-6 flex flex-wrap gap-px overflow-hidden rounded-[10px] border border-border bg-border">
        <Kpi label="Upcoming" value={String(counts.upcoming)} />
        <Kpi label="Active" value={String(counts.active)} />
        <Kpi label="Paused" value={String(counts.paused)} />
        <Kpi label="Failed" value="0" />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 @min-[560px]:grid-cols-2">
        <ChartCard title="Runs this month" hint="Last 12 weeks">
          <AreaChart values={runSeries} />
        </ChartCard>
        <ChartCard title="How work ships" hint="This workspace">
          <FunnelChart
            stages={[
              { label: "Scheduled", value: String(visible.length), pct: 100 },
              { label: "Active", value: String(counts.active), pct: 48 },
              { label: "Upcoming", value: String(counts.upcoming), pct: 32 },
              { label: "Paused", value: String(counts.paused), pct: 14 },
            ]}
          />
        </ChartCard>
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <ScopeToggle
          value={scope}
          onChange={setScope}
          options={[
            { id: "all", label: "All" },
            { id: "projects", label: "Projects" },
          ]}
        />
        <LayoutToggle layout={spaceLayout} onChange={setSpaceLayout} />
      </div>

      <div className="mt-4">
        {scope === "all" ? (
          <PreviewGrid
            layout={spaceLayout}
            kind="schedule"
            items={visible.map(toEntry)}
            onOpen={openJob}
            empty="No scheduled work in this workspace."
          />
        ) : (
          <div className="space-y-8">
            {grouped.map((group) => (
              <div key={group.id}>
                <p className="mb-3 font-mono text-[10.5px] tracking-[0.08em] text-muted-foreground uppercase">
                  {group.name}
                </p>
                <PreviewGrid
                  layout={spaceLayout}
                  kind="schedule"
                  items={group.items.map(toEntry)}
                  onOpen={openJob}
                  empty="Nothing here."
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </DashFrame>
  );
}

function toEntry(item: ScheduledJob) {
  const badge =
    item.status === "active"
      ? "Active"
      : item.status === "paused"
        ? "Paused"
        : item.status === "upcoming"
          ? "Upcoming"
          : undefined;
  return {
    id: item.id,
    name: item.name,
    projectId: item.id,
    meta: `${item.schedule} · next ${item.nextRun}`,
    detail: item.nextRun,
    badge,
  };
}
