"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { normalizeExplicitUrl } from "@/lib/ai/orchestrator/url-open-path";

export type WebOpenResult = {
  ok: boolean;
  url: string;
  finalUrl: string;
  title: string;
  text: string;
  error?: string;
  requestId?: string;
  citations?: unknown[];
  provider?: string;
  edgeStatus?: number | null;
};

function requestId() {
  return `wo_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Fetch a public URL via authenticated Edge Function (SSRF-safe server-side).
 * Always normalizes bare domains (canderhq.com → https://canderhq.com).
 */
export async function openWebPage(url: string): Promise<WebOpenResult> {
  const raw = url.trim();
  if (!raw) {
    return {
      ok: false,
      url: raw,
      finalUrl: raw,
      title: "",
      text: "",
      error: "Empty URL.",
    };
  }

  const normalized = normalizeExplicitUrl(raw);
  const targetUrl = normalized?.url ?? raw;
  const id = requestId();
  const started = Date.now();
  const payload = { url: targetUrl };

  console.log("[WEB_OPEN_START]", {
    requestId: id,
    rawUrl: raw.slice(0, 200),
    normalizedUrl: targetUrl.slice(0, 200),
    payload,
  });

  try {
    const supabase = createSupabaseBrowserClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) {
      console.error("[WEB_OPEN_FAILURE]", {
        requestId: id,
        message: "No auth session",
        payload,
      });
      return {
        ok: false,
        url: targetUrl,
        finalUrl: targetUrl,
        title: "",
        text: "",
        error: "Sign in to open web pages.",
        requestId: id,
      };
    }

    const { data, error } = await supabase.functions.invoke("web-open", {
      body: payload,
      headers: { Authorization: `Bearer ${session.access_token}` },
    });

    const edgeBody =
      data && typeof data === "object"
        ? (data as Record<string, unknown>)
        : null;
    const edgeStatus =
      error && typeof error === "object" && "context" in error
        ? Number(
            (error as { context?: { status?: number } }).context?.status ??
              NaN,
          ) || null
        : edgeBody?.ok === false
          ? 502
          : edgeBody?.ok === true
            ? 200
            : null;

    console.log("[WEB_OPEN_EDGE_RESPONSE]", {
      requestId: id,
      status: edgeStatus,
      body: edgeBody
        ? {
            ok: edgeBody.ok ?? null,
            url: edgeBody.url ?? null,
            finalUrl: edgeBody.finalUrl ?? null,
            title: edgeBody.title ?? null,
            error: edgeBody.error ?? null,
            provider: edgeBody.provider ?? null,
            textBytes:
              typeof edgeBody.text === "string"
                ? edgeBody.text.length
                : 0,
            requestId: edgeBody.requestId ?? null,
          }
        : null,
      invokeError: error?.message ?? null,
      durationMs: Date.now() - started,
    });

    if (error || edgeBody?.error) {
      const message =
        (edgeBody && "error" in edgeBody
          ? String(edgeBody.error ?? "")
          : "") ||
        error?.message ||
        "Could not open that page.";
      console.error("[WEB_OPEN_FAILURE]", {
        requestId: id,
        message: message.slice(0, 200),
        status: edgeStatus,
        payload,
        durationMs: Date.now() - started,
      });
      return {
        ok: false,
        url: String(edgeBody?.url ?? targetUrl),
        finalUrl: String(edgeBody?.finalUrl ?? targetUrl),
        title: "",
        text: "",
        error: message,
        requestId: String(edgeBody?.requestId ?? id),
        provider:
          typeof edgeBody?.provider === "string"
            ? edgeBody.provider
            : undefined,
        edgeStatus,
      };
    }

    const result: WebOpenResult = {
      ok: Boolean(edgeBody?.ok),
      url: String(edgeBody?.url ?? targetUrl),
      finalUrl: String(edgeBody?.finalUrl ?? targetUrl),
      title: String(edgeBody?.title ?? ""),
      text: String(edgeBody?.text ?? ""),
      error: edgeBody?.error ? String(edgeBody.error) : undefined,
      requestId: String(edgeBody?.requestId ?? id),
      citations: Array.isArray(edgeBody?.citations)
        ? edgeBody.citations
        : undefined,
      provider:
        typeof edgeBody?.provider === "string" ? edgeBody.provider : undefined,
      edgeStatus,
    };

    if (result.ok) {
      console.log("[WEB_OPEN_SUCCESS]", {
        requestId: id,
        finalUrl: result.finalUrl,
        bytes: result.text.length,
        provider: result.provider,
        durationMs: Date.now() - started,
      });
    } else {
      console.error("[WEB_OPEN_FAILURE]", {
        requestId: id,
        error: result.error,
        status: edgeStatus,
        payload,
        durationMs: Date.now() - started,
      });
    }

    return result;
  } catch (err) {
    console.error("[WEB_OPEN_FAILURE]", {
      requestId: id,
      message: err instanceof Error ? err.message.slice(0, 160) : "unknown",
      payload,
      durationMs: Date.now() - started,
    });
    return {
      ok: false,
      url: targetUrl,
      finalUrl: targetUrl,
      title: "",
      text: "",
      error: err instanceof Error ? err.message : "Page fetch failed.",
      requestId: id,
    };
  }
}
