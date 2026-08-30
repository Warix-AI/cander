/**
 * Durable Postgres cache / usage for web research (Edge service role).
 * Never use process-local Maps for quotas or cache.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import type { WebEvidence, WebResearchMode } from "../../web-research-contract/types.ts";
import { WEB_RESEARCH_LIMITS } from "../../web-research-contract/types.ts";

export function createServiceSupabase(): SupabaseClient | null {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function cacheKey(parts: {
  provider: string;
  mode: WebResearchMode;
  query?: string;
  urls?: string[];
  extra?: string;
}): string {
  const raw = JSON.stringify({
    p: parts.provider,
    m: parts.mode,
    q: (parts.query ?? "").trim().toLowerCase(),
    u: (parts.urls ?? []).map((x) => x.trim().toLowerCase()).sort(),
    e: parts.extra ?? "",
  });
  // FNV-1a 32-bit
  let h = 2166136261;
  for (let i = 0; i < raw.length; i++) {
    h ^= raw.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `wr_${(h >>> 0).toString(16)}_${parts.mode}`;
}

export async function getCachedEvidence(
  sb: SupabaseClient,
  key: string,
): Promise<WebEvidence | null> {
  const { data, error } = await sb
    .from("web_research_cache")
    .select("payload, expires_at")
    .eq("cache_key", key)
    .maybeSingle();
  if (error || !data) return null;
  if (new Date(data.expires_at).getTime() <= Date.now()) {
    void sb.from("web_research_cache").delete().eq("cache_key", key);
    return null;
  }
  return data.payload as WebEvidence;
}

export async function setCachedEvidence(
  sb: SupabaseClient,
  opts: {
    key: string;
    provider: string;
    mode: WebResearchMode;
    evidence: WebEvidence;
    ttlSec: number;
  },
): Promise<void> {
  const expires = new Date(Date.now() + opts.ttlSec * 1000).toISOString();
  await sb.from("web_research_cache").upsert({
    cache_key: opts.key,
    provider: opts.provider,
    mode: opts.mode,
    payload: opts.evidence,
    expires_at: expires,
    created_at: new Date().toISOString(),
  });
}

function windowStart(kind: "minute" | "day"): string {
  const d = new Date();
  if (kind === "minute") {
    d.setUTCSeconds(0, 0);
  } else {
    d.setUTCHours(0, 0, 0, 0);
  }
  return d.toISOString();
}

export type QuotaCheckResult =
  | { ok: true }
  | { ok: false; error: string };

export async function assertWithinQuota(
  sb: SupabaseClient,
  opts: {
    ownerId: string;
    workspaceId?: string | null;
    mode: WebResearchMode;
  },
): Promise<QuotaCheckResult> {
  const minuteStart = windowStart("minute");
  const dayStart = windowStart("day");

  const { data: minuteRow } = await sb
    .from("web_research_usage")
    .select("search_count, contents_count, deep_count")
    .eq("owner_id", opts.ownerId)
    .eq("window_kind", "minute")
    .eq("window_start", minuteStart)
    .eq("workspace_id", opts.workspaceId ?? "")
    .maybeSingle();

  const minuteSearches = Number(minuteRow?.search_count ?? 0);
  if (
    opts.mode === "search" &&
    minuteSearches >= WEB_RESEARCH_LIMITS.searchesPerUserPerMinute
  ) {
    return {
      ok: false,
      error: "Web-research limit reached. Try again in a minute.",
    };
  }

  const { data: dayRow } = await sb
    .from("web_research_usage")
    .select("search_count, contents_count, deep_count")
    .eq("owner_id", opts.ownerId)
    .eq("window_kind", "day")
    .eq("window_start", dayStart)
    .eq("workspace_id", opts.workspaceId ?? "")
    .maybeSingle();

  const daySearch = Number(dayRow?.search_count ?? 0);
  const dayContents = Number(dayRow?.contents_count ?? 0);
  const dayDeep = Number(dayRow?.deep_count ?? 0);

  if (
    opts.mode === "search" &&
    daySearch >= WEB_RESEARCH_LIMITS.dailyWorkspaceSearchBudget
  ) {
    return { ok: false, error: "Daily web search budget reached for this workspace." };
  }
  if (
    opts.mode === "contents" &&
    dayContents >= WEB_RESEARCH_LIMITS.dailyWorkspaceContentsBudget
  ) {
    return {
      ok: false,
      error: "Daily page-read budget reached for this workspace.",
    };
  }
  if (
    opts.mode === "deep" &&
    dayDeep >= WEB_RESEARCH_LIMITS.dailyWorkspaceDeepBudget
  ) {
    return {
      ok: false,
      error: "Daily deep-research budget reached for this workspace.",
    };
  }

  return { ok: true };
}

export async function recordUsage(
  sb: SupabaseClient,
  opts: {
    ownerId: string;
    workspaceId?: string | null;
    mode: WebResearchMode;
    costDollars?: number;
  },
): Promise<void> {
  const costMicros = Math.round((opts.costDollars ?? 0) * 1_000_000);
  for (const kind of ["minute", "day"] as const) {
    const start = windowStart(kind);
    const { data: existing } = await sb
      .from("web_research_usage")
      .select(
        "id, search_count, contents_count, deep_count, cost_dollars_micros",
      )
      .eq("owner_id", opts.ownerId)
      .eq("window_kind", kind)
      .eq("window_start", start)
      .eq("workspace_id", opts.workspaceId ?? "")
      .maybeSingle();

    const searchInc = opts.mode === "search" ? 1 : 0;
    const contentsInc = opts.mode === "contents" ? 1 : 0;
    const deepInc = opts.mode === "deep" ? 1 : 0;

    if (existing?.id) {
      await sb
        .from("web_research_usage")
        .update({
          search_count: Number(existing.search_count ?? 0) + searchInc,
          contents_count: Number(existing.contents_count ?? 0) + contentsInc,
          deep_count: Number(existing.deep_count ?? 0) + deepInc,
          cost_dollars_micros:
            Number(existing.cost_dollars_micros ?? 0) + costMicros,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
    } else {
      await sb.from("web_research_usage").insert({
        owner_id: opts.ownerId,
        workspace_id: opts.workspaceId ?? "",
        window_kind: kind,
        window_start: start,
        search_count: searchInc,
        contents_count: contentsInc,
        deep_count: deepInc,
        cost_dollars_micros: costMicros,
        updated_at: new Date().toISOString(),
      });
    }
  }
}

export async function recordEvent(
  sb: SupabaseClient,
  opts: {
    ownerId?: string;
    workspaceId?: string | null;
    provider: string;
    mode: WebResearchMode;
    status: string;
    requestId?: string;
    exaRequestId?: string;
    latencyMs?: number;
    resultCount?: number;
    costDollars?: number;
    errorClass?: string;
  },
): Promise<void> {
  await sb.from("web_research_events").insert({
    owner_id: opts.ownerId ?? null,
    workspace_id: opts.workspaceId ?? null,
    provider: opts.provider,
    mode: opts.mode,
    status: opts.status,
    request_id: opts.requestId ?? null,
    exa_request_id: opts.exaRequestId ?? null,
    latency_ms: opts.latencyMs ?? null,
    result_count: opts.resultCount ?? null,
    cost_dollars_micros: Math.round((opts.costDollars ?? 0) * 1_000_000),
    error_class: opts.errorClass ?? null,
  });
}
