/**
 * Authenticated page read via Exa Contents (exclusive public-page reader).
 * Legacy direct fetch only when WEB_OPEN_DIRECT_FETCH_ENABLED=true (emergency).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getWebResearchProvider } from "../_shared/agent/web-research/index.ts";
import {
  webOpenDirectFetchEnabled,
  webResearchEnabled,
} from "../_shared/web-research-contract/flags.ts";
import { assertPublicHttpUrl } from "../_shared/web-research-contract/types.ts";
import { fetchReadablePage } from "../_shared/agent/v2/web-open.ts";

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
  return `wo_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
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
    const rawUrl = String(body?.url ?? "").trim().slice(0, 2048);
    if (!rawUrl) {
      return json(400, { error: "url required", requestId: id });
    }

    let url: string;
    try {
      url = assertPublicHttpUrl(rawUrl);
    } catch (err) {
      return json(400, {
        error: err instanceof Error ? err.message : "Invalid URL",
        requestId: id,
      });
    }

    console.log("[WEB_OPEN_START]", {
      requestId: id,
      url: url.slice(0, 200),
      ts: Date.now(),
    });

    // Exclusive Exa Contents path (default).
    try {
      const provider = getWebResearchProvider();
      const evidence = await provider.read({
        urls: [url],
        query: typeof body?.query === "string" ? body.query : undefined,
        ownerId: user.id,
        workspaceId:
          typeof body?.workspaceId === "string" ? body.workspaceId : null,
      });
      const primary = evidence.sources[0];
      const text = evidence.evidenceText || primary?.excerpt || "";
      console.log("[WEB_OPEN_SUCCESS]", {
        requestId: id,
        finalUrl: primary?.url ?? url,
        bytes: text.length,
        durationMs: Date.now() - started,
        provider: evidence.provider,
        exaRequestId: evidence.requestId ?? null,
      });
      return json(200, {
        ok: true,
        url,
        finalUrl: primary?.url ?? url,
        title: primary?.title ?? "",
        text,
        requestId: id,
        exaRequestId: evidence.requestId ?? null,
        citations: evidence.sources,
        provider: evidence.provider,
      });
    } catch (exaErr) {
      const exaMessage =
        exaErr instanceof Error ? exaErr.message : "Exa Contents failed";
      // No silent fallback — only emergency flag.
      if (!webOpenDirectFetchEnabled()) {
        console.error("[WEB_OPEN_FAILURE]", {
          requestId: id,
          error: exaMessage.slice(0, 200),
          durationMs: Date.now() - started,
          fallback: false,
        });
        return json(502, {
          ok: false,
          url,
          finalUrl: url,
          title: "",
          text: "",
          error: exaMessage,
          requestId: id,
        });
      }

      console.error("[WEB_OPEN_FALLBACK_DIRECT]", {
        requestId: id,
        exaError: exaMessage.slice(0, 120),
      });
      const page = await fetchReadablePage(url);
      if (page.ok) {
        return json(200, {
          ok: true,
          url,
          finalUrl: page.finalUrl,
          title: page.title,
          text: page.text,
          requestId: id,
          provider: "direct-fetch",
        });
      }
      return json(502, {
        ok: false,
        url,
        finalUrl: url,
        title: "",
        text: "",
        error: page.error || exaMessage,
        requestId: id,
      });
    }
  } catch (err) {
    console.error("[WEB_OPEN_FAILURE]", {
      requestId: id,
      message: err instanceof Error ? err.message : "web open error",
      durationMs: Date.now() - started,
    });
    return json(500, {
      ok: false,
      error: err instanceof Error ? err.message : "web open error",
      requestId: id,
    });
  }
});
