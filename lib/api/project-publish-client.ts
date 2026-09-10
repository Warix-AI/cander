"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/data-backend";

async function authToken() {
  const supabase = createSupabaseBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

import type { PublishVerification } from "@/lib/api/build-runtime-api";
import {
  PUBLISH_STATE_COPY,
  type PublishUserState,
} from "@/lib/build/publish/user-copy";

export type PublishProjectClientResult = {
  ok: boolean;
  url: string | null;
  publishedSha?: string | null;
  vercelDeploymentId?: string | null;
  publishAttemptId?: string | null;
  gitSyncRepairNeeded?: boolean;
  message?: string;
  error?: string;
  status?: string;
  state?: PublishUserState;
  verification?: PublishVerification | null;
};

export type PublishAttemptClient = {
  publishAttemptId: string;
  state: PublishUserState;
  message: string;
  draftSha: string;
  publishedUrl: string | null;
  startedAt: string;
  completedAt: string | null;
};

export type PublishStatusClient = {
  draftSha: string | null;
  publishedSha: string | null;
  publishedUrl: string | null;
  published: boolean;
  /** Draft tip differs from what is live → Republish needed. */
  aheadOfLive: boolean;
  /** A publish is currently running for this project. */
  publishing?: boolean;
  /** Latest attempt (user-safe state + copy). */
  attempt?: PublishAttemptClient | null;
  customDomain: string | null;
  customDomainStatus: string | null;
  verification?: PublishVerification | null;
};

/** Draft-vs-live status (+ optional fresh live verification). */
export async function fetchPublishStatusClient(opts: {
  projectId: string;
  workspaceId: string;
  verify?: boolean;
}): Promise<PublishStatusClient | null> {
  if (!isSupabaseConfigured()) return null;
  const token = await authToken();
  if (!token) return null;
  const params = new URLSearchParams({ workspaceId: opts.workspaceId });
  if (opts.verify) params.set("verify", "1");
  try {
    const res = await fetch(
      `/api/projects/${encodeURIComponent(opts.projectId)}/publish?${params}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) return null;
    const data = (await res.json().catch(() => null)) as PublishStatusClient | null;
    return data ?? null;
  } catch {
    return null;
  }
}

/**
 * Production publish via Next build-infra route.
 * Sends a unique publishAttemptId + Idempotency-Key (projectId:draftSha).
 */
export async function publishProjectClient(opts: {
  projectId: string;
  workspaceId: string;
  url?: string | null;
  slug?: string | null;
  draftSha?: string | null;
}): Promise<PublishProjectClientResult | null> {
  if (!isSupabaseConfigured()) return null;
  const token = await authToken();
  if (!token) return null;

  const publishAttemptId = crypto.randomUUID();
  const draftSha = (opts.draftSha || "tip").trim().toLowerCase();
  const idempotencyKey = `publish:${opts.projectId}:${draftSha}`;

  console.info("[cander:publish]", {
    publishAttemptId,
    stage: "user_click",
    projectId: opts.projectId,
    draftSha: draftSha.slice(0, 12),
  });

  try {
    const res = await fetch(
      `/api/projects/${encodeURIComponent(opts.projectId)}/publish`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-Cander-Publish-Attempt-Id": publishAttemptId,
          "X-Cander-Draft-Sha": draftSha.slice(0, 40),
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          workspaceId: opts.workspaceId,
          url: opts.url ?? null,
          slug: opts.slug ?? null,
        }),
      },
    );
    const data = (await res.json().catch(() => ({}))) as PublishProjectClientResult & {
      error?: string;
      publishedUrl?: string | null;
      verification?: PublishVerification | null;
      state?: PublishUserState;
    };
    if (!res.ok && res.status !== 202) {
      // Quota / auth style failures arrive synchronously; keep their copy.
      const state: PublishUserState = data.state ?? "needs_retry";
      return {
        ok: false,
        url: data.url ?? data.publishedUrl ?? null,
        publishedSha: data.publishedSha ?? null,
        publishAttemptId: data.publishAttemptId ?? publishAttemptId,
        error: data.error || data.message || PUBLISH_STATE_COPY[state],
        message: data.message || data.error || PUBLISH_STATE_COPY[state],
        status: data.status ?? "error",
        state,
      };
    }
    if (res.status === 202 || data.state === "publishing") {
      // Background publish: wait for the attempt to reach a terminal state.
      return waitForPublishOutcome({
        projectId: opts.projectId,
        workspaceId: opts.workspaceId,
        publishAttemptId: data.publishAttemptId ?? publishAttemptId,
      });
    }
    return {
      ok: data.ok !== false,
      url: data.url ?? data.publishedUrl ?? null,
      publishedSha: data.publishedSha ?? null,
      vercelDeploymentId: data.vercelDeploymentId ?? null,
      publishAttemptId: data.publishAttemptId ?? publishAttemptId,
      gitSyncRepairNeeded: data.gitSyncRepairNeeded,
      message: data.message,
      status: data.status,
      state: data.state,
      verification: data.verification ?? null,
    };
  } catch (err) {
    console.info("[cander:publish] request failed", err instanceof Error ? err.message : err);
    return {
      ok: false,
      url: null,
      publishAttemptId,
      state: "needs_retry",
      error: PUBLISH_STATE_COPY.needs_retry,
      message: PUBLISH_STATE_COPY.needs_retry,
    };
  }
}

const PUBLISH_POLL_MS = 3000;
const PUBLISH_POLL_MAX_MS = 15 * 60 * 1000;

/**
 * Poll publish status until the latest attempt finishes. Resolves with the
 * same shape as a synchronous publish so callers do not care which path ran.
 */
export async function waitForPublishOutcome(opts: {
  projectId: string;
  workspaceId: string;
  publishAttemptId: string;
  onState?: (state: PublishUserState) => void;
}): Promise<PublishProjectClientResult> {
  const started = Date.now();
  let lastState: PublishUserState | null = null;
  while (Date.now() - started < PUBLISH_POLL_MAX_MS) {
    await new Promise((r) => setTimeout(r, PUBLISH_POLL_MS));
    const status = await fetchPublishStatusClient(opts);
    const attempt = status?.attempt ?? null;
    if (attempt && attempt.state !== lastState) {
      lastState = attempt.state;
      opts.onState?.(attempt.state);
    }
    if (!attempt) continue;
    if (attempt.state === "publishing") continue;
    // Only accept attempts started after (or as) ours; an older terminal row
    // means ours has not been written yet.
    if (
      attempt.publishAttemptId !== opts.publishAttemptId &&
      Date.now() - started < 20_000 &&
      Date.parse(attempt.startedAt) < started - 60_000
    ) {
      continue;
    }
    const live = attempt.state === "live";
    return {
      ok: live,
      url: live ? attempt.publishedUrl ?? status?.publishedUrl ?? null : null,
      publishedSha: live ? attempt.draftSha : null,
      publishAttemptId: attempt.publishAttemptId,
      status: live ? "published" : "error",
      state: attempt.state,
      message: attempt.message,
      error: live ? undefined : attempt.message,
    };
  }
  return {
    ok: false,
    url: null,
    publishAttemptId: opts.publishAttemptId,
    state: "needs_retry",
    status: "error",
    message: PUBLISH_STATE_COPY.needs_retry,
    error: PUBLISH_STATE_COPY.needs_retry,
  };
}
