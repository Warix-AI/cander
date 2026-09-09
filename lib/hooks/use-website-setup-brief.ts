"use client";

import { useCallback, useEffect, useState } from "react";
import {
  fetchWebsiteSetupBrief,
  type WebsiteSetupBriefClient,
} from "@/lib/api/website-setup-client";

/**
 * Poll website setup brief for site projects (preview gating + progress ring).
 */
export function useWebsiteSetupBrief(opts: {
  projectId: string | null | undefined;
  workspaceId: string | null | undefined;
  kind?: string | null;
  enabled?: boolean;
}) {
  const isSite = opts.kind === "site" || opts.enabled === true;
  const [brief, setBrief] = useState<WebsiteSetupBriefClient | null>(null);

  const refresh = useCallback(async () => {
    if (!opts.projectId || !opts.workspaceId || !isSite) {
      setBrief(null);
      return null;
    }
    const next = await fetchWebsiteSetupBrief({
      projectId: opts.projectId,
      workspaceId: opts.workspaceId,
    });
    setBrief((prev) => {
      if (!next) return prev;
      // Never regress ready → building from a stale poll after unlock.
      if (prev?.status === "ready" && next.status === "building") {
        return prev;
      }
      return next;
    });
    return next;
  }, [opts.projectId, opts.workspaceId, isSite]);

  useEffect(() => {
    void refresh();
    if (!isSite || !opts.projectId) return;

    const onReady = (ev: Event) => {
      const detail = (ev as CustomEvent).detail as
        | { projectId?: string }
        | undefined;
      if (detail?.projectId && detail.projectId !== opts.projectId) return;
      // Optimistically unlock while we refetch — avoids stuck "building" ring.
      setBrief((prev) =>
        prev
          ? { ...prev, status: "ready" }
          : {
              status: "ready",
              completedSteps: 8,
              answers: {},
              updatedAt: new Date().toISOString(),
            },
      );
      void refresh();
    };
    window.addEventListener("cander:website-setup-ready", onReady);

    const building = brief?.status === "building";
    const id = window.setInterval(
      () => {
        void refresh();
      },
      building ? 1000 : 2500,
    );
    return () => {
      window.clearInterval(id);
      window.removeEventListener("cander:website-setup-ready", onReady);
    };
  }, [refresh, isSite, opts.projectId, brief?.status]);

  const setupBlocksPreview =
    isSite && (!brief || brief.status !== "ready");

  return { brief, refresh, setupBlocksPreview, isSite };
}
