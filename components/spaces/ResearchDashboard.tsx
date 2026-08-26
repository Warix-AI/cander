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
import type { Project } from "@/lib/types";
import { MobileFilterBar } from "@/components/shell/mobile/MobilePanelActions";
import { useMobileShell } from "@/lib/use-media-query";

type ExploreScope = "all" | "projects" | "research" | "reports" | "sources";

const exploreScopeOptions = [
  { id: "all", label: "All" },
  { id: "projects", label: "Projects" },
  { id: "research", label: "Research" },
  { id: "reports", label: "Reports" },
  { id: "sources", label: "Sources" },
] as const;

const sourceIds = new Set([
  "competitor-research",
  "pricing-landscape",
  "ai-infrastructure",
]);

function exploreKind(project: Project): "research" | "reports" | "sources" {
  if (sourceIds.has(project.id)) return "sources";
  if (project.threadId) return "research";
  return "reports";
}

export function ResearchDashboard() {
  const {
    workspaceId,
    openProject,
    spaceLayout,
    setSpaceLayout,
    newChat,
    mobileSurface,
    view,
  } = useApp();
  const mobile = useMobileShell();
  const hoistFilters =
    mobile && view === "space" && mobileSurface === "panel";
  const [scope, setScope] = useState<ExploreScope>("all");

  const spaceProjects = useMemo(
    () => projectsInSpace(projects, { space: "research", workspaceId }),
    [workspaceId],
  );
  const visible = useMemo(() => {
    if (scope === "all" || scope === "projects") return spaceProjects;
    return spaceProjects.filter((item) => exploreKind(item) === scope);
  }, [scope, spaceProjects]);

  return (
    <DashFrame
      space="research"
      title="Explore"
      subtitle="Research, browse, analyze, and discover."
      actions={
        <>
          <DashBtn primary onClick={() => newChat("research")}>
            Ask
          </DashBtn>
          <SpaceSettingsButton space="research" />
        </>
      }
    >
      <MobileFilterBar
        active={hoistFilters}
        onNewChat={() => newChat("research")}
        scope={{
          value: scope,
          onChange: (value) => setScope(value as ExploreScope),
          options: [...exploreScopeOptions],
        }}
        layout={{ value: spaceLayout, onChange: setSpaceLayout }}
      >
        <ScopeToggle
          wrap
          value={scope}
          onChange={(value) => setScope(value as ExploreScope)}
          options={[...exploreScopeOptions]}
        />
        <LayoutToggle layout={spaceLayout} onChange={setSpaceLayout} />
      </MobileFilterBar>

      <div className="mt-5">
        <PreviewGrid
          layout={spaceLayout}
          kind={scope === "projects" ? "product" : "paper"}
          items={visible.map((item) => ({
            id: item.id,
            name: item.name,
            projectId: item.id,
            meta:
              scope === "projects"
                ? `Edited ${item.updatedAt}`
                : `${exploreKind(item) === "sources" ? "Source" : exploreKind(item) === "research" ? "Research" : "Report"} · edited ${item.updatedAt}`,
            image: scope === "projects" ? item.cover : undefined,
            bannerKey: scope === "projects" ? undefined : ("research" as const),
            paperPreview:
              scope === "projects"
                ? undefined
                : researchPaperPreviews[item.id] ?? {
                    title: item.name,
                    lines: [item.summary],
                  },
          }))}
          onOpen={openProject}
          empty={
            scope === "projects" ? "No projects yet." : "Nothing in Explore yet."
          }
        />
      </div>
    </DashFrame>
  );
}
