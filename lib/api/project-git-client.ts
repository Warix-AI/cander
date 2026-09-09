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

export type DraftCommitClient = {
  sha: string;
  shortSha: string;
  message: string;
  title: string;
  authorName: string | null;
  authorDate: string | null;
  parents: string[];
};

export async function listProjectDraftCommitsClient(opts: {
  projectId: string;
  workspaceId: string;
  limit?: number;
}): Promise<{
  ok: boolean;
  commits: DraftCommitClient[];
  draftBranch: string | null;
  tipSha: string | null;
  error?: string;
} | null> {
  if (!isSupabaseConfigured()) return null;
  const token = await authToken();
  if (!token) return null;

  const q = new URLSearchParams({ workspaceId: opts.workspaceId });
  if (opts.limit) q.set("limit", String(opts.limit));

  try {
    const res = await fetch(
      `/api/projects/${encodeURIComponent(opts.projectId)}/git/commits?${q}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      commits?: DraftCommitClient[];
      draftBranch?: string;
      tipSha?: string | null;
      error?: string;
    };
    if (!res.ok) {
      return {
        ok: false,
        commits: [],
        draftBranch: null,
        tipSha: null,
        error: data.error || `commits failed (${res.status})`,
      };
    }
    return {
      ok: true,
      commits: data.commits ?? [],
      draftBranch: data.draftBranch ?? null,
      tipSha: data.tipSha ?? null,
    };
  } catch (err) {
    return {
      ok: false,
      commits: [],
      draftBranch: null,
      tipSha: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function restoreProjectDraftShaClient(opts: {
  projectId: string;
  workspaceId: string;
  sha: string;
  restartSandbox?: boolean;
}): Promise<{
  ok: boolean;
  draftSha?: string;
  alreadyAtTip?: boolean;
  previewPath?: string | null;
  error?: string;
} | null> {
  if (!isSupabaseConfigured()) return null;
  const token = await authToken();
  if (!token) return null;

  try {
    const res = await fetch(
      `/api/projects/${encodeURIComponent(opts.projectId)}/git/restore`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workspaceId: opts.workspaceId,
          sha: opts.sha,
          restartSandbox: opts.restartSandbox !== false,
        }),
      },
    );
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      draftSha?: string;
      alreadyAtTip?: boolean;
      sandbox?: { previewPath?: string | null };
      error?: string;
    };
    if (!res.ok || data.ok === false) {
      return {
        ok: false,
        error: data.error || `restore failed (${res.status})`,
      };
    }
    return {
      ok: true,
      draftSha: data.draftSha,
      alreadyAtTip: data.alreadyAtTip,
      previewPath: data.sandbox?.previewPath ?? null,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Commit explicit file contents to cander/draft (no sandbox required). */
export async function commitProjectDraftFilesClient(opts: {
  projectId: string;
  workspaceId: string;
  files: Array<{ path: string; content: string }>;
  deletePaths?: string[];
  message?: string;
}): Promise<{
  ok: boolean;
  draftSha?: string;
  filesCommitted?: number;
  error?: string;
} | null> {
  if (!isSupabaseConfigured()) return null;
  const token = await authToken();
  if (!token) return null;
  if (!opts.files.length && !(opts.deletePaths?.length ?? 0)) {
    return { ok: true, filesCommitted: 0 };
  }

  try {
    const res = await fetch(
      `/api/projects/${encodeURIComponent(opts.projectId)}/git/persist`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workspaceId: opts.workspaceId,
          message: opts.message || "Cander: save draft scaffold",
          files: opts.files,
          deletePaths: opts.deletePaths,
        }),
      },
    );
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      draftSha?: string;
      filesCommitted?: number;
      error?: string;
    };
    if (!res.ok || data.ok === false) {
      return {
        ok: false,
        error: data.error || `git persist failed (${res.status})`,
      };
    }
    return {
      ok: true,
      draftSha: data.draftSha,
      filesCommitted: data.filesCommitted ?? opts.files.length,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
