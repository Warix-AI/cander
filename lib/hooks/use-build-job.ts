"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchLatestBuildJobClient,
  type BuildJobClient,
  type BuildJobEventClient,
} from "@/lib/api/build-jobs-client";
import { isBuildV2Enabled } from "@/lib/build/jobs/flag";

const ACTIVE = new Set(["queued", "running", "verifying"]);

/**
 * Follow the latest Website Builder V2 job for a project.
 * Polls while a job is active (each GET also syncs the sandbox event log
 * server-side), stops when terminal, and re-arms on `cander:build-job-started`.
 * On completion it fires `cander:website-setup-ready` so the brief/preview
 * hooks refresh immediately instead of waiting for their own backoff.
 */
export function useBuildJob(opts: {
  projectId: string | null | undefined;
  workspaceId: string | null | undefined;
  enabled?: boolean;
}) {
  const enabled = Boolean(opts.enabled && opts.projectId && opts.workspaceId && isBuildV2Enabled());
  const [job, setJob] = useState<BuildJobClient | null>(null);
  const [events, setEvents] = useState<BuildJobEventClient[]>([]);
  const lastSeqRef = useRef(0);
  const jobIdRef = useRef<string | null>(null);
  const [armed, setArmed] = useState(0);

  const refresh = useCallback(async () => {
    if (!enabled || !opts.projectId || !opts.workspaceId) return null;
    const snap = await fetchLatestBuildJobClient({
      projectId: opts.projectId,
      workspaceId: opts.workspaceId,
      afterSeq: jobIdRef.current ? lastSeqRef.current : 0,
    });
    if (!snap) return null;
    const next = snap.job;
    if (next?.id !== jobIdRef.current) {
      // New job — reset the stream.
      jobIdRef.current = next?.id ?? null;
      lastSeqRef.current = 0;
      setEvents(snap.events ?? []);
    } else if (snap.events?.length) {
      setEvents((prev) => {
        const seen = new Set(prev.map((e) => e.seq));
        const merged = [...prev, ...snap.events.filter((e) => !seen.has(e.seq))];
        return merged.length > 400 ? merged.slice(-400) : merged;
      });
    }
    for (const e of snap.events ?? []) {
      if (e.seq > lastSeqRef.current && e.seq < 100000) lastSeqRef.current = e.seq;
    }
    setJob((prev) => {
      if (prev && next && !ACTIVE.has(next.status) && ACTIVE.has(prev.status) && typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("cander:website-setup-ready", {
            detail: { projectId: opts.projectId, jobId: next.id, status: next.status },
          }),
        );
      }
      return next;
    });
    return next;
  }, [enabled, opts.projectId, opts.workspaceId]);

  useEffect(() => {
    if (!enabled) {
      jobIdRef.current = null;
      lastSeqRef.current = 0;
      return;
    }
    let cancelled = false;
    let timer: number | null = null;

    const tick = async () => {
      if (cancelled) return;
      const next = await refresh();
      if (cancelled) return;
      if (next && ACTIVE.has(next.status)) {
        timer = window.setTimeout(() => void tick(), 3000);
      }
    };
    void tick();

    const onStarted = (ev: Event) => {
      const detail = (ev as CustomEvent).detail as { projectId?: string } | undefined;
      if (detail?.projectId && detail.projectId !== opts.projectId) return;
      if (timer != null) window.clearTimeout(timer);
      setArmed((n) => n + 1);
    };
    window.addEventListener("cander:build-job-started", onStarted);
    return () => {
      cancelled = true;
      if (timer != null) window.clearTimeout(timer);
      window.removeEventListener("cander:build-job-started", onStarted);
    };
  }, [enabled, refresh, opts.projectId, armed]);

  const progressLines = useMemo(() => {
    const lines: string[] = [];
    for (const e of events) {
      if (e.kind === "progress" || e.kind === "status") {
        if (lines[lines.length - 1] !== e.message) lines.push(e.message);
      }
    }
    return lines;
  }, [events]);

  // When disabled, expose an empty view without touching state in an effect.
  const visibleJob = enabled ? job : null;
  const visibleLines = enabled ? progressLines : [];
  return {
    job: visibleJob,
    events: enabled ? events : [],
    progressLines: visibleLines,
    isActive: Boolean(visibleJob && ACTIVE.has(visibleJob.status)),
    latestProgress:
      visibleJob?.progressNote || visibleLines[visibleLines.length - 1] || null,
    refresh,
  };
}
