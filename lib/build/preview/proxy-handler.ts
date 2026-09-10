/**
 * HTTP reverse-proxy to a project's sandbox preview upstream.
 * Rewrites root-relative URLs in HTML so iframe path-proxy works.
 * Server-only.
 */

import type { ResolvedPreviewUpstream } from "@/lib/build/preview/upstream";
import { rewriteHtmlForPreviewProxy } from "@/lib/build/preview/urls";
import { injectPreviewBridge } from "@/lib/build/preview/bridge";
import { PREVIEW_SESSION_COOKIE } from "@/lib/build/preview/preview-token";

/** Strip Cander's own cookies before forwarding to the user's app. */
function filterInboundCookies(header: string): string {
  return header
    .split(";")
    .map((c) => c.trim())
    .filter((c) => {
      const name = c.split("=")[0]?.trim() || "";
      if (name === PREVIEW_SESSION_COOKIE) return false;
      // Supabase auth cookies never reach the sandbox app.
      if (/^sb-/.test(name)) return false;
      return Boolean(c);
    })
    .join("; ");
}

/**
 * Upstream Set-Cookie for the draft host: drop Domain (the sandbox host is
 * not ours) so the browser scopes the cookie to draft--{sub}.cander.app.
 */
function rewriteSetCookie(value: string): string {
  return value
    .split(";")
    .map((p) => p.trim())
    .filter((p) => p && !/^domain=/i.test(p))
    .join("; ");
}

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-encoding",
  "content-length",
]);

function isSandboxNotListening(res: Response, bodyText?: string): boolean {
  if (res.headers.get("x-vercel-error") === "SANDBOX_NOT_LISTENING") return true;
  const text = bodyText || "";
  return (
    res.status === 502 &&
    (text.includes("SANDBOX_NOT_LISTENING") ||
      text.includes("not listening on the requested port"))
  );
}

