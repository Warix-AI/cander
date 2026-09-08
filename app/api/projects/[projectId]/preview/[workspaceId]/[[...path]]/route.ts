/**
 * Path-based live preview proxy:
 * /api/projects/[projectId]/preview/[workspaceId]/[[...path]]
 * workspaceId is in the path so rewritten /_next assets keep auth context.
 */

import { authorizePreviewRequest } from "@/lib/build/preview/auth";
import { proxyToPreviewUpstream } from "@/lib/build/preview/proxy-handler";
import { resolvePreviewUpstreamForProject } from "@/lib/build/preview/upstream";

export const runtime = "nodejs";
export const maxDuration = 60;

type RouteCtx = {
  params: Promise<{
    projectId: string;
    workspaceId: string;
    path?: string[];
  }>;
};

async function handle(request: Request, ctx: RouteCtx): Promise<Response> {
  const {
    projectId: rawId,
    workspaceId: rawWs,
    path: pathParts,
  } = await ctx.params;
  const projectId = rawId?.trim();
  const workspaceId = rawWs?.trim();

  if (!projectId || !workspaceId) {
    return new Response("projectId and workspaceId are required.", {
      status: 400,
    });
  }

  const auth = await authorizePreviewRequest({
    request,
    projectId,
    workspaceId,
  });
  if (!auth.ok) {
    return new Response(auth.error, { status: auth.status });
  }

  const upstream = await resolvePreviewUpstreamForProject({
    projectId,
    workspaceId,
  });
  if (!upstream) {
    return new Response(
      "Preview environment is not ready. Open the project to start the sandbox.",
      { status: 503, headers: { "Content-Type": "text/plain" } },
    );
  }

  const suffix = pathParts?.length ? `/${pathParts.join("/")}` : "/";
  const rewritePrefix = `/api/projects/${encodeURIComponent(projectId)}/preview/${encodeURIComponent(workspaceId)}`;

  return proxyToPreviewUpstream({
    request,
    upstream,
    upstreamPath: suffix,
    rewritePrefix,
  });
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const HEAD = handle;
export const OPTIONS = handle;
