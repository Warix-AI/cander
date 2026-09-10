"use client";

import { useEffect, useState } from "react";
import {
  fetchPublishStatusClient,
  type PublishStatusClient,
} from "@/lib/api/project-publish-client";

/**
 * Draft-vs-live status for a project (drives Publish vs Republish and the
 * "draft ahead of live" indicator). Refreshes after publishes and build jobs.
 */
export function usePublishStatus(opts: {
  projectId: string | null | undefined;
  workspaceId: string | null | undefined;
  enabled?: boolean;
}) {
  const enabled = Boolean(opts.enabled !== false && opts.projectId && opts.workspaceId);
  const [status, setStatus] = useState<PublishStatusClient | null>(null);

  useEffect(() => {
    if (!enabled || !opts.projectId || !opts.workspaceId) return;
    let cancelled = false;
    const load = () => {
      void fetchPublishStatusClient({
        projectId: opts.projectId!,
        workspaceId: opts.workspaceId!,
      }).then((next) => {
        if (!cancelled && next) setStatus(next);
      });
    };
    load();
    const onChange = () => load();
    window.addEventListener("cander:publish-status-changed", onChange);
    window.addEventListener("cander:build-job-finished", onChange);
    window.addEventListener("cander:website-setup-ready", onChange);
    return () => {
      cancelled = true;
      window.removeEventListener("cander:publish-status-changed", onChange);
      window.removeEventListener("cander:build-job-finished", onChange);
      window.removeEventListener("cander:website-setup-ready", onChange);
    };
  }, [enabled, opts.projectId, opts.workspaceId]);

  return enabled ? status : null;
}
