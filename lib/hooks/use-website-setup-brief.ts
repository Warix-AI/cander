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
    setBrief(next);
    return next;
  }, [opts.projectId, opts.workspaceId, isSite]);

  useEffect(() => {
    void refresh();
    if (!isSite || !opts.projectId) return;
    const id = window.setInterval(() => {
      void refresh();
    }, 2500);
    return () => window.clearInterval(id);
  }, [refresh, isSite, opts.projectId]);

  const setupBlocksPreview =
    isSite && (!brief || brief.status !== "ready");

  return { brief, refresh, setupBlocksPreview, isSite };
}
