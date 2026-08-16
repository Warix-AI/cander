"use client";

import { AreaChart, ChartCard, Kpi } from "@/components/platform/Charts";
import { useApp } from "@/components/app/AppProvider";
import { DashFrame, ItemSet, LayoutToggle, Pill } from "@/components/spaces/ItemSet";
import { projects, spaceStats } from "@/lib/data";

const exportSeries = [2, 3, 2, 5, 8, 6, 9, 7, 11, 10, 12, 14];
const mesh = ["media-a", "media-b", "media-c", "media-d"] as const;

export function StudioDashboard() {
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
    (item) => item.space === "studio" && item.workspaceId === workspaceId,
  );
  const activity = threads.filter(
    (item) => item.spaceId === "studio" && item.workspaceId === workspaceId,
  );
  const meta = spaceStats.studio;
  const tools = [
    { id: "retouch", label: "Retouch", hint: "Color, crop, cleanup" },
    { id: "bg", label: "Background", hint: "Remove or replace" },
    { id: "video", label: "Text to video", hint: "8s clips from a prompt" },
    { id: "still", label: "Generate", hint: "Stills on the canvas" },
  ];

  return (
    <DashFrame
      kicker={meta.kicker}
      title="Studio"
      actions={
        <>
          <LayoutToggle layout={spaceLayout} onChange={setSpaceLayout} />
          <Pill primary onClick={() => newChat("studio")}>
            New Studio chat
          </Pill>
        </>
      }
    >
      <div className="mt-6 flex flex-wrap gap-px overflow-hidden rounded-[10px] border border-border bg-border">
        <Kpi label="Assets" value="48" delta="+6 this week" />
        <Kpi label="Videos queued" value="1" />
        <Kpi label="Exports" value="6" delta="+2" />
        <Kpi label="Retouches" value="14" />
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tools.map((tool, index) => (
          <button
            key={tool.id}
            type="button"
            onClick={() => newChat("studio")}
            className={`relative min-h-[8.5rem] overflow-hidden rounded-[10px] p-4 text-left text-white ${mesh[index]}`}
          >
            <p className="relative font-mono text-[10.5px] tracking-[0.08em] text-white/70 uppercase">
              Tool
            </p>
            <p className="relative mt-8 text-[16px] font-medium tracking-[-0.03em]">
              {tool.label}
            </p>
            <p className="relative mt-1 text-[12.5px] text-white/75">{tool.hint}</p>
          </button>
        ))}
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <ChartCard title="Exports" hint="Last 12 weeks">
          <AreaChart values={exportSeries} />
        </ChartCard>
        <ChartCard title="Library">
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className={`aspect-square overflow-hidden rounded-[10px] ${mesh[i % 4]}`}
              />
            ))}
          </div>
        </ChartCard>
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
          empty="No Studio projects yet."
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
          empty="Studio chats land here."
        />
      </div>
    </DashFrame>
  );
}
