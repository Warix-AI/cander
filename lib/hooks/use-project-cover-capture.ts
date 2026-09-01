"use client";

import { useEffect, useRef } from "react";
import { useSpaceData } from "@/components/app/SpaceDataProvider";
import { useSpaceMutation } from "@/lib/hooks/use-space-query";
import {
  cancelProjectPreviewCoverCapture,
  scheduleProjectPreviewCoverCapture,
} from "@/lib/project-preview-cover";
import { getBrowserSurfaceAdapter } from "@/lib/browser-surface";

/** After a build/explore preview finishes loading, snapshot the tab into project.cover. */
export function useProjectCoverCapture(opts: {
  tabId: string | null;
  projectId: string | null;
  tabKind: string | null;
  surfaceActive: boolean;
}) {
  const { tabId, projectId, tabKind, surfaceActive } = opts;
  const { ctx } = useSpaceData();
  const { updateProject } = useSpaceMutation();
  const updateRef = useRef(updateProject);
  updateRef.current = updateProject;

  useEffect(() => {
    if (!tabId || !projectId || !surfaceActive) return;
    if (tabKind !== "build-preview" && tabKind !== "project-preview") return;

    const adapter = getBrowserSurfaceAdapter();
    if (adapter.id === "web-pwa") return;

    const unsub = adapter.subscribe((event) => {
      if (event.tabId !== tabId) return;
      if (event.type !== "loading" || !("loading" in event) || event.loading) {
        return;
      }
      scheduleProjectPreviewCoverCapture({
        tabId,
        projectId,
        ctx,
        updateProject: updateRef.current,
      });
    });

    return () => {
      unsub();
      cancelProjectPreviewCoverCapture(projectId);
    };
  }, [tabId, projectId, tabKind, surfaceActive, ctx]);
}
