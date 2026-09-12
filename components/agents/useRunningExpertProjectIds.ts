"use client";

import { useEffect, useState } from "react";
import { fetchWorkspaceAgentActivityClient } from "@/lib/agents/client";

/**
 * Project ids with an Expert currently in `running` status.
 * Used for the pulsating blue pin indicator (separate from selection).
 */
export function useRunningExpertProjectIds(workspaceId: string | null | undefined) {
  const [runningProjectIds, setRunningProjectIds] = useState<Set<string>>(
    () => new Set(),
  );

  useEffect(() => {
    if (!workspaceId) {
      setRunningProjectIds(new Set());
      return;
    }
    let cancelled = false;

    const refresh = () => {
      void fetchWorkspaceAgentActivityClient({ workspaceId, limit: 40 })
        .then((rows) => {
          if (cancelled) return;
          const next = new Set<string>();
          for (const row of rows) {
            if (row.status === "running" && row.projectId) {
              next.add(row.projectId);
            }
          }
          setRunningProjectIds(next);
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

  return runningProjectIds;
}
