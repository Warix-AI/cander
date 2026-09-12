"use client";

import { useCallback, useEffect } from "react";
import {
  fetchAgentConversationClient,
  listProjectAgentsWithStatsClient,
} from "@/lib/agents/client";
import {
  applyAgentRuntimeMessages,
  markAgentRuntimeThinking,
} from "@/lib/agents/runtime-thread";
import type { SpaceId } from "@/lib/types";

export const AGENT_RUNTIME_REFRESH_EVENT = "cander:agent-runtime-refresh";

export function notifyAgentRuntimeRefresh(detail: {
  projectId: string;
  agentId?: string | null;
  /** Show Thinking… immediately (Run now). */
  pending?: boolean;
}) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(AGENT_RUNTIME_REFRESH_EVENT, { detail }),
  );
}

/**
 * Background-hydrate the persistent Cander ↔ Expert runtime thread for one Expert.
 */
export async function prefetchAgentRuntimeConversation(opts: {
  workspaceId: string;
  projectId: string;
  spaceId: SpaceId;
  agentId?: string | null;
  title?: string;
}) {
  let agentId = opts.agentId?.trim() || "";
  let title = opts.title ?? "Expert";
  if (!agentId) {
    const listed = await listProjectAgentsWithStatsClient({
      workspaceId: opts.workspaceId,
      projectId: opts.projectId,
    });
    agentId = listed.agents[0]?.id ?? "";
    title = listed.agents[0]?.name ?? title;
  }
  if (!agentId) return;
  const conv = await fetchAgentConversationClient({
    workspaceId: opts.workspaceId,
    projectId: opts.projectId,
    agentId,
  });
  applyAgentRuntimeMessages({
    workspaceId: opts.workspaceId,
    projectId: opts.projectId,
    agentId,
    spaceId: opts.spaceId,
    title: conv.agent.name || title,
    messages: conv.messages,
    runs: conv.runs,
  });
}

export function useSyncAgentRuntimeThread(opts: {
  workspaceId: string;
  projectId: string;
  agentId: string | null;
  spaceId: SpaceId;
  enabled: boolean;
  title?: string;
}) {
  const hydrate = useCallback(
    async (forcePending = false) => {
      if (!opts.agentId) return;
      await prefetchAgentRuntimeConversation({
        workspaceId: opts.workspaceId,
        projectId: opts.projectId,
        agentId: opts.agentId,
        spaceId: opts.spaceId,
        title: opts.title,
      });
      if (forcePending) {
        markAgentRuntimeThinking({
          workspaceId: opts.workspaceId,
          projectId: opts.projectId,
          agentId: opts.agentId,
          spaceId: opts.spaceId,
          title: opts.title,
        });
      }
    },
    [
      opts.workspaceId,
      opts.projectId,
      opts.agentId,
      opts.spaceId,
      opts.title,
    ],
  );

  useEffect(() => {
    if (!opts.enabled || !opts.agentId) return;

    let cancelled = false;
    void hydrate(false).catch(() => {});

    const onRefresh = (event: Event) => {
      const detail = (event as CustomEvent).detail as
        | { projectId?: string; agentId?: string | null; pending?: boolean }
        | undefined;
      if (detail?.projectId && detail.projectId !== opts.projectId) return;
      if (
        detail?.agentId &&
        opts.agentId &&
        detail.agentId !== opts.agentId
      ) {
        return;
      }
      if (detail?.pending && opts.agentId) {
        markAgentRuntimeThinking({
          workspaceId: opts.workspaceId,
          projectId: opts.projectId,
          agentId: opts.agentId,
          spaceId: opts.spaceId,
          title: opts.title,
        });
      }
      void hydrate(false).catch(() => {});
    };
    window.addEventListener(AGENT_RUNTIME_REFRESH_EVENT, onRefresh);

    // Faster poll so connector-triggered runs appear live in the open Expert tab.
    const poll = window.setInterval(() => {
      if (cancelled) return;
      void hydrate(false).catch(() => {});
    }, 2_000);

    return () => {
      cancelled = true;
      window.removeEventListener(AGENT_RUNTIME_REFRESH_EVENT, onRefresh);
      window.clearInterval(poll);
    };
  }, [
    opts.enabled,
    opts.agentId,
    opts.workspaceId,
    opts.projectId,
    opts.spaceId,
    opts.title,
    hydrate,
  ]);
}
