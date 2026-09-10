"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchWebsiteSetupBrief,
  type WebsiteSetupBriefClient,
} from "@/lib/api/website-setup-client";
import { websiteSetupPreviewGate } from "@/lib/hooks/website-setup-preview-gate";

const CACHE_PREFIX = "cander:website-setup-brief:";

function cacheKey(projectId: string) {
  return `${CACHE_PREFIX}${projectId}`;
}

function readCachedBrief(projectId: string | null | undefined): WebsiteSetupBriefClient | null {
  if (!projectId || typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(cacheKey(projectId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WebsiteSetupBriefClient;
    if (!parsed || typeof parsed !== "object" || !parsed.status) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCachedBrief(
  projectId: string,
  brief: WebsiteSetupBriefClient | null,
) {
  if (typeof window === "undefined") return;
  try {
    if (!brief) {
      sessionStorage.removeItem(cacheKey(projectId));
      return;
    }
    sessionStorage.setItem(cacheKey(projectId), JSON.stringify(brief));
  } catch {
    /* quota / private mode */
  }
}

/**
 * Poll website setup brief for site projects (preview gating + progress ring).
 * Preview unlocks only when status is ready AND draft tip is runnable (has Next).
 * Failed keeps chrome + Retry (does not permanently block). Stops polling on
 * terminal ready+runnable; continues lightly after failed so Retry can recover.
 *
 * Re-entry uses a sessionStorage cache so an already-built site does not flash
 * the guided-setup overlay while the brief refetch is in flight.
 */
export function useWebsiteSetupBrief(opts: {
  projectId: string | null | undefined;
  workspaceId: string | null | undefined;
  kind?: string | null;
  enabled?: boolean;
}) {
  const isSite = opts.kind === "site" || opts.enabled === true;
  const [brief, setBrief] = useState<WebsiteSetupBriefClient | null>(() =>
    isSite ? readCachedBrief(opts.projectId) : null,
  );
  const [briefPending, setBriefPending] = useState(() => {
    if (!isSite || !opts.projectId) return false;
    return readCachedBrief(opts.projectId) == null;
  });
  const backoffRef = useRef(1000);
  const projectIdRef = useRef(opts.projectId);
  projectIdRef.current = opts.projectId;

  const refresh = useCallback(async () => {
    if (!opts.projectId || !opts.workspaceId || !isSite) {
      setBrief(null);
      setBriefPending(false);
      return null;
    }
    const next = await fetchWebsiteSetupBrief({
      projectId: opts.projectId,
      workspaceId: opts.workspaceId,
    });
    setBriefPending(false);
    setBrief((prev) => {
      if (!next) return prev;
      if (
        prev?.status === "ready" &&
        prev.draftRunnable &&
        next.status === "building"
      ) {
        return prev;
      }
      writeCachedBrief(opts.projectId!, next);
      return next;
    });
    return next;
  }, [opts.projectId, opts.workspaceId, isSite]);

  // Reset pending when switching projects (unless we already have a cache hit).
  useEffect(() => {
    if (!isSite || !opts.projectId) {
      setBrief(null);
      setBriefPending(false);
      return;
    }
    const cached = readCachedBrief(opts.projectId);
    if (cached) {
      setBrief(cached);
      setBriefPending(false);
    } else {
      setBrief(null);
      setBriefPending(true);
    }
  }, [isSite, opts.projectId]);

  useEffect(() => {
    void refresh();
    if (!isSite || !opts.projectId) return;

    const onReady = (ev: Event) => {
      const detail = (ev as CustomEvent).detail as
        | { projectId?: string }
        | undefined;
      if (detail?.projectId && detail.projectId !== opts.projectId) return;
      backoffRef.current = 1000;
      void refresh();
    };
    window.addEventListener("cander:website-setup-ready", onReady);

    let cancelled = false;
    let timer: number | null = null;

    const terminalReady =
      brief?.status === "ready" && brief.draftRunnable === true;

    const tick = async () => {
      if (cancelled) return;
      const next = await refresh();
      if (cancelled) return;
      const done =
        next?.status === "ready" && next.draftRunnable === true;
      if (done) {
        backoffRef.current = 1000;
        return;
      }
      if (next?.status === "building") {
        backoffRef.current = Math.min(10_000, Math.floor(backoffRef.current * 1.5));
      } else if (next?.status === "failed") {
        // Slow poll so Retry / finalize can update without spinning hard.
        backoffRef.current = 8_000;
      } else {
        backoffRef.current = 2500;
      }
      timer = window.setTimeout(() => {
        void tick();
      }, backoffRef.current);
    };

    if (!terminalReady) {
      timer = window.setTimeout(() => {
        void tick();
      }, brief?.status === "building" ? 1000 : 2500);
    }

    return () => {
      cancelled = true;
      if (timer != null) window.clearTimeout(timer);
      window.removeEventListener("cander:website-setup-ready", onReady);
    };
  }, [refresh, isSite, opts.projectId, brief?.status, brief?.draftRunnable]);

  const gate = useMemo(
    () =>
      websiteSetupPreviewGate({
        isSite,
        status: brief?.status,
        draftRunnable: brief?.draftRunnable,
        briefPending: briefPending && brief == null,
      }),
    [isSite, brief?.status, brief?.draftRunnable, briefPending, brief],
  );

  return {
    brief,
    refresh,
    briefPending: briefPending && brief == null,
    setupBlocksPreview: gate.setupBlocksPreview,
    showSetupOverlay: gate.showSetupOverlay,
    setupFailed: gate.setupFailed,
    isPreviewReady: gate.isPreviewReady,
    isSite,
  };
}
