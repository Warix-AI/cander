/**
 * Authenticated web search / research Edge Function.
 * Secrets: EXA_API_KEY (default). WEB_RESEARCH_PROVIDER selects provider.
 * Never NEXT_PUBLIC_. .env.local does not configure deployed Edge secrets.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getWebResearchProvider } from "../_shared/agent/web-research/index.ts";
import {
  exaDeepSearchEnabled,
  webResearchEnabled,
} from "../_shared/web-research-contract/flags.ts";

type Json = Record<string, unknown>;

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders() });
  }

  const id = requestId();
  const started = Date.now();

  try {
    if (!webResearchEnabled()) {
      return json(503, {
        error: "Web research is disabled.",
        requestId: id,
      });
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
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
      return json(401, { error: "Unauthorized", requestId: id });
    }

    const body = await req.json().catch(() => ({}));
    const mode = String(body?.mode ?? "search").toLowerCase();
    const query = String(body?.query ?? "").trim().slice(0, 400);
    const count = Math.min(Number(body?.count) || 5, 8);
    const workspaceId =
      typeof body?.workspaceId === "string" ? body.workspaceId : null;
    const retrievalMode =
      typeof body?.retrievalMode === "string" ? body.retrievalMode : undefined;
    const escalate =
      typeof body?.escalate === "string" ? body.escalate : undefined;
    const deeper = body?.deeper === true;
    const retrievalHints =
      body?.retrievalHints && typeof body.retrievalHints === "object"
        ? (body.retrievalHints as Record<string, unknown>)
        : undefined;

    if (!query) {
      return json(400, { error: "query required", requestId: id });
    }

    console.log("[WEB_SEARCH_REQUEST]", {
      requestId: id,
      mode,
      query: query.slice(0, 120),
      count,
      ts: Date.now(),
    });

    const provider = getWebResearchProvider();

    if (mode === "research" || mode === "deep") {
      if (!exaDeepSearchEnabled()) {
        return json(503, {
          error:
            "Deep research is not enabled. Set EXA_DEEP_SEARCH_ENABLED on Edge secrets after validating cost.",
          requestId: id,
        });
      }
      const evidence = await provider.research({
        query,
        count,
        level: body?.level === "deep-lite" || body?.level === "deep-reasoning"
          ? body.level
          : "deep",
        ownerId: user.id,
        workspaceId,
      });
      const results = evidence.sources.map((s) => ({
        title: s.title,
        url: s.url,
        description: s.excerpt ?? "",
        publishedAt: s.publishedAt ?? null,
        source: s.domain || null,
      }));
      console.log("[WEB_SEARCH_RESPONSE]", {
        requestId: id,
        mode: "research",
        status: 200,
        resultCount: results.length,
        durationMs: Date.now() - started,
        exaRequestId: evidence.requestId ?? null,
      });
      return json(200, {
        query,
        results,
        requestId: id,
        exaRequestId: evidence.requestId ?? null,
        citations: evidence.sources,
        mode: "deep",
        provider: evidence.provider,
      });
    }

    const evidence = await provider.search({
      query,
      count,
      ownerId: user.id,
      workspaceId,
      ...(retrievalMode ? { retrievalMode } : {}),
      ...(escalate ? { escalate } : {}),
      ...(deeper ? { deeper } : {}),
      ...(retrievalHints ? { retrievalHints } : {}),
    });
    const results = evidence.sources.map((s) => ({
      title: s.title,
      url: s.url,
      description: s.excerpt ?? "",
      publishedAt: s.publishedAt ?? null,
      source: s.domain || null,
    }));

    console.log("[WEB_SEARCH_RESPONSE]", {
      requestId: id,
      mode: "search",
      status: 200,
      resultCount: results.length,
      directOutputPresent: Boolean(evidence.directAnswer),
      groundingCount: evidence.grounding?.length ?? 0,
      retrievalMode: evidence.retrievalMode ?? null,
      durationMs: Date.now() - started,
      exaRequestId: evidence.requestId ?? null,
    });

    return json(200, {
      query,
      results,
      requestId: id,
      exaRequestId: evidence.requestId ?? null,
      citations: evidence.sources,
      mode: "search",
      provider: evidence.provider,
      directAnswer: evidence.directAnswer ?? null,
      structuredAnswer: evidence.structuredAnswer ?? null,
      grounding: evidence.grounding ?? [],
      groundingConfidence: evidence.groundingConfidence ?? "none",
      retrievalMode: evidence.retrievalMode ?? null,
      outputSchemaType: evidence.outputSchemaType ?? "none",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "web search error";
    console.error("[WEB_SEARCH_ERROR]", {
      requestId: id,
      status: 500,
      message: message.slice(0, 200),
      durationMs: Date.now() - started,
    });
    const status =
      /limit reached|budget reached|disabled|not enabled|missing/i.test(message)
        ? 503
        : 500;
    return json(status, { error: message, requestId: id });
  }
});
