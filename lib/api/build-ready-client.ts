/**
 * Client helper: request server-authoritative build ready (preview_check).
 */

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/data-backend";

export type BuildReadyClientResult = {
  ok: boolean;
  phase?: string;
  draftSha?: string | null;
  sessionId?: string | null;
  reason?: string;
  error?: string;
  previewStatus?: number | null;
  diagnostics?: string | null;
  healAttempted?: boolean;
};

async function authToken() {
  if (!isSupabaseConfigured()) return null;
  const supabase = createSupabaseBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

export async function requestBuildReadyClient(opts: {
  projectId: string;
  workspaceId: string;
}): Promise<BuildReadyClientResult | null> {
  if (!isSupabaseConfigured()) return null;
  const token = await authToken();
  if (!token) return null;

  try {
    const res = await fetch(
      `/api/projects/${encodeURIComponent(opts.projectId)}/build/ready`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ workspaceId: opts.workspaceId }),
      },
    );
    const data = (await res.json().catch(() => ({}))) as BuildReadyClientResult;
    if (!res.ok && data.ok !== false) {
      return {
        ok: false,
        error: data.error || data.reason || `HTTP ${res.status}`,
        phase: data.phase || "failed",
      };
    }
    return data;
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      phase: "failed",
    };
  }
}
