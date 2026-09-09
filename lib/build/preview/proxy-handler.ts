/**
 * HTTP reverse-proxy to a project's sandbox preview upstream.
 * Rewrites root-relative URLs in HTML so iframe path-proxy works.
 * Server-only.
 */

import type { ResolvedPreviewUpstream } from "@/lib/build/preview/upstream";
import { rewriteHtmlForPreviewProxy } from "@/lib/build/preview/urls";

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

export async function proxyToPreviewUpstream(opts: {
  request: Request;
  upstream: ResolvedPreviewUpstream;
  /** Path on upstream, starting with / */
  upstreamPath: string;
  /** Prefix used for HTML rewrite, e.g. /api/projects/x/preview/ws */
  rewritePrefix: string;
}): Promise<Response> {
  if (opts.request.headers.get("upgrade")?.toLowerCase() === "websocket") {
    // Vercel/Node route handlers cannot reliably upgrade WS; client should refresh.
    return new Response(
      "WebSocket preview proxy is not available on this path. Reloading the preview after edits.",
      { status: 426, headers: { "Content-Type": "text/plain" } },
    );
  }

  const incoming = new URL(opts.request.url);
  const target = new URL(opts.upstreamPath, opts.upstream.upstreamOrigin);
  // Forward search params except Cander control params
  incoming.searchParams.forEach((value, key) => {
    if (key === "workspaceId" || key === "_r") return;
    target.searchParams.set(key, value);
  });

  const headers = new Headers();
  opts.request.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (HOP_BY_HOP.has(lower)) return;
    if (lower === "cookie") return; // don't leak Cander cookies upstream
    if (lower === "authorization") return; // don't leak bearer tokens upstream
    if (lower.startsWith("x-forwarded-")) return;
    if (lower === "x-real-ip") return;
    headers.set(key, value);
  });
  headers.set("host", new URL(opts.upstream.upstreamOrigin).host);
  headers.delete("accept-encoding"); // simplify body handling
  headers.delete("authorization");
  headers.delete("cookie");

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
    // Follow same-origin redirects (e.g. Next trailing-slash 308) without leaking
    // the browser off the proxy path.
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
    return new Response(
      `Preview upstream unavailable: ${message}`,
      { status: 502, headers: { "Content-Type": "text/plain" } },
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
    const rewritten = rewriteHtmlForPreviewProxy(html, opts.rewritePrefix);
    outHeaders.delete("content-length");
    return new Response(rewritten, {
      status: upstreamRes.status,
      headers: outHeaders,
    });
  }

  return new Response(upstreamRes.body, {
    status: upstreamRes.status,
    headers: outHeaders,
  });
}
