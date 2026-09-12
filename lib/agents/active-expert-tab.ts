/**
 * Resolve the active Expert tab from the project browser session.
 */

import {
  defaultProjectBrowserSession,
  getProjectBrowserSession,
  type ProjectBrowserKey,
} from "@/lib/project-browser-session";
import type { SpaceId } from "@/lib/types";

export function getActiveExpertFromBrowserSession(opts: {
  profileId: string;
  workspaceId: string;
  spaceId: SpaceId;
  projectId: string;
  projectTitle?: string;
}): { agentId: string | null; title: string | null } {
  const key: ProjectBrowserKey = {
    profileId: opts.profileId,
    workspaceId: opts.workspaceId,
    spaceId: opts.spaceId,
    projectId: opts.projectId,
  };
  const session = getProjectBrowserSession(
    key,
    defaultProjectBrowserSession({
      projectId: opts.projectId,
      title: opts.projectTitle ?? "Expert",
      spaceId: opts.spaceId,
      projectKind: "automation",
      agentSurface: "builder",
    }),
  );
  const active =
    session.tabs.find((tab) => tab.id === session.activeTabId) ?? null;
  if (!active) return { agentId: null, title: null };
  if (active.kind === "agent-builder" && active.agentId) {
    return {
      agentId: active.agentId,
      title: active.title?.trim() || null,
    };
  }
  if (active.kind === "agent-overview") {
    const firstBound = session.tabs.find(
      (tab) => tab.kind === "agent-builder" && tab.agentId,
    );
    return {
      agentId: firstBound?.agentId ?? active.agentId ?? null,
      title:
        firstBound?.title?.trim() ||
        active.title?.trim() ||
        null,
    };
  }
  return { agentId: null, title: null };
}
