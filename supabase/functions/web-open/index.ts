/**
 * Authenticated page read for explicit URL opens.
 * Path: normalize → direct fetch → retry once → validate domain.
 * Exa Contents is a last-resort page read only when direct fetch fails
 * and WEB_OPEN_DIRECT_FETCH_ENABLED is not forcing direct-only failure.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getWebResearchProvider } from "../_shared/agent/web-research/index.ts";
import { webResearchEnabled } from "../_shared/web-research-contract/flags.ts";
import { assertPublicHttpUrl } from "../_shared/web-research-contract/types.ts";
import { fetchReadablePage } from "../_shared/agent/v2/web-open.ts";
import {
  normalizeExplicitUrl,
  retryNormalizedUrl,
  urlHostMatchesRequestedDomain,
} from "../_shared/agent/v2/url-open-path.ts";

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

function resolvePublicUrl(raw: string): { url: string; domain: string } {
  const normalized = normalizeExplicitUrl(raw);
  if (!normalized) {
    throw new Error("Only http(s) URLs or public domains are allowed.");
  }
  const url = assertPublicHttpUrl(normalized.url);
  return { url, domain: normalized.domain };
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
        ok: false,
        error: "Web research is disabled.",
        requestId: id,
      });
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return json(401, { ok: false, error: "Missing authorization", requestId: id });
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
      return json(401, { ok: false, error: "Unauthorized", requestId: id });
    }

    const body = await req.json().catch(() => ({}));
    const rawUrl = String(body?.url ?? "").trim().slice(0, 2048);
    const query =
      typeof body?.query === "string" ? body.query.slice(0, 400) : undefined;
    const workspaceId =
      typeof body?.workspaceId === "string" ? body.workspaceId : null;

    console.log("[WEB_OPEN_REQUEST]", {
      requestId: id,
      payload: {
        url: rawUrl.slice(0, 200),
        query: query ?? null,
        workspaceId,
      },
    });

    if (!rawUrl) {
      return json(400, { ok: false, error: "url required", requestId: id });
    }

    let url: string;
    let domain: string;
    try {
      ({ url, domain } = resolvePublicUrl(rawUrl));
    } catch (err) {
      return json(400, {
        ok: false,
        error: err instanceof Error ? err.message : "Invalid URL",
        requestId: id,
        url: rawUrl,
        finalUrl: rawUrl,
      });
    }

    console.log("[WEB_OPEN_START]", {
      requestId: id,
      normalizedUrl: url.slice(0, 200),
      domain,
      ts: Date.now(),
    });

    // 1) Direct fetch first
    let page = await fetchReadablePage(url);
    console.log("[WEB_OPEN_UPSTREAM_FETCH]", {
      requestId: id,
      attempt: 1,
      url: url.slice(0, 200),
      ok: page.ok,
      finalUrl: page.finalUrl?.slice(0, 200),
      error: page.error ?? null,
      bytes: page.text?.length ?? 0,
    });

    // 2) Retry once with common normalization / www flip
    if (!page.ok) {
      const retryUrl = retryNormalizedUrl(url);
      if (retryUrl) {
        page = await fetchReadablePage(retryUrl);
        console.log("[WEB_OPEN_UPSTREAM_FETCH]", {
          requestId: id,
          attempt: 2,
          url: retryUrl.slice(0, 200),
          ok: page.ok,
          finalUrl: page.finalUrl?.slice(0, 200),
          error: page.error ?? null,
          bytes: page.text?.length ?? 0,
        });
      }
    }

    if (page.ok && page.text.trim()) {
      if (!urlHostMatchesRequestedDomain(page.finalUrl, domain)) {
        console.error("[WEB_OPEN_DOMAIN_MISMATCH]", {
          requestId: id,
          requested: domain,
          finalUrl: page.finalUrl?.slice(0, 200),
        });
        return json(502, {
          ok: false,
          url,
          finalUrl: page.finalUrl,
          title: "",
          text: "",
          error: "final_url_domain_mismatch",
          requestId: id,
          provider: "direct-fetch",
        });
      }

      console.log("[WEB_OPEN_SUCCESS]", {
        requestId: id,
        finalUrl: page.finalUrl,
        bytes: page.text.length,
        durationMs: Date.now() - started,
        provider: "direct-fetch",
      });
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

    // Last-resort page read via Exa Contents (still not search/agent).
    try {
      const provider = getWebResearchProvider();
      const evidence = await provider.read({
        urls: [url],
        query,
        ownerId: user.id,
        workspaceId,
      });
      const primary = evidence.sources[0];
      const text = evidence.evidenceText || primary?.excerpt || "";
      const finalUrl = primary?.url ?? url;
      if (
        text.trim() &&
        urlHostMatchesRequestedDomain(finalUrl, domain)
      ) {
        console.log("[WEB_OPEN_SUCCESS]", {
          requestId: id,
          finalUrl,
          bytes: text.length,
          durationMs: Date.now() - started,
          provider: evidence.provider,
          exaRequestId: evidence.requestId ?? null,
          afterDirectFetchFailure: true,
        });
        return json(200, {
          ok: true,
          url,
          finalUrl,
          title: primary?.title ?? "",
          text,
          requestId: id,
          exaRequestId: evidence.requestId ?? null,
          citations: evidence.sources,
          provider: evidence.provider,
        });
      }
      console.error("[WEB_OPEN_FAILURE]", {
        requestId: id,
        error: text.trim() ? "final_url_domain_mismatch" : "empty_contents",
        durationMs: Date.now() - started,
        provider: evidence.provider,
        directError: page.error ?? null,
      });
      return json(502, {
        ok: false,
        url,
        finalUrl,
        title: "",
        text: "",
        error: text.trim() ? "final_url_domain_mismatch" : "empty_contents",
        requestId: id,
      });
    } catch (exaErr) {
      const exaMessage =
        exaErr instanceof Error ? exaErr.message : "Exa Contents failed";
      console.error("[WEB_OPEN_FAILURE]", {
        requestId: id,
        error: exaMessage.slice(0, 200),
        directError: page.error ?? null,
        durationMs: Date.now() - started,
        fallback: "exa_contents_failed",
      });
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
