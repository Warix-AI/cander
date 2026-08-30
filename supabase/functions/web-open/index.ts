/**
 * Authenticated SSRF-safe page fetch for client local orchestrator.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
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
    const url = String(body?.url ?? "").trim().slice(0, 2048);
    if (!url) {
      return json(400, { error: "url required", requestId: id });
    }

    console.log("[WEB_OPEN_START]", {
      requestId: id,
      url: url.slice(0, 200),
      ts: Date.now(),
    });

    const page = await fetchReadablePage(url);

    if (page.ok) {
      console.log("[WEB_OPEN_SUCCESS]", {
        requestId: id,
        finalUrl: page.finalUrl,
        bytes: page.text.length,
        durationMs: Date.now() - started,
      });
    } else {
      console.error("[WEB_OPEN_FAILURE]", {
        requestId: id,
        error: page.error,
        durationMs: Date.now() - started,
      });
    }

    return json(page.ok ? 200 : 502, {
      ok: page.ok,
      url: page.url,
      finalUrl: page.finalUrl,
      title: page.title,
      text: page.text,
      error: page.error ?? null,
      requestId: id,
    });
  } catch (err) {
    console.error("[WEB_OPEN_FAILURE]", {
      requestId: id,
      message: err instanceof Error ? err.message : "web open error",
      durationMs: Date.now() - started,
    });
    return json(500, {
      error: err instanceof Error ? err.message : "web open error",
      requestId: id,
    });
  }
});
