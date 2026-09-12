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
 * Background-hydrate the persistent Agent ↔ Cander runtime thread.
 * Local messages paint instantly; this only refreshes from the server.
 */
export async function prefetchAgentRuntimeConversation(opts: {
  workspaceId: string;
  projectId: string;
  spaceId: SpaceId;
  title?: string;
}) {
  const listed = await listProjectAgentsWithStatsClient({
    workspaceId: opts.workspaceId,
    projectId: opts.projectId,
  });
  const id = listed.agents[0]?.id;
  const title = listed.agents[0]?.name ?? opts.title ?? "Agent";
  if (!id) return;
  const conv = await fetchAgentConversationClient({
    workspaceId: opts.workspaceId,
    projectId: opts.projectId,
    agentId: id,
  });
  applyAgentRuntimeMessages({
    workspaceId: opts.workspaceId,
    projectId: opts.projectId,
    spaceId: opts.spaceId,
    title: conv.agent.name || title,
    messages: conv.messages,
    runs: conv.runs,
  });
}

export function useSyncAgentRuntimeThread(opts: {
  workspaceId: string;
  projectId: string;
  spaceId: SpaceId;
  enabled: boolean;
  title?: string;
}) {
  const hydrate = useCallback(
    async (forcePending = false) => {
      await prefetchAgentRuntimeConversation({
        workspaceId: opts.workspaceId,
        projectId: opts.projectId,
        spaceId: opts.spaceId,
        title: opts.title,
      });
      if (forcePending) {
        markAgentRuntimeThinking({
          workspaceId: opts.workspaceId,
          projectId: opts.projectId,
          spaceId: opts.spaceId,
          title: opts.title,
        });
      }
    },
    [opts.workspaceId, opts.projectId, opts.spaceId, opts.title],
  );

  useEffect(() => {
    if (!opts.enabled) return;

    let cancelled = false;
    void hydrate(false).catch(() => {});

    const onRefresh = (event: Event) => {
      const detail = (event as CustomEvent).detail as
        | { projectId?: string; pending?: boolean }
        | undefined;
      if (detail?.projectId && detail.projectId !== opts.projectId) return;
      if (detail?.pending) {
        markAgentRuntimeThinking({
          workspaceId: opts.workspaceId,
          projectId: opts.projectId,
          spaceId: opts.spaceId,
          title: opts.title,
        });
      }
      void hydrate(false).catch(() => {});
    };
    window.addEventListener(AGENT_RUNTIME_REFRESH_EVENT, onRefresh);

    const poll = window.setInterval(() => {
      if (cancelled) return;
      void hydrate(false).catch(() => {});
    }, 4_000);

    return () => {
      cancelled = true;
      window.removeEventListener(AGENT_RUNTIME_REFRESH_EVENT, onRefresh);
      window.clearInterval(poll);
    };
  }, [
    opts.enabled,
    opts.workspaceId,
    opts.projectId,
    opts.spaceId,
    opts.title,
    hydrate,
  ]);
}
