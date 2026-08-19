"use client";

import { useApp } from "@/components/app/AppProvider";
import { ProjectsBrowser } from "@/components/panels/ProjectsBrowser";
import {
  isSpaceLibrarySpace,
  spaceLibraryLabel,
} from "@/lib/space-library";

export function SpaceLibraryPanel() {
  const { spaceId, openProjectChat } = useApp();

  if (!spaceId || !isSpaceLibrarySpace(spaceId)) {
    return <ProjectsBrowser />;
  }

  return (
    <ProjectsBrowser
      title={spaceLibraryLabel(spaceId)}
      onOpen={openProjectChat}
    />
  );
}
