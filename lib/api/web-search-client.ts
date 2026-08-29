"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export type WebSearchHit = {
  title: string;
  url: string;
  description: string;
  publishedAt: string | null;
  source: string | null;
};

function requestId() {
  return `ws_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function searchWeb(query: string): Promise<{
  ok: boolean;
  detail: string;
  results: WebSearchHit[];
  requestId?: string;
}> {
  const q = query.trim();
  if (!q) {
    return { ok: false, detail: "Empty search query.", results: [] };
  }
  const id = requestId();
  const started = Date.now();
  console.log("[WEB_SEARCH_REQUEST]", {
    requestId: id,
    query: q.slice(0, 120),
    ts: Date.now(),
  });
  try {
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase.functions.invoke("web-search", {
      body: { query: q, count: 5 },
    });
    if (error) {
      console.error("[WEB_SEARCH_ERROR]", {
        requestId: id,
        message: error.message?.slice(0, 160),
        durationMs: Date.now() - started,
      });
      return {
        ok: false,
        detail: error.message || "Web search request failed.",
        results: [],
        requestId: id,
      };
    }
    if (data?.error) {
      console.error("[WEB_SEARCH_ERROR]", {
        requestId: id,
        message: String(data.error).slice(0, 160),
        durationMs: Date.now() - started,
      });
      return {
        ok: false,
        detail: String(data.error),
        results: [],
        requestId: id,
      };
    }
    const raw = Array.isArray(data?.results) ? data.results : [];
    const results: WebSearchHit[] = raw.map(
      (row: Record<string, unknown>) => ({
        title: String(row.title ?? "").slice(0, 200),
        url: String(row.url ?? ""),
        description: String(
          row.description ?? row.snippet ?? "",
        ).slice(0, 400),
        publishedAt:
          typeof row.publishedAt === "string" ? row.publishedAt : null,
        source: typeof row.source === "string" ? row.source : null,
      }),
    ).filter((row: WebSearchHit) => row.title && row.url);

    console.log("[WEB_SEARCH_RESPONSE]", {
      requestId: id,
      status: 200,
      resultCount: results.length,
      durationMs: Date.now() - started,
    });
    return {
      ok: true,
      detail: results.length
        ? `Found ${results.length} result(s).`
        : "No web results.",
      results,
      requestId: id,
    };
  } catch (err) {
    console.error("[WEB_SEARCH_ERROR]", {
      requestId: id,
      message: err instanceof Error ? err.message.slice(0, 160) : "unknown",
      durationMs: Date.now() - started,
    });
    return {
      ok: false,
      detail: err instanceof Error ? err.message : "Web search failed.",
      results: [],
      requestId: id,
    };
  }
}
