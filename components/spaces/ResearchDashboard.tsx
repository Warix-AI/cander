"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/components/app/AppProvider";
import {
  DashFrame,
  DashBtn,
  LayoutToggle,
  ScopeToggle,
  SpaceSettingsButton,
} from "@/components/spaces/ItemSet";
import { PreviewGrid } from "@/components/spaces/PreviewCard";
import { projects, researchPaperPreviews, spaceStats } from "@/lib/data";

type ResearchScope = "all" | "reports" | "papers";

const paperIds = new Set([
  "competitor-research",
  "pricing-landscape",
  "ai-infrastructure",
]);

function researchKind(id: string): "papers" | "reports" {
  return paperIds.has(id) ? "papers" : "reports";
}

function researchCta(scope: ResearchScope) {
  if (scope === "reports") return "New report";
  if (scope === "papers") return "New paper";
  return "New research";
}

export function ResearchDashboard() {
  const {
    workspaceId,
    openProject,
    spaceLayout,
    setSpaceLayout,
    openBrowser,
  } = useApp();
  const [scope, setScope] = useState<ResearchScope>("all");

  const spaceProjects = projects.filter(
    (item) => item.space === "research" && item.workspaceId === workspaceId,
  );
  const visible = useMemo(() => {
    if (scope === "all") return spaceProjects;
    return spaceProjects.filter((item) => researchKind(item.id) === scope);
  }, [scope, spaceProjects]);
  const meta = spaceStats.research;

  return (
    <DashFrame
      space="research"
      kicker={meta.kicker}
      title="Research"
      subtitle="Browse, save sources, and turn findings into something you can cite."
      actions={
        <>
          <SpaceSettingsButton space="research" />
          <DashBtn
            primary
            onClick={() => openBrowser({ chat: true })}
          >
            {researchCta(scope)}
          </DashBtn>
        </>
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ScopeToggle
          value={scope}
          onChange={(value) => setScope(value as ResearchScope)}
          options={[
            { id: "all", label: "All" },
            { id: "reports", label: "Reports" },
            { id: "papers", label: "Papers" },
          ]}
        />
        <LayoutToggle layout={spaceLayout} onChange={setSpaceLayout} />
      </div>

      <div className="mt-5">
        <PreviewGrid
          layout={spaceLayout}
          kind="paper"
          items={visible.map((item) => ({
            id: item.id,
            name: item.name,
            projectId: item.id,
            meta: `${researchKind(item.id) === "papers" ? "Paper" : "Report"} · edited ${item.updatedAt}`,
            paperPreview: researchPaperPreviews[item.id] ?? {
              title: item.name,
              lines: [item.summary],
            },
          }))}
          onOpen={openProject}
          empty="No research yet."
        />
      </div>
    </DashFrame>
  );
}
