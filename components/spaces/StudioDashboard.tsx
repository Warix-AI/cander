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
import { NewStudioMenu } from "@/components/spaces/NewStudioMenu";
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

export function StudioDashboard() {
  const {
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
    useSpaceProjects("studio");

  const projectItems = useMemo(
    () =>
      spaceProjects.map((item) => ({
        id: item.id,
        name: item.title,
        projectId: item.id,
        indexKind: "project" as const,
        meta: editedMeta(item.updatedAt),
        image: projectCoverImageSrc(item.cover) ?? item.cover,
        cover: item.cover,
        space: "studio" as const,
      })),
    [spaceProjects],
  );

  const copy = SPACE_EMPTY_COPY.studio;

  const startStudioProject = (title: string) => {
    if (busy) return;
    openCreate({
      space: "studio",
      kind: "general",
      defaultTitle: title,
      summary: "Create",
    });
  };

  return (
    <>
      <DashFrame
        banner={false}
        title="Studio"
        subtitle="Generate and edit images."
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
              <NewStudioMenu onCreated={openProject} />
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
              kind="paper"
              items={projectItems}
              onOpen={openProject}
              empty={
                <SpaceEmptyCard
                  space="studio"
                  title={copy.title}
                  description={copy.description}
                  actionLabel={copy.actionLabel}
                  busy={busy}
                  onAction={() => startStudioProject("Studio project")}
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
