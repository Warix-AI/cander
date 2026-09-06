/**
 * Resolve Agent Builder context for a project chat turn.
 */

import {
  getSpaceEntityStoreSnapshot,
  localSpaceEntityStore,
} from "@/lib/api/space-entity-store";
import {
  agentIdFromBuilderUrl,
  defaultProjectBrowserSession,
  getProjectBrowserSession,
  type ProjectBrowserKey,
} from "@/lib/project-browser-session";
import type { SpaceId } from "@/lib/types";

export type AgentChatContext = {
  projectKind: string | null;
  agentId: string | null;
};

/** Active agent-builder tab (or first bound agent) when the project is an automation. */
export function resolveAgentChatContext(opts: {
  profileId: string;
  workspaceId: string;
  projectId?: string | null;
}): AgentChatContext {
  const projectId = opts.projectId?.trim() || "";
  if (!projectId) return { projectKind: null, agentId: null };

  let projectKind: string | null = null;
  let spaceId: SpaceId | null = null;

  try {
    const fromStore = localSpaceEntityStore.getProject(
      { workspaceId: opts.workspaceId, actorId: opts.profileId },
      projectId,
    );
    if (fromStore) {
      projectKind = fromStore.kind;
      spaceId = fromStore.space;
    }
  } catch {
    // fall through to snapshot
  }

  if (!projectKind || !spaceId) {
    const snap = getSpaceEntityStoreSnapshot().projects.find(
      (item) =>
        item.id === projectId && item.workspaceId === opts.workspaceId,
    );
    if (snap) {
      projectKind = snap.kind;
      spaceId = snap.space;
    }
  }

  if (projectKind !== "automation" || !spaceId) {
    return { projectKind, agentId: null };
  }

  const key: ProjectBrowserKey = {
    profileId: opts.profileId,
    workspaceId: opts.workspaceId,
    spaceId,
    projectId,
  };
  const session = getProjectBrowserSession(
    key,
    defaultProjectBrowserSession({
      projectId,
      title: "Agent",
      spaceId,
      projectKind: "automation",
      agentSurface: "builder",
    }),
  );

  const active = session.tabs.find((tab) => tab.id === session.activeTabId);
  if (active?.kind === "agent-builder") {
    const id =
      active.agentId?.trim() || agentIdFromBuilderUrl(active.url) || null;
    if (id) return { projectKind, agentId: id };
  }

  const first = session.tabs.find(
    (tab) => tab.kind === "agent-builder" && tab.agentId,
  );
  return {
    projectKind,
    agentId: first?.agentId?.trim() || null,
  };
}
