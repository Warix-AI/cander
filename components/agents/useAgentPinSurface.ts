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
  /**
   * Observe-only Expert runtime (Cander ↔ Expert).
   * True for the selected Expert tab — hides the user composer.
   */
  isExpertRuntime: boolean;
  /** @deprecated Use isExpertRuntime */
  isOverview: boolean;
  projectId: string | null;
  agentId: string | null;
  expertTitle: string | null;
  workspaceId: string;
};

/**
 * Active Expert tab → observe Cander ↔ Expert runtime (no user composer).
 * Project builder chat is only when not on an Expert tab.
 */
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
      return {
        isExpertRuntime: false,
        isOverview: false,
        projectId: null,
        agentId: null,
        expertTitle: null,
        workspaceId,
      };
    }

    const snap = getSpaceEntityStoreSnapshot().projects.find(
      (item) => item.id === projectId && item.workspaceId === workspaceId,
    );
    if (!snap || snap.kind !== "automation") {
      return {
        isExpertRuntime: false,
        isOverview: false,
        projectId,
        agentId: null,
        expertTitle: null,
        workspaceId,
      };
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
      title: snap.title || "Expert",
      spaceId: sid,
      projectKind: "automation",
      agentSurface: "overview",
    });
    const session = getProjectBrowserSession(key, fallback);
    const active = session.tabs.find((tab) => tab.id === session.activeTabId);
    const fromBuilder =
      active?.kind === "agent-builder" && active.agentId
        ? { agentId: active.agentId, title: active.title }
        : null;
    const fromOverview =
      active?.kind === "agent-overview"
        ? (() => {
            const firstBound = session.tabs.find(
              (tab) => tab.kind === "agent-builder" && tab.agentId,
            );
            return {
              agentId: firstBound?.agentId ?? active.agentId ?? null,
              title: firstBound?.title ?? active.title,
            };
          })()
        : null;
    const resolved = fromBuilder ?? fromOverview;
    const agentId = resolved?.agentId ?? null;
    // Individual Expert tab (or legacy overview) → observe Cander ↔ Expert only.
    const isExpertRuntime = Boolean(agentId);
    return {
      isExpertRuntime,
      isOverview: isExpertRuntime,
      projectId,
      agentId,
      expertTitle: resolved?.title?.trim() || null,
      workspaceId,
    };
  }, [revision, projectId, workspaceId, actorId, spaceId]);
}
