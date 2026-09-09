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
};

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
    };
    if (!res.ok) {
      return {
        ok: false,
        url: data.url ?? data.publishedUrl ?? null,
        publishedSha: data.publishedSha ?? null,
        publishAttemptId: data.publishAttemptId ?? publishAttemptId,
        error: data.error || data.message || `publish failed (${res.status})`,
        message: data.message || data.error,
        status: data.status,
      };
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
    };
  } catch (err) {
    return {
      ok: false,
      url: null,
      publishAttemptId,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
