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

export type ProjectDomainClientState = {
  ok: boolean;
  domain: string | null;
  status: "pending" | "verified" | "error" | "none";
  verified: boolean;
  verification?: Array<{
    type: string;
    domain: string;
    value: string;
    reason?: string;
  }>;
  dnsHint?: { type: string; name: string; value: string } | null;
  message?: string;
  error?: string;
};

export async function getProjectDomainClient(opts: {
  projectId: string;
  workspaceId: string;
}): Promise<ProjectDomainClientState | null> {
  if (!isSupabaseConfigured()) return null;
  const token = await authToken();
  if (!token) return null;
  const q = new URLSearchParams({ workspaceId: opts.workspaceId });
  try {
    const res = await fetch(
      `/api/projects/${encodeURIComponent(opts.projectId)}/domains?${q}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const data = (await res.json().catch(() => ({}))) as ProjectDomainClientState;
    if (!res.ok) {
      return {
        ok: false,
        domain: null,
        status: "none",
        verified: false,
        error: data.error || `domains failed (${res.status})`,
      };
    }
    return { ...data, ok: true };
  } catch (err) {
    return {
      ok: false,
      domain: null,
      status: "none",
      verified: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function attachProjectDomainClient(opts: {
  projectId: string;
  workspaceId: string;
  domain: string;
}): Promise<ProjectDomainClientState | null> {
  if (!isSupabaseConfigured()) return null;
  const token = await authToken();
  if (!token) return null;
  try {
    const res = await fetch(
      `/api/projects/${encodeURIComponent(opts.projectId)}/domains`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workspaceId: opts.workspaceId,
          domain: opts.domain,
        }),
      },
    );
    const data = (await res.json().catch(() => ({}))) as ProjectDomainClientState;
    if (!res.ok) {
      return {
        ok: false,
        domain: null,
        status: "error",
        verified: false,
        error: data.error || data.message || `attach failed (${res.status})`,
      };
    }
    return { ...data, ok: true };
  } catch (err) {
    return {
      ok: false,
      domain: null,
      status: "error",
      verified: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function detachProjectDomainClient(opts: {
  projectId: string;
  workspaceId: string;
  domain?: string;
}): Promise<ProjectDomainClientState | null> {
  if (!isSupabaseConfigured()) return null;
  const token = await authToken();
  if (!token) return null;
  try {
    const res = await fetch(
      `/api/projects/${encodeURIComponent(opts.projectId)}/domains`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workspaceId: opts.workspaceId,
          domain: opts.domain,
        }),
      },
    );
    const data = (await res.json().catch(() => ({}))) as ProjectDomainClientState;
    if (!res.ok) {
      return {
        ok: false,
        domain: null,
        status: "error",
        verified: false,
        error: data.error || `remove failed (${res.status})`,
      };
    }
    return { ...data, ok: true };
  } catch (err) {
    return {
      ok: false,
      domain: null,
      status: "error",
      verified: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
