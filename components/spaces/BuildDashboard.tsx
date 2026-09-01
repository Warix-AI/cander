"use client";

import { useMemo } from "react";
import { useApp } from "@/components/app/AppProvider";
import {
  DashBtn,
  DashFrame,
  LayoutToggle,
  SpaceSettingsButton,
} from "@/components/spaces/ItemSet";
import { NewBuildMenu } from "@/components/spaces/NewBuildMenu";
import { PreviewGrid } from "@/components/spaces/PreviewCard";
import { editedMeta } from "@/lib/format-relative-time";
import { useSpaceProjects } from "@/lib/hooks/use-space-query";
import { QuerySkeleton } from "@/lib/hooks/space-query-ui";
import { MobileFilterBar } from "@/components/shell/mobile/MobilePanelActions";
import { useMobileShell } from "@/lib/use-media-query";
import {
  creatorLabel,
  sharedWorkspaceAttribution,
} from "@/lib/workspace-membership";
import { getWorkspaceCatalogSnapshot } from "@/lib/workspace-catalog";
import { workspaceKindOf } from "@/lib/workspace-kind";
import { policyFor } from "@/lib/workspace-policy";

export function BuildDashboard() {
  const {
    workspaceId,
    actor,
    openProject,
    newChat,
    spaceLayout,
    setSpaceLayout,
    mobileSurface,
    view,
  } = useApp();
  const mobile = useMobileShell();
  const hoistFilters =
    mobile && view === "space" && mobileSurface === "panel";
  const { data: spaceProjects, loading: projectsLoading } =
    useSpaceProjects("build");

  const workspace = getWorkspaceCatalogSnapshot().find(
    (item) => item.id === workspaceId,
  );
  const showCreator = sharedWorkspaceAttribution(
    policyFor(workspaceId).members.length,
    workspace ? workspaceKindOf(workspace) : undefined,
  );

  const projectItems = useMemo(
    () =>
      spaceProjects.map((item) => ({
        id: item.id,
        name: item.title,
        projectId: item.id,
        indexKind: "project" as const,
        meta: editedMeta(
          item.updatedAt,
          showCreator ? creatorLabel(item.createdBy, actor.id) : null,
        ),
        image: item.cover,
        badge: item.status === "published" ? "Published" : undefined,
      })),
    [spaceProjects, showCreator, actor.id],
  );

  return (
    <DashFrame
      space="build"
      title="Build"
      subtitle="Ship apps, websites, automations, and your recurring tasks."
      actions={
        <>
          <NewBuildMenu onCreated={openProject} />
          <DashBtn onClick={() => newChat("build")}>Ask</DashBtn>
          <SpaceSettingsButton space="build" />
        </>
      }
    >
      <MobileFilterBar
        active={hoistFilters}
        onNewChat={() => newChat("build")}
        newChatLabel="New build"
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
            items={projectItems}
            onOpen={openProject}
            empty="No projects yet. Create one to start building."
          />
        )}
      </div>
    </DashFrame>
  );
}
