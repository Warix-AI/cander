/**
 * Client helpers for guided website setup brief.
 */

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/data-backend";

export type WebsiteSetupBriefClient = {
  status: "setup" | "building" | "ready" | "failed";
  completedSteps: number;
  answers: Record<string, unknown>;
  confirmedAt?: string;
  validationIssues?: string[];
  updatedAt: string;
};

async function authToken() {
  if (!isSupabaseConfigured()) return null;
  const supabase = createSupabaseBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

export async function fetchWebsiteSetupBrief(opts: {
  projectId: string;
  workspaceId: string;
}): Promise<WebsiteSetupBriefClient | null> {
  try {
    const token = await authToken();
    if (!token) return null;
    const res = await fetch(
      `/api/projects/${encodeURIComponent(opts.projectId)}/website-setup?workspaceId=${encodeURIComponent(opts.workspaceId)}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      ok?: boolean;
      brief?: WebsiteSetupBriefClient;
    };
    return data.brief ?? null;
  } catch {
    return null;
  }
}

export async function patchWebsiteSetupBrief(opts: {
  projectId: string;
  workspaceId: string;
  patch: Partial<WebsiteSetupBriefClient> & {
    answers?: Record<string, unknown>;
    status?: WebsiteSetupBriefClient["status"];
    init?: boolean;
  };
}): Promise<WebsiteSetupBriefClient | null> {
  try {
    const token = await authToken();
    if (!token) return null;
    const res = await fetch(
      `/api/projects/${encodeURIComponent(opts.projectId)}/website-setup`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workspaceId: opts.workspaceId,
          ...opts.patch,
        }),
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      ok?: boolean;
      brief?: WebsiteSetupBriefClient;
    };
    return data.brief ?? null;
  } catch {
    return null;
  }
}
