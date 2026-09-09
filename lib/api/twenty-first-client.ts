/**
 * Browser client for server-side 21st.dev MCP (API_KEY_21ST never leaves the server).
 */

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/data-backend";
import type { SiteSpec } from "@/lib/ai/build/site-spec";
import type {
  RetrievedComponentRef,
} from "@/lib/ai/build/website-setup-brief";
import type { SiteSpecRetrievalResult } from "@/lib/ai/build/twenty-first-mcp";

async function authToken() {
  if (!isSupabaseConfigured()) return null;
  const supabase = createSupabaseBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

async function postTwentyFirst<T>(
  body: Record<string, unknown>,
): Promise<T | null> {
  const token = await authToken();
  if (!token) return null;
  const res = await fetch("/api/ai/twenty-first", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.warn("[cander:21st-mcp] client HTTP", res.status, text.slice(0, 200));
    return null;
  }
  return (await res.json()) as T;
}

export async function retrieveTwentyFirstForSiteSpecClient(opts: {
  workspaceId: string;
  projectId: string;
  spec: SiteSpec;
}): Promise<SiteSpecRetrievalResult> {
  const data = await postTwentyFirst<SiteSpecRetrievalResult & { ok?: boolean }>(
    {
      action: "retrieve_for_spec",
      workspaceId: opts.workspaceId,
      projectId: opts.projectId,
      spec: opts.spec,
    },
  );
  if (!data) {
    return {
      components: [],
      usedFallback: true,
      connected: false,
      toolsDiscovered: [],
      error: "21st API unreachable",
    };
  }
  return {
    components: (data.components ?? []) as RetrievedComponentRef[],
    usedFallback: Boolean(data.usedFallback),
    connected: Boolean(data.connected),
    toolsDiscovered: data.toolsDiscovered ?? [],
    error: data.error,
  };
}

export async function retrieveTwentyFirstForBuildPlanClient(opts: {
  workspaceId: string;
  projectId: string;
  buildPlan: import("@/lib/ai/build/plan/types").BuildPlanJson;
}): Promise<
  SiteSpecRetrievalResult & {
    researchManifest?: import("@/lib/ai/build/plan/types").ResearchManifest;
  }
> {
  const data = await postTwentyFirst<
    SiteSpecRetrievalResult & {
      ok?: boolean;
      researchManifest?: import("@/lib/ai/build/plan/types").ResearchManifest;
    }
  >({
    action: "retrieve_for_build_plan",
    workspaceId: opts.workspaceId,
    projectId: opts.projectId,
    buildPlan: opts.buildPlan,
  });
  if (!data) {
    return {
      components: [],
      usedFallback: true,
      connected: false,
      toolsDiscovered: [],
      error: "21st API unreachable",
    };
  }
  return {
    components: (data.components ?? []) as RetrievedComponentRef[],
    usedFallback: Boolean(data.usedFallback),
    connected: Boolean(data.connected),
    toolsDiscovered: data.toolsDiscovered ?? [],
    error: data.error,
    researchManifest: data.researchManifest,
  };
}

export async function searchTwentyFirstClient(opts: {
  workspaceId: string;
  projectId?: string | null;
  query: string;
  role?: string;
  limit?: number;
}): Promise<
  Array<{
    id: string;
    name: string;
    category: string;
    source: string;
    hasCode?: boolean;
  }>
> {
  const data = await postTwentyFirst<{
    candidates?: Array<{
      id: string;
      name: string;
      category: string;
      source: string;
      hasCode?: boolean;
    }>;
  }>({
    action: "search",
    workspaceId: opts.workspaceId,
    projectId: opts.projectId,
    query: opts.query,
    role: opts.role,
    limit: opts.limit,
  });
  return data?.candidates ?? [];
}

export async function getTwentyFirstClient(opts: {
  workspaceId: string;
  projectId?: string | null;
  componentId: string;
}): Promise<RetrievedComponentRef | null> {
  const data = await postTwentyFirst<{
    component?: RetrievedComponentRef | null;
  }>({
    action: "get",
    workspaceId: opts.workspaceId,
    projectId: opts.projectId,
    componentId: opts.componentId,
  });
  return data?.component ?? null;
}
