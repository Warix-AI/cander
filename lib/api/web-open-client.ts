"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export type WebOpenResult = {
  ok: boolean;
  url: string;
  finalUrl: string;
  title: string;
  text: string;
  error?: string;
  requestId?: string;
};

function requestId() {
  return `wo_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Fetch a public URL via authenticated Edge Function (SSRF-safe server-side).
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

  const id = requestId();
  const started = Date.now();
  console.log("[WEB_OPEN_START]", { requestId: id, url: raw.slice(0, 200) });

  try {
    const supabase = createSupabaseBrowserClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) {
      console.error("[WEB_OPEN_FAILURE]", { requestId: id, message: "No auth session" });
      return {
        ok: false,
        url: raw,
        finalUrl: raw,
        title: "",
        text: "",
        error: "Sign in to open web pages.",
        requestId: id,
      };
    }

    const { data, error } = await supabase.functions.invoke("web-open", {
      body: { url: raw },
      headers: { Authorization: `Bearer ${session.access_token}` },
    });

    if (error || data?.error) {
      const message =
        (data && typeof data === "object" && "error" in data
          ? String((data as { error?: unknown }).error)
          : "") ||
        error?.message ||
        "Could not open that page.";
      console.error("[WEB_OPEN_FAILURE]", {
        requestId: id,
        message: message.slice(0, 200),
        durationMs: Date.now() - started,
      });
      return {
        ok: false,
        url: raw,
        finalUrl: raw,
        title: "",
        text: "",
        error: message,
        requestId: id,
      };
    }

    const result: WebOpenResult = {
      ok: Boolean(data?.ok),
      url: String(data?.url ?? raw),
      finalUrl: String(data?.finalUrl ?? raw),
      title: String(data?.title ?? ""),
      text: String(data?.text ?? ""),
      error: data?.error ? String(data.error) : undefined,
      requestId: id,
    };

    if (result.ok) {
      console.log("[WEB_OPEN_SUCCESS]", {
        requestId: id,
        finalUrl: result.finalUrl,
        bytes: result.text.length,
        durationMs: Date.now() - started,
      });
    } else {
      console.error("[WEB_OPEN_FAILURE]", {
        requestId: id,
        error: result.error,
        durationMs: Date.now() - started,
      });
    }

    return result;
  } catch (err) {
    console.error("[WEB_OPEN_FAILURE]", {
      requestId: id,
      message: err instanceof Error ? err.message.slice(0, 160) : "unknown",
      durationMs: Date.now() - started,
    });
    return {
      ok: false,
      url: raw,
      finalUrl: raw,
      title: "",
      text: "",
      error: err instanceof Error ? err.message : "Page fetch failed.",
      requestId: id,
    };
  }
}
