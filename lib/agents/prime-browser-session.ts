/**
 * Prime the project browser session for automation (Agent) projects.
 */

import { listProjectAgentsClient, loadAgentBundleClient } from "@/lib/agents/client";
import { peekCachedProjectAgents } from "@/lib/agents/cache";
import type { ProjectAgent } from "@/lib/agents/types";
import {
  defaultProjectBrowserSession,
  getProjectBrowserSession,
  makeAgentBuilderTab,
  setProjectBrowserSession,
  type ProjectBrowserKey,
  type ProjectBrowserSession,
} from "@/lib/project-browser-session";
import type { SpaceId } from "@/lib/types";

function sessionFromAgents(opts: {
  projectId: string;
  title: string;
  agents: ProjectAgent[];
  otherTabs?: ProjectBrowserSession["tabs"];
  existingTabs?: ProjectBrowserSession["tabs"];
  preferActiveId?: string;
}): ProjectBrowserSession {
  const agentTabs = opts.agents.map((agent) => {
    const existing = opts.existingTabs?.find(
      (tab) => tab.kind === "agent-builder" && tab.agentId === agent.id,
    );
    if (existing) {
      return existing.title === agent.name
        ? existing
        : { ...existing, title: agent.name };
    }
    return makeAgentBuilderTab({
      projectId: opts.projectId,
      title: agent.name,
      agentId: agent.id,
    });
  });
  const tabs = [...agentTabs, ...(opts.otherTabs ?? [])];
  const activeStill =
    opts.preferActiveId && tabs.some((tab) => tab.id === opts.preferActiveId);
  return {
    tabs,
    activeTabId: activeStill
      ? opts.preferActiveId!
      : (agentTabs[0]?.id ?? tabs[0]!.id),
  };
}

export function applyAgentsToBrowserSession(opts: {
  key: ProjectBrowserKey;
  projectId: string;
  title: string;
  agents: ProjectAgent[];
}) {
  const current = getProjectBrowserSession(
    opts.key,
    defaultProjectBrowserSession({
      projectId: opts.projectId,
      title: opts.title,
      spaceId: opts.key.spaceId,
      projectKind: "automation",
      agentSurface: "builder",
    }),
  );
  // Overview-only sessions (legacy pin open) are replaced by one tab per Expert.
  const otherTabs = current.tabs.filter(
    (tab) => tab.kind !== "agent-builder" && tab.kind !== "agent-overview",
  );
  const next = sessionFromAgents({
    projectId: opts.projectId,
    title: opts.title,
    agents: opts.agents,
    otherTabs,
    existingTabs: current.tabs,
    preferActiveId: current.activeTabId,
  });
  const same =
    next.tabs.length === current.tabs.length &&
    next.activeTabId === current.activeTabId &&
    next.tabs.every((tab, i) => {
      const prev = current.tabs[i]!;
      return (
        tab.id === prev.id &&
        tab.title === prev.title &&
        tab.kind === prev.kind &&
        tab.agentId === prev.agentId
      );
    });
  if (!same) setProjectBrowserSession(opts.key, next);
}

export function primeAutomationBrowserSession(opts: {
  profileId: string;
  workspaceId: string;
  spaceId: SpaceId;
  projectId: string;
  title: string;
  publishedUrl?: string | null;
  agentSurface: "builder" | "overview";
}) {
  const key: ProjectBrowserKey = {
    profileId: opts.profileId,
    workspaceId: opts.workspaceId,
    spaceId: opts.spaceId,
    projectId: opts.projectId,
  };

  // Always aim for one tab per Expert. Overview is per-Expert Activity in the
  // selected Expert tab — never collapse the project to a single overview tab.
  const cached = peekCachedProjectAgents(opts.workspaceId, opts.projectId);
  if (cached?.length) {
    setProjectBrowserSession(
      key,
      sessionFromAgents({
        projectId: opts.projectId,
        title: opts.title,
        agents: cached,
        existingTabs: getProjectBrowserSession(
          key,
          defaultProjectBrowserSession({
            projectId: opts.projectId,
            title: opts.title,
            publishedUrl: opts.publishedUrl,
            spaceId: key.spaceId,
            projectKind: "automation",
            agentSurface: "builder",
          }),
        ).tabs,
      }),
    );
  } else {
    const fallback = defaultProjectBrowserSession({
      projectId: opts.projectId,
      title: opts.title,
      publishedUrl: opts.publishedUrl,
      spaceId: key.spaceId,
      projectKind: "automation",
      agentSurface: "builder",
    });
    const existing = getProjectBrowserSession(key, fallback);
    const hasBoundAgents = existing.tabs.some(
      (tab) => tab.kind === "agent-builder" && tab.agentId,
    );
    if (!hasBoundAgents) {
      setProjectBrowserSession(key, fallback);
    }
  }

  void listProjectAgentsClient({
    workspaceId: opts.workspaceId,
    projectId: opts.projectId,
    force: true,
  })
    .then((agents) => {
      if (!agents.length) return;
      applyAgentsToBrowserSession({
        key,
        projectId: opts.projectId,
        title: opts.title,
        agents,
      });
      const first = agents[0];
      if (first) {
        void loadAgentBundleClient({
          workspaceId: opts.workspaceId,
          projectId: opts.projectId,
          agentId: first.id,
        }).catch(() => {});
      }
    })
    .catch(() => {});
}
