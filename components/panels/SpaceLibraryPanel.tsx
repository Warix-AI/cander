"use client";

import { useApp } from "@/components/app/AppProvider";
import { ProjectsBrowser } from "@/components/panels/ProjectsBrowser";
import { SpaceLibraryBrowser } from "@/components/panels/SpaceLibraryBrowser";
import {
  isSpaceLibrarySpace,
  type SpaceLibraryId,
} from "@/lib/space-library";

export function SpaceLibraryPanel() {
  const {
    spaceId,
    workspaceId,
    openProjectChat,
    openProject,
    openSpaceEntity,
  } = useApp();

  if (spaceId && isSpaceLibrarySpace(spaceId)) {
    return (
      <SpaceLibraryBrowser
        space={spaceId as SpaceLibraryId}
        onOpen={(id, kind) => {
          if (kind === "source") {
            openSpaceEntity({
              type: "source",
              id,
              space: spaceId,
              workspaceId,
            });
            return;
          }
          openProjectChat(id);
        }}
      />
    );
  }

  return <ProjectsBrowser onOpen={openProject} />;
}
