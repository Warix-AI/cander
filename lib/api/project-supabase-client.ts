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

export type ProjectSupabaseClientResult = {
  ok: boolean;
  status?: string;
  projectRef?: string | null;
  url?: string | null;
  message?: string;
  error?: string;
};

export async function ensureProjectSupabaseClient(opts: {
  projectId: string;
  workspaceId: string;
  injectSandbox?: boolean;
}): Promise<ProjectSupabaseClientResult | null> {
  if (!isSupabaseConfigured()) return null;
  const token = await authToken();
  if (!token) return null;

  try {
    const res = await fetch(
      `/api/projects/${encodeURIComponent(opts.projectId)}/supabase`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workspaceId: opts.workspaceId,
          injectSandbox: opts.injectSandbox !== false,
        }),
      },
    );
    const data = (await res.json().catch(() => ({}))) as ProjectSupabaseClientResult;
    if (!res.ok) {
      return {
        ok: false,
        error: data.error || `supabase ensure failed (${res.status})`,
        message: data.message || data.error,
        status: data.status,
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
