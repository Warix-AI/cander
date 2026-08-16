"use client";

import {
  AreaChart,
  ChartCard,
  FunnelChart,
  Kpi,
} from "@/components/platform/Charts";
import { useApp } from "@/components/app/AppProvider";
import { DashFrame, ItemSet, LayoutToggle, Pill } from "@/components/spaces/ItemSet";
import { projects, spaceStats } from "@/lib/data";

const previewSeries = [4, 6, 5, 8, 7, 11, 9, 12, 14, 13, 16, 18];

export function BuildDashboard() {
  const {
    workspaceId,
    projectId,
    openProject,
    openThread,
    newChat,
    threads,
    spaceLayout,
    setSpaceLayout,
  } = useApp();

  const spaceProjects = projects.filter(
    (item) => item.space === "build" && item.workspaceId === workspaceId,
  );
  const activity = threads.filter(
    (item) => item.spaceId === "build" && item.workspaceId === workspaceId,
  );
  const meta = spaceStats.build;

  return (
    <DashFrame
      kicker={meta.kicker}
      title="Build"
      actions={
        <>
          <LayoutToggle layout={spaceLayout} onChange={setSpaceLayout} />
          <Pill primary onClick={() => newChat("build")}>
            New Build chat
          </Pill>
        </>
      }
    >
      <div className="mt-6 flex flex-wrap gap-px overflow-hidden rounded-[10px] border border-border bg-border">
        {meta.stats.map((stat) => (
          <Kpi key={stat.label} label={stat.label} value={stat.value} />
        ))}
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <ChartCard title="Previews this month" hint="Last 12 weeks">
          <AreaChart values={previewSeries} />
        </ChartCard>
        <ChartCard title="Ship funnel" hint="This workspace">
          <FunnelChart
            stages={[
              { label: "Chats", value: String(activity.length + 9), pct: 100 },
              { label: "Previews", value: "11", pct: 62 },
              { label: "PRs", value: "4", pct: 28 },
              { label: "Deploys", value: "2", pct: 12 },
            ]}
          />
        </ChartCard>
      </div>

      <div className="mt-8">
        <p className="mb-3 font-mono text-[10.5px] tracking-[0.08em] text-muted-foreground uppercase">
          Live previews
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {spaceProjects.map((item, index) => (
            <button
              key={item.id}
              type="button"
              onClick={() => openProject(item.id)}
              className={`relative aspect-[16/10] overflow-hidden rounded-[10px] text-left text-white ${
                ["media-a", "media-b", "media-c"][index % 3]
              }`}
            >
              <div className="grain-layer" />
              <p className="relative px-4 pt-4 font-mono text-[11px] tracking-[0.08em] text-white/70 uppercase">
                localhost
              </p>
              <div className="relative mt-auto px-4 pb-4 pt-12">
                <p className="text-[16px] font-medium tracking-[-0.03em]">
                  {item.name}
                </p>
                <p className="mt-1 text-[12.5px] text-white/75">{item.summary}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-8">
        <p className="mb-3 font-mono text-[10.5px] tracking-[0.08em] text-muted-foreground uppercase">
          Pull requests
        </p>
        <ItemSet
          layout="list"
          items={[
            {
              id: "pr-1",
              title: "Pricing copy pass",
              snippet: "cander · waiting on review",
              meta: "Open",
            },
            {
              id: "pr-2",
              title: "Hero density",
              snippet: "cander · you requested changes",
              meta: "Open",
            },
            {
              id: "pr-3",
              title: "Portal auth shell",
              snippet: "client-portal · draft",
              meta: "Draft",
            },
          ]}
          empty="No pull requests."
        />
      </div>

      <div className="mt-8">
        <p className="mb-3 font-mono text-[10.5px] tracking-[0.08em] text-muted-foreground uppercase">
          Projects
        </p>
        <ItemSet
          layout={spaceLayout}
          items={spaceProjects.map((item) => ({
            id: item.id,
            title: item.name,
            meta: item.updatedAt,
            snippet: item.summary,
            active: projectId === item.id,
            onClick: () => openProject(item.id),
          }))}
          empty="No Build projects yet."
        />
      </div>

      <div className="mt-8">
        <p className="mb-3 font-mono text-[10.5px] tracking-[0.08em] text-muted-foreground uppercase">
          Chats
        </p>
        <ItemSet
          layout={spaceLayout}
          items={activity.map((item) => ({
            id: item.id,
            title: item.title,
            meta: item.updatedAt,
            snippet: item.snippet,
            onClick: () => openThread(item.id),
          }))}
          empty="Build chats land here."
        />
      </div>
    </DashFrame>
  );
}
