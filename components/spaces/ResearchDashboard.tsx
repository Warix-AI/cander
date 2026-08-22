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
import { projects, researchPaperPreviews } from "@/lib/data";
import { projectsInSpace } from "@/lib/selectors";

type ResearchScope = "all" | "reports" | "papers";

const paperIds = new Set([
  "competitor-research",
  "pricing-landscape",
  "ai-infrastructure",
]);

function researchKind(id: string): "papers" | "reports" {
  return paperIds.has(id) ? "papers" : "reports";
}

export function ResearchDashboard() {
  const {
    workspaceId,
    openProject,
    spaceLayout,
    setSpaceLayout,
    newChat,
  } = useApp();
  const [scope, setScope] = useState<ResearchScope>("all");

  const spaceProjects = useMemo(
    () => projectsInSpace(projects, { space: "research", workspaceId }),
    [workspaceId],
  );
  const visible = useMemo(() => {
    if (scope === "all") return spaceProjects;
    return spaceProjects.filter((item) => researchKind(item.id) === scope);
  }, [scope, spaceProjects]);

  return (
    <DashFrame
      space="research"
      title="Research"
      subtitle="Find sources, take notes, and cite your findings."
      actions={
        <>
          <DashBtn primary onClick={() => newChat("research")}>
            Ask
          </DashBtn>
          <SpaceSettingsButton space="research" />
        </>
      }
    >
      <div className="flex flex-col gap-3 @min-[420px]:flex-row @min-[420px]:flex-wrap @min-[420px]:items-center @min-[420px]:justify-between">
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
            bannerKey: "research" as const,
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
