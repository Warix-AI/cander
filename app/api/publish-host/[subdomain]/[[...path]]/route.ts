/**
 * Public production host proxy:
 * {subdomain}.cander.app → /api/publish-host/[subdomain]/[[...path]]
 * No auth — published apps are public. Upstream is SSRF-pinned to Vercel.
 */

import { proxyToPreviewUpstream } from "@/lib/build/preview/proxy-handler";
import { resolveProductionUpstreamBySubdomain } from "@/lib/build/publish/production-upstream";
import { isValidSubdomainLabel } from "@/lib/build/subdomain";

export const runtime = "nodejs";
export const maxDuration = 60;

type RouteCtx = {
  params: Promise<{ subdomain: string; path?: string[] }>;
};

async function handle(request: Request, ctx: RouteCtx): Promise<Response> {
  const { subdomain: rawSub, path: pathParts } = await ctx.params;
  const subdomain = rawSub?.trim().toLowerCase();
  if (!subdomain || !isValidSubdomainLabel(subdomain)) {
    return new Response("Invalid publish host.", { status: 400 });
  }

  const upstream = await resolveProductionUpstreamBySubdomain(subdomain);
  if (!upstream) {
    return new Response(
      "No published app at this address yet.",
      { status: 404, headers: { "Content-Type": "text/plain" } },
    );
  }

  const suffix = pathParts?.length ? `/${pathParts.join("/")}` : "/";
  // Same host — root-relative URLs already hit this host.
  return proxyToPreviewUpstream({
    request,
    upstream: {
      projectId: upstream.projectId,
      workspaceId: upstream.workspaceId,
      subdomain: upstream.subdomain,
      sessionId: null,
      upstreamOrigin: upstream.upstreamOrigin,
    },
    upstreamPath: suffix,
    rewritePrefix: "",
  });
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const HEAD = handle;
export const OPTIONS = handle;
