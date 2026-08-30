"use client";

import { useMemo } from "react";
import { useApp } from "@/components/app/AppProvider";
import {
  DashFrame,
  DashBtn,
  LayoutToggle,
  SpaceSettingsButton,
} from "@/components/spaces/ItemSet";
import { NewExploreMenu } from "@/components/spaces/NewExploreMenu";
import { PreviewGrid } from "@/components/spaces/PreviewCard";
import { editedMeta } from "@/lib/format-relative-time";
import { useSpaceProjects } from "@/lib/hooks/use-space-query";
import { QuerySkeleton } from "@/lib/hooks/space-query-ui";
import { MobileFilterBar } from "@/components/shell/mobile/MobilePanelActions";
import { useMobileShell } from "@/lib/use-media-query";

export function ResearchDashboard() {
  const {
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

  const { data: spaceProjects, loading: projectsLoading } =
    useSpaceProjects("research");

  const projectItems = useMemo(
    () =>
      spaceProjects.map((item) => ({
        id: item.id,
        name: item.title,
        projectId: item.id,
        meta: editedMeta(item.updatedAt),
        image: item.cover,
      })),
    [spaceProjects],
  );

  return (
    <DashFrame
      space="research"
      title="Explore"
      subtitle="Research, browse, analyze, and discover."
      actions={
        <>
          <NewExploreMenu onCreated={openProject} />
          <DashBtn onClick={() => newChat("research")}>Ask</DashBtn>
          <SpaceSettingsButton space="research" />
        </>
      }
    >
      <MobileFilterBar
        active={hoistFilters}
        onNewChat={() => newChat("research")}
        newChatLabel="New search"
        layout={{ value: spaceLayout, onChange: setSpaceLayout }}
      >
        <LayoutToggle layout={spaceLayout} onChange={setSpaceLayout} />
      </MobileFilterBar>

      <div className="mt-5">
        {projectsLoading && !projectItems.length ? (
          <QuerySkeleton rows={2} />
        ) : (
          <PreviewGrid
            layout={spaceLayout}
            kind="paper"
            items={projectItems}
            onOpen={openProject}
            empty="No searches yet. Start a new search to open a tab group."
          />
        )}
      </div>
    </DashFrame>
  );
}
