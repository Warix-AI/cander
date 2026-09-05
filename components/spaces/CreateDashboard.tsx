"use client";

import { useMemo } from "react";
import { useApp } from "@/components/app/AppProvider";
import {
  DashFrame,
  DashBtn,
  DashToolbar,
  LayoutToggle,
  useSpaceChatClosed,
} from "@/components/spaces/ItemSet";
import { NewCanvasMenu } from "@/components/spaces/NewCanvasMenu";
import { PreviewGrid } from "@/components/spaces/PreviewCard";
import {
  SPACE_EMPTY_COPY,
  SpaceEmptyCard,
} from "@/components/spaces/SpaceEmptyCard";
import { useCreateProjectFlow } from "@/components/spaces/use-create-project-flow";
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

export function CreateDashboard() {
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

  const { data: studioProjects, loading: studioLoading } =
    useSpaceProjects("studio");
  const { data: buildProjects, loading: buildLoading } =
    useSpaceProjects("build");
  const { data: researchProjects, loading: researchLoading } =
    useSpaceProjects("research");
  const projectsLoading = studioLoading || buildLoading || researchLoading;

  const workspace = getWorkspaceCatalogSnapshot().find(
    (item) => item.id === workspaceId,
  );
  const showCreator = sharedWorkspaceAttribution(
    policyFor(workspaceId).members.length,
    workspace ? workspaceKindOf(workspace) : undefined,
  );

  const projectItems = useMemo(() => {
    const merged = [
      ...studioProjects,
      ...buildProjects,
      ...researchProjects,
    ].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return merged.map((item) => ({
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
      space: item.space,
      badge: item.status === "published" ? "Published" : undefined,
    }));
  }, [studioProjects, buildProjects, researchProjects, showCreator, actor.id]);

  const copy = SPACE_EMPTY_COPY.studio;

  const startCreate = () => {
    if (busy) return;
    openCreate({
      space: "studio",
      kind: "general",
      defaultTitle: "Image project",
      summary: "Generate and edit images",
    });
  };

  return (
    <>
      <DashFrame
        banner={false}
        title="Canvas"
        subtitle="Search, apps, sites, agents, and images."
      >
        <DashToolbar
          active={hoistFilters}
          onNewChat={chatClosed ? () => openSpaceChat("studio") : undefined}
          newChatLabel="Ask"
          layout={{ value: spaceLayout, onChange: setSpaceLayout }}
          actions={
            <>
              {chatClosed ? (
                <DashBtn onClick={() => openSpaceChat("studio")}>Ask</DashBtn>
              ) : null}
              <NewCanvasMenu onCreated={openProject} />
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
              kind="product"
              items={projectItems}
              onOpen={openProject}
              empty={
                <SpaceEmptyCard
                  space="studio"
                  title={copy.title}
                  description={copy.description}
                  actionLabel={copy.actionLabel}
                  busy={busy}
                  onAction={startCreate}
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
