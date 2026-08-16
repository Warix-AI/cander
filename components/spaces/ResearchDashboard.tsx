"use client";

import { AreaChart, ChartCard, FunnelChart, Kpi } from "@/components/platform/Charts";
import { useApp } from "@/components/app/AppProvider";
import { DashFrame, ItemSet, LayoutToggle, Pill } from "@/components/spaces/ItemSet";
import { projects, researchSources, spaceStats } from "@/lib/data";

const sourceSeries = [8, 10, 9, 14, 16, 13, 18, 21, 19, 24, 28, 27];

export function ResearchDashboard() {
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
    (item) => item.space === "research" && item.workspaceId === workspaceId,
  );
  const activity = threads.filter(
    (item) => item.spaceId === "research" && item.workspaceId === workspaceId,
  );
  const meta = spaceStats.research;

  return (
    <DashFrame
      kicker={meta.kicker}
      title="Research"
      actions={
        <>
          <LayoutToggle layout={spaceLayout} onChange={setSpaceLayout} />
          <Pill primary onClick={() => newChat("research")}>
            New Research chat
          </Pill>
        </>
      }
    >
      <div className="mt-6 flex flex-wrap gap-px overflow-hidden rounded-[10px] border border-border bg-border">
        <Kpi label="Sources" value="37" delta="+5 this week" />
        <Kpi label="Notes" value="18" />
        <Kpi label="Reports" value="5" />
        <Kpi label="Citations" value="112" delta="+14" />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <ChartCard title="Sources saved" hint="Last 12 weeks">
          <AreaChart values={sourceSeries} />
        </ChartCard>
        <ChartCard title="From browse to report">
          <FunnelChart
            stages={[
              { label: "Pages opened", value: "84", pct: 100 },
              { label: "Sources kept", value: "37", pct: 44 },
              { label: "Notes", value: "18", pct: 22 },
              { label: "Reports", value: "5", pct: 8 },
            ]}
          />
        </ChartCard>
      </div>

      <div className="mt-8">
        <p className="mb-3 font-mono text-[10.5px] tracking-[0.08em] text-muted-foreground uppercase">
          Latest sources
        </p>
        <ItemSet
          layout="list"
          items={researchSources.map((source) => ({
            id: source.url,
            title: source.title,
            snippet: source.url,
            meta: source.tag,
          }))}
          empty="No sources yet."
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
          empty="No Research projects yet."
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
          empty="Research chats land here."
        />
      </div>
    </DashFrame>
  );
}