export async function proxyToPreviewUpstream(opts: {
  request: Request;
  upstream: ResolvedPreviewUpstream;
  /** Path on upstream, starting with / */
  upstreamPath: string;
  /** Prefix used for HTML rewrite, e.g. /api/projects/x/preview/ws */
  rewritePrefix: string;
  /** Optional recovery when the sandbox port is dead. */
  onNotListening?: () => Promise<boolean>;
  /**
   * Host-proxy mode (draft--{sub}.cander.app): the iframe origin belongs to
   * this one project, so the user's app may keep its own cookies. Off for the
   * shared path proxy on the Cander origin.
   */
  passCookies?: boolean;
}): Promise<Response> {
  if (opts.request.headers.get("upgrade")?.toLowerCase() === "websocket") {
    // Vercel/Node route handlers cannot reliably upgrade WS; client should refresh.
    return new Response(
      "WebSocket preview proxy is not available on this path. Reloading the preview after edits.",
      { status: 426, headers: { "Content-Type": "text/plain" } },
    );
  }

  const fetchUpstream = async (): Promise<Response> => {
    const incoming = new URL(opts.request.url);
    const target = new URL(opts.upstreamPath, opts.upstream.upstreamOrigin);
    incoming.searchParams.forEach((value, key) => {
      if (key === "workspaceId" || key === "_r") return;
      target.searchParams.set(key, value);
    });

    const headers = new Headers();
    opts.request.headers.forEach((value, key) => {
      const lower = key.toLowerCase();
      if (HOP_BY_HOP.has(lower)) return;
      if (lower === "cookie") {
        if (opts.passCookies) {
          const filtered = filterInboundCookies(value);
          if (filtered) headers.set("cookie", filtered);
        }
        return;
      }
      if (lower === "authorization") return;
      if (lower.startsWith("x-forwarded-")) return;
      if (lower === "x-real-ip") return;
      headers.set(key, value);
    });
    headers.set("host", new URL(opts.upstream.upstreamOrigin).host);
    headers.delete("accept-encoding");
    headers.delete("authorization");
    if (!opts.passCookies) headers.delete("cookie");

    const init: RequestInit = {
      method: opts.request.method,
      headers,
      redirect: "manual",
    };
    if (opts.request.method !== "GET" && opts.request.method !== "HEAD") {
      const buf = await opts.request.arrayBuffer();
      if (buf.byteLength) init.body = buf;
    }

    let upstreamRes: Response;
    try {
      upstreamRes = await fetch(target, init);
      for (let hop = 0; hop < 5; hop++) {
        if (upstreamRes.status < 300 || upstreamRes.status >= 400) break;
        const location = upstreamRes.headers.get("location");
        if (!location) break;
        let next: URL;
        try {
          next = new URL(location, target);
        } catch {
          break;
        }
        if (next.origin !== target.origin) break;
        upstreamRes = await fetch(next, init);
        target.href = next.href;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return new Response(`Preview upstream unavailable: ${message}`, {
        status: 502,
        headers: { "Content-Type": "text/plain" },
      });
    }
    return upstreamRes;
  };

  let upstreamRes = await fetchUpstream();
  let bodyPeek: string | undefined;
  if (
    upstreamRes.status === 502 &&
    (upstreamRes.headers.get("content-type") || "").includes("text")
  ) {
    bodyPeek = await upstreamRes.clone().text();
  }

  if (
    isSandboxNotListening(upstreamRes, bodyPeek) &&
    opts.onNotListening &&
    opts.request.method === "GET"
  ) {
    try {
      const recovered = await opts.onNotListening();
      if (recovered) {
        await new Promise((r) => setTimeout(r, 1500));
        upstreamRes = await fetchUpstream();
        bodyPeek = undefined;
      }
    } catch (err) {
      console.warn("[cander] preview not-listening recovery failed", err);
    }
  }

  if (isSandboxNotListening(upstreamRes, bodyPeek)) {
    return new Response(
      "Draft preview is starting — the sandbox app is not listening yet. Retry in a few seconds.",
      {
        status: 503,
        headers: {
          "Content-Type": "text/plain",
          "Cache-Control": "no-store",
        },
      },
    );
  }

  const outHeaders = new Headers();
  upstreamRes.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (HOP_BY_HOP.has(lower)) return;
    if (lower === "set-cookie") return;
    if (lower === "content-security-policy") return;
    if (lower === "x-frame-options") return;
    outHeaders.set(key, value);
  });
  if (opts.passCookies) {
    const setCookies =
      typeof (upstreamRes.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie === "function"
        ? (upstreamRes.headers as Headers & { getSetCookie: () => string[] }).getSetCookie()
        : upstreamRes.headers.get("set-cookie")
          ? [upstreamRes.headers.get("set-cookie") as string]
          : [];
    for (const c of setCookies) outHeaders.append("set-cookie", rewriteSetCookie(c));
  }
  outHeaders.delete("x-frame-options");
  outHeaders.set(
    "content-security-policy",
    "frame-ancestors 'self' https://*.cander.app https://cander.app http://localhost:3000 http://127.0.0.1:3000",
  );

  const contentType = upstreamRes.headers.get("content-type") || "";
  if (
    contentType.includes("text/html") &&
    opts.rewritePrefix &&
    upstreamRes.body
  ) {
    const html = await upstreamRes.text();
    const rewritten = injectPreviewBridge(rewriteHtmlForPreviewProxy(html, opts.rewritePrefix));
    outHeaders.delete("content-length");
    return new Response(rewritten, {
      status: upstreamRes.status,
      headers: outHeaders,
    });
  }
  if (contentType.includes("text/html") && upstreamRes.body) {
    // Host proxy (no prefix rewrite) still gets the shell bridge.
    const html = await upstreamRes.text();
    outHeaders.delete("content-length");
    return new Response(injectPreviewBridge(html), {
      status: upstreamRes.status,
      headers: outHeaders,
    });
  }

  if (bodyPeek !== undefined && !upstreamRes.bodyUsed) {
    return new Response(bodyPeek, {
      status: upstreamRes.status,
      headers: outHeaders,
    });
  }

  return new Response(upstreamRes.body, {
    status: upstreamRes.status,
    headers: outHeaders,
  });
}
