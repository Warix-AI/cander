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

export type EnsureInfraResponse = {
  ok: boolean;
  projectId?: string;
  subdomain?: string | null;
  infraStatus?: string;
  github?: {
    configured?: boolean;
    skipped?: boolean;
    reason?: string;
    fullName?: string;
    draftSha?: string;
  };
  error?: string;
};

/**
 * Fire-and-forget safe: returns null on auth/network failure.
 * Does not throw into create-project UX.
 */
export async function ensureProjectInfraClient(opts: {
  projectId: string;
  workspaceId: string;
  force?: boolean;
}): Promise<EnsureInfraResponse | null> {
  if (!isSupabaseConfigured()) return null;
  const token = await authToken();
  if (!token) return null;

  try {
    const res = await fetch(
      `/api/projects/${encodeURIComponent(opts.projectId)}/infra/ensure`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workspaceId: opts.workspaceId,
          force: opts.force,
        }),
      },
    );
    const data = (await res.json().catch(() => ({}))) as EnsureInfraResponse;
    if (!res.ok) {
      return {
        ok: false,
        error: data.error || `infra ensure failed (${res.status})`,
      };
    }
    return data;
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
