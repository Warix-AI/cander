"use client";

import { useEffect, useState } from "react";
import { fetchWorkspaceAgentActivityClient } from "@/lib/agents/client";

export type RunningExpertState = {
  /** Projects that have at least one running Expert. */
  projectIds: Set<string>;
  /** Individual Expert (agent) ids currently running. */
  agentIds: Set<string>;
};

const EMPTY: RunningExpertState = {
  projectIds: new Set(),
  agentIds: new Set(),
};

/**
 * Experts currently in `running` status.
 * Project set → sidebar pin pulse; agent set → in-project tab pulse.
 */
export function useRunningExpertState(
  workspaceId: string | null | undefined,
): RunningExpertState {
  const [state, setState] = useState<RunningExpertState>(EMPTY);

  useEffect(() => {
    if (!workspaceId) {
      setState(EMPTY);
      return;
    }
    let cancelled = false;

    const refresh = () => {
      void fetchWorkspaceAgentActivityClient({ workspaceId, limit: 40 })
        .then((rows) => {
          if (cancelled) return;
          const projectIds = new Set<string>();
          const agentIds = new Set<string>();
          for (const row of rows) {
            if (row.status !== "running") continue;
            if (row.projectId) projectIds.add(row.projectId);
            if (row.agentId) agentIds.add(row.agentId);
          }
          setState({ projectIds, agentIds });
        })
        .catch(() => {
          /* ignore transient poll errors */
        });
    };

    refresh();
    const timer = window.setInterval(refresh, 8_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [workspaceId]);

  return state;
}

/** @deprecated Prefer useRunningExpertState */
export function useRunningExpertProjectIds(
  workspaceId: string | null | undefined,
) {
  return useRunningExpertState(workspaceId).projectIds;
}
