"use client";

import { useMemo, useSyncExternalStore } from "react";
import { useApp } from "@/components/app/AppProvider";
import { useWorkspaceCtx } from "@/components/app/SpaceDataProvider";
import {
  defaultProjectBrowserSession,
  getProjectBrowserSession,
  getProjectBrowserSessionRevision,
  subscribeProjectBrowserSession,
  type ProjectBrowserKey,
} from "@/lib/project-browser-session";
import { getSpaceEntityStoreSnapshot } from "@/lib/api/space-entity-store";
import type { SpaceId } from "@/lib/types";

export type AgentPinSurface = {
  /** Active agent pin is showing the observe-only runtime surface. */
  isOverview: boolean;
  projectId: string | null;
  workspaceId: string;
};

/** True when the open project pin is an automation on the overview (not Edit/builder) surface. */
export function useAgentPinSurface(): AgentPinSurface {
  const { projectId, spaceId } = useApp();
  const { workspaceId, actorId } = useWorkspaceCtx();
  const revision = useSyncExternalStore(
    subscribeProjectBrowserSession,
    getProjectBrowserSessionRevision,
    getProjectBrowserSessionRevision,
  );

  return useMemo(() => {
    void revision;
    if (!projectId) {
      return { isOverview: false, projectId: null, workspaceId };
    }

    const snap = getSpaceEntityStoreSnapshot().projects.find(
      (item) => item.id === projectId && item.workspaceId === workspaceId,
    );
    if (!snap || snap.kind !== "automation") {
      return { isOverview: false, projectId, workspaceId };
    }

    const sid = (snap.space || spaceId || "build") as SpaceId;
    const key: ProjectBrowserKey = {
      profileId: actorId,
      workspaceId,
      spaceId: sid,
      projectId,
    };
    const fallback = defaultProjectBrowserSession({
      projectId,
      title: snap.title || "Agent",
      spaceId: sid,
      projectKind: "automation",
      agentSurface: "overview",
    });
    const session = getProjectBrowserSession(key, fallback);
    const active = session.tabs.find((tab) => tab.id === session.activeTabId);
    return {
      isOverview: active?.kind === "agent-overview",
      projectId,
      workspaceId,
    };
  }, [revision, projectId, workspaceId, actorId, spaceId]);
}
