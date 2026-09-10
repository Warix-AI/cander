"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchLatestBuildJobClient,
  type BuildJobClient,
  type BuildJobEventClient,
} from "@/lib/api/build-jobs-client";

const ACTIVE = new Set(["queued", "running", "verifying"]);

/**
 * Follow the latest builder job for a project (sites and apps).
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
  const enabled = Boolean(opts.enabled && opts.projectId && opts.workspaceId);
  const [job, setJob] = useState<BuildJobClient | null>(null);
  const [events, setEvents] = useState<BuildJobEventClient[]>([]);
  const lastSeqRef = useRef(0);
  const jobIdRef = useRef<string | null>(null);
  /** Job id announced by `cander:build-job-started` before we saw it running. */
  const watchingRef = useRef<string | null>(null);
  const announcedRef = useRef<Set<string>>(new Set());
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
      const finishedNow =
        next &&
        !ACTIVE.has(next.status) &&
        ((prev && prev.id === next.id && ACTIVE.has(prev.status)) ||
          // Job we watched from the start event but never saw as running.
          (!prev && watchingRef.current === next.id));
      if (finishedNow && typeof window !== "undefined" && !announcedRef.current.has(next.id)) {
        announcedRef.current.add(next.id);
        window.dispatchEvent(
          new CustomEvent("cander:website-setup-ready", {
            detail: { projectId: opts.projectId, jobId: next.id, status: next.status },
          }),
        );
        window.dispatchEvent(
          new CustomEvent("cander:website-preview-reload", {
            detail: { projectId: opts.projectId, workspaceId: opts.workspaceId },
          }),
        );
        window.dispatchEvent(
          new CustomEvent("cander:build-job-finished", {
            detail: {
              projectId: opts.projectId,
              workspaceId: opts.workspaceId,
              jobId: next.id,
              status: next.status,
              mode: next.facts?.mode ?? "create",
              summary: next.resultSummary || next.facts?.summary || null,
              error: next.facts?.error || null,
            },
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
      // Fast while a job is active; slow heartbeat otherwise so a start we
      // never heard about (dropped request, other tab) is still picked up.
      const delay = next && ACTIVE.has(next.status) ? 3000 : 30_000;
      timer = window.setTimeout(() => void tick(), delay);
    };
    void tick();

    const onStarted = (ev: Event) => {
      const detail = (ev as CustomEvent).detail as
        | { projectId?: string; jobId?: string }
        | undefined;
      if (detail?.projectId && detail.projectId !== opts.projectId) return;
      watchingRef.current = detail?.jobId ?? null;
      if (timer != null) window.clearTimeout(timer);
      setArmed((n) => n + 1);
    };
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (timer != null) window.clearTimeout(timer);
      void tick();
    };
    window.addEventListener("cander:build-job-started", onStarted);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      if (timer != null) window.clearTimeout(timer);
      window.removeEventListener("cander:build-job-started", onStarted);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, refresh, opts.projectId, armed]);

  // Edit jobs run with the preview visible, so surface progress in chat.
  const lastProgressSentRef = useRef<string | null>(null);
  useEffect(() => {
    if (!enabled || !job || !ACTIVE.has(job.status) || job.facts?.mode !== "edit") return;
    const line = job.progressNote?.trim();
    if (!line || line === lastProgressSentRef.current) return;
    lastProgressSentRef.current = line;
    window.dispatchEvent(
      new CustomEvent("cander:build-job-progress", {
        detail: { projectId: opts.projectId, jobId: job.id, message: line },
      }),
    );
  }, [enabled, job, opts.projectId]);

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
