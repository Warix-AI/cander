/**
 * Authenticated Brave web search Edge Function.
 * Secret: BRAVE_SEARCH_API_KEY (Supabase Edge secrets — never NEXT_PUBLIC).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

type Json = Record<string, unknown>;

type NormalizedHit = {
  title: string;
  url: string;
  description: string;
  publishedAt: string | null;
  source: string | null;
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
  };
}

function json(status: number, body: Json) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(), "Content-Type": "application/json" },
  });
}

function requestId() {
  return `ws_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function sourceFromUrl(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders() });
  }

  const id = requestId();
  const started = Date.now();

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      console.error("[WEB_SEARCH_ERROR]", { requestId: id, status: 401, message: "Missing authorization" });
      return json(401, { error: "Missing authorization", requestId: id });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      console.error("[WEB_SEARCH_ERROR]", { requestId: id, status: 401, message: "Unauthorized" });
      return json(401, { error: "Unauthorized", requestId: id });
    }

    const apiKey = Deno.env.get("BRAVE_SEARCH_API_KEY") ?? "";
    if (!apiKey) {
      console.error("[WEB_SEARCH_ERROR]", {
        requestId: id,
        status: 503,
        message: "BRAVE_SEARCH_API_KEY missing",
      });
      return json(503, {
        error:
          "Web search is not configured. Set BRAVE_SEARCH_API_KEY in Edge secrets.",
        requestId: id,
      });
    }

    const body = await req.json().catch(() => ({}));
    const query = String(body?.query ?? "").trim().slice(0, 400);
    if (!query) {
      console.error("[WEB_SEARCH_ERROR]", { requestId: id, status: 400, message: "query required" });
      return json(400, { error: "query required", requestId: id });
    }

    const count = Math.min(Number(body?.count) || 5, 8);
    console.log("[WEB_SEARCH_REQUEST]", {
      requestId: id,
      query: query.slice(0, 120),
      count,
      ts: Date.now(),
    });

    const url = new URL("https://api.search.brave.com/res/v1/web/search");
    url.searchParams.set("q", query);
    url.searchParams.set("count", String(count));

    const braveRes = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        "X-Subscription-Token": apiKey,
      },
      signal: AbortSignal.timeout(20_000),
    });

    if (!braveRes.ok) {
      const detail = await braveRes.text().catch(() => "");
      console.error("[WEB_SEARCH_ERROR]", {
        requestId: id,
        status: braveRes.status,
        message: "Brave search failed",
        durationMs: Date.now() - started,
      });
      return json(502, {
        error: "Brave search failed",
        detail: detail.slice(0, 300),
        requestId: id,
      });
    }

    const data = (await braveRes.json()) as {
      web?: {
        results?: Array<{
          title?: string;
          url?: string;
          description?: string;
          age?: string;
          page_age?: string;
          meta_url?: { hostname?: string };
        }>;
      };
    };

    const results: NormalizedHit[] = (data.web?.results ?? [])
      .slice(0, count)
      .map((row) => {
        const href = String(row.url ?? "");
        return {
          title: String(row.title ?? "").slice(0, 200),
          url: href,
          description: String(row.description ?? "").slice(0, 400),
          publishedAt: row.page_age || row.age || null,
          source:
            row.meta_url?.hostname?.replace(/^www\./, "") ||
            sourceFromUrl(href),
        };
      })
      .filter((row) => row.title && row.url);

    console.log("[WEB_SEARCH_RESPONSE]", {
      requestId: id,
      status: 200,
      resultCount: results.length,
      durationMs: Date.now() - started,
    });

    return json(200, { query, results, requestId: id });
  } catch (err) {
    console.error("[WEB_SEARCH_ERROR]", {
      requestId: id,
      status: 500,
      message: err instanceof Error ? err.message : "web search error",
      durationMs: Date.now() - started,
    });
    return json(500, {
      error: err instanceof Error ? err.message : "web search error",
      requestId: id,
    });
  }
});
