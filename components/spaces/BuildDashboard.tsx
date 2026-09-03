"use client";

import { useMemo } from "react";
import { useApp } from "@/components/app/AppProvider";
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
import { useCreateProjectFlow } from "@/components/spaces/use-create-project-flow";
import { PreviewGrid } from "@/components/spaces/PreviewCard";
import {
  SPACE_EMPTY_COPY,
  SpaceEmptyCard,
} from "@/components/spaces/SpaceEmptyCard";
import { editedMeta } from "@/lib/format-relative-time";
import { projectCoverImageSrc } from "@/lib/project-cover";
import { useSpaceProjects } from "@/lib/hooks/use-space-query";
import { QuerySkeleton } from "@/lib/hooks/space-query-ui";
import { useMobileShell } from "@/lib/use-media-query";
import {
  creatorLabel,
  sharedWorkspaceAttribution,
} from "@/lib/workspace-membership";
import { getWorkspaceCatalogSnapshot } from "@/lib/workspace-catalog";
import { workspaceKindOf } from "@/lib/workspace-kind";
import { policyFor } from "@/lib/workspace-policy";
import type { ProjectKind } from "@/lib/space-entities";

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
  const { openCreate, busy, modal } = useCreateProjectFlow(openProject);
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
        image: projectCoverImageSrc(item.cover) ?? item.cover,
        cover: item.cover,
        badge: item.status === "published" ? "Published" : undefined,
      })),
    [spaceProjects, showCreator, actor.id],
  );

  const copy = SPACE_EMPTY_COPY.build;

  const startBuild = (kind: ProjectKind, label: string) => {
    if (busy) return;
    const option =
      BUILD_CREATE_OPTIONS.find((item) => item.kind === kind) ??
      BUILD_CREATE_OPTIONS[0]!;
    openCreate({
      space: "build",
      kind: option.kind,
      defaultTitle: `New ${label}`,
      summary: option.summary,
    });
  };

  return (
    <>
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
            onClick: () =>
              openCreate({
                space: "build",
                kind: item.kind,
                defaultTitle: `New ${item.label}`,
                summary: item.summary,
              }),
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
              empty={
                <SpaceEmptyCard
                  space="build"
                  title={copy.title}
                  description={copy.description}
                  actionLabel={copy.actionLabel}
                  busy={busy}
                  onAction={() => startBuild("app", "App")}
                />
              }
            />
          )}
        </div>
      </DashFrame>
      {modal}
    </>
  );
}
