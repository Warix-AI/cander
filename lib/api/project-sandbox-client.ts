"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/data-backend";
import type { BuildSandboxStatus } from "@/lib/build/sandbox/constants";

async function authToken() {
  const supabase = createSupabaseBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

export type ProjectSandboxClientResult = {
  ok: boolean;
  status: BuildSandboxStatus;
  sessionId: string | null;
  subdomain: string | null;
  draftBranch: string | null;
  draftSha: string | null;
  githubFullName: string | null;
  hasPreviewUpstream: boolean;
  previewPath?: string | null;
  previewHost?: string | null;
  message?: string;
  reused?: boolean;
  error?: string;
};

export async function ensureProjectSandboxClient(opts: {
  projectId: string;
  workspaceId: string;
  forceRestart?: boolean;
}): Promise<ProjectSandboxClientResult | null> {
  if (!isSupabaseConfigured()) return null;
  const token = await authToken();
  if (!token) return null;

  try {
    const res = await fetch(
      `/api/projects/${encodeURIComponent(opts.projectId)}/sandbox/ensure`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workspaceId: opts.workspaceId,
          forceRestart: opts.forceRestart,
        }),
      },
    );
    const data = (await res.json().catch(() => ({}))) as ProjectSandboxClientResult & {
      error?: string;
    };
    if (!res.ok && !data.status) {
      return {
        ok: false,
        status: "error",
        sessionId: null,
        subdomain: null,
        draftBranch: null,
        draftSha: null,
        githubFullName: null,
        hasPreviewUpstream: false,
        error: data.error || `sandbox ensure failed (${res.status})`,
        message: data.error || data.message,
      };
    }
    return {
      ok: data.ok !== false && data.status !== "error",
      status: (() => {
        const status = data.status ?? "error";
        const msg = `${data.message || ""} ${data.error || ""}`;
        // Rate/concurrency soft-fail should not hard-error the preview chrome.
        if (
          (status === "error" || !data.ok) &&
          /busy|several sandbox|try again shortly/i.test(msg)
        ) {
          return "starting";
        }
        return status;
      })(),
      sessionId: data.sessionId ?? null,
      subdomain: data.subdomain ?? null,
      draftBranch: data.draftBranch ?? null,
      draftSha: data.draftSha ?? null,
      githubFullName: data.githubFullName ?? null,
      hasPreviewUpstream: Boolean(data.hasPreviewUpstream),
      previewPath: data.previewPath ?? null,
      previewHost: data.previewHost ?? null,
      message: data.message,
      reused: data.reused,
      error: data.error,
    };
  } catch (err) {
    return {
      ok: false,
      status: "error",
      sessionId: null,
      subdomain: null,
      draftBranch: null,
      draftSha: null,
      githubFullName: null,
      hasPreviewUpstream: false,
      error: err instanceof Error ? err.message : String(err),
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Lightweight status poll — does not reserve sandbox_runtime usage. */
export async function getProjectSandboxStatusClient(opts: {
  projectId: string;
  workspaceId: string;
}): Promise<ProjectSandboxClientResult | null> {
  if (!isSupabaseConfigured()) return null;
  const token = await authToken();
  if (!token) return null;

  try {
    const res = await fetch(
      `/api/projects/${encodeURIComponent(opts.projectId)}/sandbox?workspaceId=${encodeURIComponent(opts.workspaceId)}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      },
    );
    const data = (await res.json().catch(() => ({}))) as ProjectSandboxClientResult & {
      error?: string;
    };
    if (!res.ok && !data.status) {
      return null;
    }
    return {
      ok: data.ok !== false && data.status !== "error",
      status: data.status ?? "idle",
      sessionId: data.sessionId ?? null,
      subdomain: data.subdomain ?? null,
      draftBranch: data.draftBranch ?? null,
      draftSha: data.draftSha ?? null,
      githubFullName: data.githubFullName ?? null,
      hasPreviewUpstream: Boolean(data.hasPreviewUpstream),
      previewPath: data.previewPath ?? null,
      previewHost: data.previewHost ?? null,
      message: data.message,
      reused: data.reused,
      error: data.error,
    };
  } catch {
    return null;
  }
}
