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
import {
  EXPLORE_CREATE_OPTIONS,
  NewExploreMenu,
} from "@/components/spaces/NewExploreMenu";
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

export function ResearchDashboard() {
  const {
    openProject,
    openSpaceChat,
    openQuickSearchBrowser,
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
    useSpaceProjects("research");

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
      })),
    [spaceProjects],
  );

  const copy = SPACE_EMPTY_COPY.research;
  const explore = EXPLORE_CREATE_OPTIONS[0]!;

  const startExploreProject = (title: string) => {
    if (busy) return;
    openCreate({
      space: "research",
      kind: explore.kind,
      defaultTitle: title,
      summary: explore.summary,
    });
  };

  return (
    <>
      <DashFrame
        banner={false}
        title="Home"
        subtitle="Research, browse, analyze, and discover."
      >
        <DashToolbar
          active={hoistFilters}
          onNewChat={chatClosed ? () => openSpaceChat("research") : undefined}
          newChatLabel="Ask"
          layout={{ value: spaceLayout, onChange: setSpaceLayout }}
          extras={[
            {
              id: "quick-search",
              label: "Quick search",
              onClick: () => openQuickSearchBrowser(),
            },
            {
              id: "new-project",
              label: "New project",
              onClick: () => {
                startExploreProject(explore.title);
              },
            },
          ]}
          actions={
            <>
              {chatClosed ? (
                <DashBtn onClick={() => openSpaceChat("research")}>Ask</DashBtn>
              ) : null}
              <NewExploreMenu onCreated={openProject} />
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
                  space="research"
                  title={copy.title}
                  description={copy.description}
                  actionLabel={copy.actionLabel}
                  busy={busy}
                  onAction={() => startExploreProject(explore.title)}
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
