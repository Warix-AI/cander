"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/data-backend";
import type {
  BuildSandboxStatus,
  ProjectRuntimeState,
} from "@/lib/build/sandbox/constants";

/**
 * connect: resume / first-create, never destroys.
 * repair:  escalating fix (restart dev server → reinstall → recreate).
 * reset:   explicit fresh clone (user-intended only).
 */
export type ProjectRuntimeMode = "connect" | "repair" | "reset";

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
  /** User-safe runtime state (present on new servers). */
  state?: ProjectRuntimeState;
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
  /** @deprecated use `mode: "repair"` — kept for older callers; maps to repair. */
  forceRestart?: boolean;
  mode?: ProjectRuntimeMode;
}): Promise<ProjectSandboxClientResult | null> {
  if (!isSupabaseConfigured()) return null;
  const token = await authToken();
  if (!token) return null;

  const mode: ProjectRuntimeMode =
    opts.mode ?? (opts.forceRestart ? "repair" : "connect");
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
          mode,
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
      state: data.state,
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

/** Signed draft-host session for the preview iframe (null when unavailable). */
export async function createPreviewSessionClient(opts: {
  projectId: string;
  workspaceId: string;
  next?: string;
}): Promise<{ url: string; host: string } | null> {
  if (!isSupabaseConfigured()) return null;
  const token = await authToken();
  if (!token) return null;
  try {
    const res = await fetch(
      `/api/projects/${encodeURIComponent(opts.projectId)}/preview-session`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ workspaceId: opts.workspaceId, next: opts.next ?? "/" }),
      },
    );
    if (!res.ok) return null;
    const data = (await res.json().catch(() => null)) as { url?: string | null; host?: string | null } | null;
    return data?.url && data.host ? { url: data.url, host: data.host } : null;
  } catch {
    return null;
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
      state: data.state,
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
