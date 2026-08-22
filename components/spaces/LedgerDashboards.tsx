"use client";

import { useState } from "react";
import { Kpi } from "@/components/platform/Charts";
import { useApp } from "@/components/app/AppProvider";
import { DashFrame, LayoutToggle, Pill, ScopeToggle, SpaceSettingsButton } from "@/components/spaces/ItemSet";
import { PreviewGrid } from "@/components/spaces/PreviewCard";
import { projects, spaceStats } from "@/lib/data";
import type { SpaceId } from "@/lib/types";

export function FinancesDashboard() {
  return <LedgerDashboard space="finances" title="Finances" />;
}

export function HealthDashboard() {
  return <LedgerDashboard space="health" title="Health" />;
}

function LedgerDashboard({
  space,
  title,
}: {
  space: SpaceId;
  title: string;
}) {
  const { workspaceId, openProject, newChat, spaceLayout, setSpaceLayout } =
    useApp();
  const [scope, setScope] = useState("all");
  const items = projects.filter(
    (item) => item.space === space && item.workspaceId === workspaceId,
  );
  const meta = spaceStats[space];

  return (
    <DashFrame
      space={space}
      kicker={meta.kicker}
      title={title}
      actions={
        <>
          <SpaceSettingsButton space={space} />
          <Pill primary onClick={() => newChat(space)}>
            Ask
          </Pill>
        </>
      }
    >
      <div className="mt-6 flex flex-wrap gap-px overflow-hidden rounded-[10px] border border-border bg-border">
        {meta.stats.map((stat) => (
          <Kpi key={stat.label} label={stat.label} value={stat.value} />
        ))}
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
        <PreviewGrid
          layout={spaceLayout}
          kind="product"
          items={items.map((item) => ({
            id: item.id,
            name: item.name,
            projectId: item.id,
            meta: `Edited ${item.updatedAt}`,
            detail: item.summary,
            image: item.cover,
          }))}
          onOpen={openProject}
          empty={`No ${title.toLowerCase()} work in this workspace yet.`}
        />
      </div>
    </DashFrame>
  );
}
