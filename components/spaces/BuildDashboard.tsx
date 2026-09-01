"use client";

import { useMemo } from "react";
import { useApp } from "@/components/app/AppProvider";
import { useWorkspaceCtx } from "@/components/app/SpaceDataProvider";
import {
  DashBtn,
  DashFrame,
  DashToolbar,
  LayoutToggle,
  useSpaceChatClosed,
} from "@/components/spaces/ItemSet";
import {
  BUILD_CREATE_OPTIONS,
  NewBuildMenu,
} from "@/components/spaces/NewBuildMenu";
import { PreviewGrid } from "@/components/spaces/PreviewCard";
import { editedMeta } from "@/lib/format-relative-time";
import { useSpaceMutation, useSpaceProjects } from "@/lib/hooks/use-space-query";
import { QuerySkeleton } from "@/lib/hooks/space-query-ui";
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
    openSpaceChat,
    spaceLayout,
    setSpaceLayout,
    mobileSurface,
    view,
  } = useApp();
  const ctx = useWorkspaceCtx();
  const { createProject } = useSpaceMutation();
  const mobile = useMobileShell();
  const chatClosed = useSpaceChatClosed();
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
      banner={false}
      title="Build"
      subtitle="Ship apps, websites, automations, and your recurring tasks."
    >
      <DashToolbar
        active={hoistFilters}
        onNewChat={chatClosed ? () => openSpaceChat("build") : undefined}
        newChatLabel="Ask"
        layout={{ value: spaceLayout, onChange: setSpaceLayout }}
        extras={BUILD_CREATE_OPTIONS.map((item) => ({
          id: item.kind,
          label: item.label,
          onClick: () => {
            void createProject(ctx, {
              space: "build",
              title: `New ${item.label}`,
              kind: item.kind,
              summary: item.summary,
            }).then((project) => openProject(project.id));
          },
        }))}
        actions={
          <>
            {chatClosed ? (
              <DashBtn onClick={() => openSpaceChat("build")}>Ask</DashBtn>
            ) : null}
            <NewBuildMenu icon onCreated={openProject} />
          </>
        }
      >
        <LayoutToggle layout={spaceLayout} onChange={setSpaceLayout} />
      </DashToolbar>

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
