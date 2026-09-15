/**
 * Resolve whether the active Expert tab has voice enabled (for Live delegation).
 */

import { peekCachedAgentBundle, peekCachedProjectAgents } from "@/lib/agents/cache";
import {
  defaultProjectBrowserSession,
  getProjectBrowserSession,
  type ProjectBrowserKey,
} from "@/lib/project-browser-session";
import { getSpaceEntityStoreSnapshot } from "@/lib/api/space-entity-store";
import type { SpaceId } from "@/lib/types";

export type ActiveExpertVoiceTarget = {
  projectId: string;
  agentId: string;
  voiceEnabled: boolean;
};

export function resolveActiveExpertVoiceTarget(opts: {
  workspaceId: string;
  profileId: string;
  projectId: string | null | undefined;
  spaceId?: SpaceId | null;
}): ActiveExpertVoiceTarget | null {
  const projectId = opts.projectId?.trim();
  if (!projectId || !opts.workspaceId.trim()) return null;

  const snap = getSpaceEntityStoreSnapshot().projects.find(
    (item) =>
      item.id === projectId && item.workspaceId === opts.workspaceId,
  );
  if (!snap || snap.kind !== "automation") return null;

  const sid = (snap.space || opts.spaceId || "build") as SpaceId;
  const key: ProjectBrowserKey = {
    profileId: opts.profileId,
    workspaceId: opts.workspaceId,
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
  let agentId: string | null = null;
  if (active?.kind === "agent-builder" && active.agentId) {
    agentId = active.agentId;
  } else if (active?.kind === "agent-overview") {
    const firstBound = session.tabs.find(
      (tab) => tab.kind === "agent-builder" && tab.agentId,
    );
    agentId = firstBound?.agentId ?? active.agentId ?? null;
  }
  if (!agentId) return null;

  const bundle = peekCachedAgentBundle(
    opts.workspaceId,
    projectId,
    agentId,
  );
  if (bundle) {
    return {
      projectId,
      agentId,
      voiceEnabled: Boolean(bundle.agent.voiceEnabled),
    };
  }
  const list = peekCachedProjectAgents(opts.workspaceId, projectId);
  const agent = list?.find((a) => a.id === agentId);
  return {
    projectId,
    agentId,
    voiceEnabled: Boolean(agent?.voiceEnabled),
  };
}
