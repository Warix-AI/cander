/**
 * Client mirror — keep in sync with supabase/functions/_shared/agent/bridge-errors.ts
 */

export function isHtmlErrorPayload(text: string): boolean {
  const t = text.trim().slice(0, 200).toLowerCase();
  return (
    t.startsWith("<!doctype") ||
    t.startsWith("<html") ||
    t.includes("<head>") ||
    t.includes("cloudflare") ||
    t.includes("trycloudflare")
  );
}

export function isBridgeOfflineError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    isHtmlErrorPayload(message) ||
    /\b502\b|\b503\b|\b504\b/.test(m) ||
    /bad gateway|bridge unavailable|bridge offline|tunnel|trycloudflare|cloudflare|not configured|econnrefused|fetch failed|network error|ai bridge error/i.test(
      m,
    )
  );
}

export function sanitizeBridgeError(message: string): string {
  if (isBridgeOfflineError(message) || isHtmlErrorPayload(message)) {
    return "I couldn't reach the AI service right now. Please try again shortly.";
  }
  if (message.length > 160 || message.includes("\n")) {
    return "Something went wrong.";
  }
  return message;
}

export function userFacingTurnError(message: string): {
  content: string;
  offline: boolean;
  detail: string;
} {
  const offline = isBridgeOfflineError(message);
  if (offline) {
    return {
      content:
        "I couldn't reach the AI service right now. Please try again shortly.",
      offline: true,
      detail: "bridge_offline",
    };
  }
  return {
    content: "Something went wrong.",
    offline: false,
    detail: "turn_failed",
  };
}

export function bridgeHttpFailureMessage(status: number, body: string): string {
  if (status === 401) return "AI bridge rejected credentials";
  if (
    status === 502 ||
    status === 503 ||
    status === 504 ||
    isHtmlErrorPayload(body)
  ) {
    return "AI bridge unavailable";
  }
  const trimmed = body.trim();
  if (!trimmed || trimmed.length > 120 || isHtmlErrorPayload(trimmed)) {
    return `AI bridge error (${status})`;
  }
  return trimmed;
}
