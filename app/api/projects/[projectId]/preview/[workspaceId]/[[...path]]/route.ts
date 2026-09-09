/**
 * Path-based live preview proxy:
 * /api/projects/[projectId]/preview/[workspaceId]/[[...path]]
 * workspaceId is in the path so rewritten /_next assets keep auth context.
 */

import { authorizePreviewRequest } from "@/lib/build/preview/auth";
import { proxyToPreviewUpstream } from "@/lib/build/preview/proxy-handler";
import { resolvePreviewUpstreamForProject } from "@/lib/build/preview/upstream";
import { BUILD_APP_PORT } from "@/lib/build/sandbox/constants";

export const runtime = "nodejs";
export const maxDuration = 300;

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

  let upstream = await resolvePreviewUpstreamForProject({
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
    onNotListening: async () => {
      if (!upstream?.sessionId) return false;
      try {
        const { ensureSandboxDevServer } = await import(
          "@/lib/build/preview/dev-server"
        );
        const { resolveSandboxForSession } = await import(
          "@/lib/computer/session-runtime"
        );
        const { updateComputerSession } = await import(
          "@/lib/computer/session-store"
        );
        const dev = await ensureSandboxDevServer({
          sessionId: upstream.sessionId,
          userId: auth.userId,
        });
        if (!dev.ready) return false;
        const resolved = await resolveSandboxForSession(
          upstream.sessionId,
          auth.userId,
        );
        const nextOrigin = resolved
          ? (() => {
              try {
                return resolved.sandbox.domain(BUILD_APP_PORT);
              } catch {
                return null;
              }
            })()
          : null;
        if (nextOrigin) {
          const { getComputerSessionRowById } = await import(
            "@/lib/computer/session-store"
          );
          const row = await getComputerSessionRowById(upstream.sessionId);
          const prev = (row?.build_state ?? {}) as Record<string, unknown>;
          await updateComputerSession(upstream.sessionId, {
            stream_url: nextOrigin,
            status: "active",
            build_state: {
              ...prev,
              purpose: "build_app",
              status: "ready",
              previewUpstream: nextOrigin,
              message: "Dev server recovered",
              updatedAt: new Date().toISOString(),
            },
          });
          upstream = {
            ...upstream,
            upstreamOrigin: new URL(nextOrigin).origin,
          };
        }
        return true;
      } catch (err) {
        console.warn("[cander] preview recovery", err);
        return false;
      }
    },
  });
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const HEAD = handle;
export const OPTIONS = handle;
