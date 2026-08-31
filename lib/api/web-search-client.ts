"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { normalizeMessageCitations } from "@/lib/ai/orchestrator/collect-citations";
import type { ExaSearchBundle } from "@/lib/ai/web-research/evidence-bundle";
import { parseExaSearchBundle } from "@/lib/ai/web-research/evidence-bundle";

export type WebSearchHit = {
  title: string;
  url: string;
  description: string;
  publishedAt: string | null;
  source: string | null;
};

export type WebSearchResponse = {
  ok: boolean;
  detail: string;
  results: WebSearchHit[];
  citations?: ReturnType<typeof normalizeMessageCitations>;
  requestId?: string;
  synthesis?: ExaSearchBundle | null;
  retrievalMode?: string | null;
};

function requestId() {
  return `ws_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeResults(raw: unknown): WebSearchHit[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row: Record<string, unknown>) => ({
      title: String(row.title ?? "").slice(0, 200),
      url: String(row.url ?? ""),
      description: String(row.description ?? row.snippet ?? "").slice(0, 400),
      publishedAt:
        typeof row.publishedAt === "string" ? row.publishedAt : null,
      source: typeof row.source === "string" ? row.source : null,
    }))
    .filter((row) => row.title && row.url);
}

/**
 * Call Exa (via Edge web-search) with the authenticated user JWT.
 * Passes JWT explicitly — invoke() alone can drop auth on Cap/WebView.
 */
export async function searchWeb(
  query: string,
  opts?: {
    mode?: "search" | "research";
    level?: string;
    workspaceId?: string;
    retrievalMode?: string;
    escalate?: string;
    deeper?: boolean;
    retrievalHints?: Record<string, unknown>;
  },
): Promise<WebSearchResponse> {
  const q = query.trim();
  if (!q) {
    return { ok: false, detail: "Empty search query.", results: [] };
  }
  const id = requestId();
  const started = Date.now();
  const mode = opts?.mode ?? "search";
  console.log("[WEB_SEARCH_REQUEST]", {
    requestId: id,
    mode,
    query: q.slice(0, 120),
    ts: Date.now(),
  });

  try {
    const supabase = createSupabaseBrowserClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) {
      console.error("[WEB_SEARCH_ERROR]", {
        requestId: id,
        message: "No auth session",
        durationMs: Date.now() - started,
      });
      return {
        ok: false,
        detail: "Sign in to use web search.",
        results: [],
        requestId: id,
      };
    }

    const { data, error } = await supabase.functions.invoke("web-search", {
      body: {
        query: q,
        count: mode === "research" ? 8 : 5,
        mode,
        ...(opts?.level ? { level: opts.level } : {}),
        ...(opts?.workspaceId ? { workspaceId: opts.workspaceId } : {}),
        ...(opts?.retrievalMode ? { retrievalMode: opts.retrievalMode } : {}),
        ...(opts?.escalate ? { escalate: opts.escalate } : {}),
        ...(opts?.deeper ? { deeper: true } : {}),
        ...(opts?.retrievalHints ? { retrievalHints: opts.retrievalHints } : {}),
      },
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    if (error) {
      const bodyError =
        data && typeof data === "object" && "error" in data
          ? String((data as { error?: unknown }).error)
          : "";
      const message =
        bodyError || error.message || "Web search request failed.";
      console.error("[WEB_SEARCH_ERROR]", {
        requestId: id,
        message: message.slice(0, 200),
        durationMs: Date.now() - started,
      });
      return {
        ok: false,
        detail: message,
        results: [],
        requestId: id,
      };
    }
    if (data?.error) {
      console.error("[WEB_SEARCH_ERROR]", {
        requestId: id,
        message: String(data.error).slice(0, 200),
        durationMs: Date.now() - started,
      });
      return {
        ok: false,
        detail: String(data.error),
        results: [],
        requestId: id,
      };
    }

    const results = normalizeResults(data?.results);
    const synthesis = parseExaSearchBundle(data);
    const citations = normalizeMessageCitations(
      data?.citations ??
        results.map((r, i) => ({
          id: `web_${i + 1}`,
          title: r.title,
          url: r.url,
          excerpt: r.description,
          domain: r.source ?? undefined,
          sourceType: mode === "research" ? "deep-research" : "search",
        })),
    );
    console.log("[WEB_SEARCH_RESPONSE]", {
      requestId: id,
      status: 200,
      resultCount: results.length,
      directOutputPresent: Boolean(synthesis?.directAnswer),
      groundingCount: synthesis?.grounding.length ?? 0,
      retrievalMode: synthesis?.retrievalMode ?? data?.retrievalMode ?? null,
      durationMs: Date.now() - started,
      edgeRequestId: data?.requestId ?? null,
    });
    return {
      ok: true,
      detail: synthesis?.directAnswer
        ? "Retrieved a grounded answer."
        : results.length
          ? `Found ${results.length} result(s).`
          : "No web results.",
      results,
      citations,
      requestId: id,
      synthesis,
      retrievalMode: synthesis?.retrievalMode ?? data?.retrievalMode ?? null,
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

/** Deep research mode — requires EXA_DEEP_SEARCH_ENABLED on Edge. */
export async function researchWeb(
  query: string,
  opts?: { level?: string; workspaceId?: string },
) {
  return searchWeb(query, { mode: "research", ...opts });
}
