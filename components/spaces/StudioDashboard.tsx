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
      })),
    [spaceProjects],
  );

  return (
    <DashFrame
      banner={false}
      title="Studio"
      subtitle="Images, video, audio, and presentations."
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
            empty="No projects yet. Press + to create one."
          />
        )}
      </div>
    </DashFrame>
  );
}
