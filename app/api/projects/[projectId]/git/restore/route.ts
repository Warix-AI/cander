/**
 * POST /api/projects/[projectId]/git/restore
 * Move cander/draft tip to a historical SHA and recreate the sandbox.
 */

import { NextResponse } from "next/server";
import { requireBearerUser } from "@/lib/ai/raw-openai/auth";
import { assertProjectAccess } from "@/lib/security/project-access";
import { restoreDraftToSha } from "@/lib/build/git/draft-history";
import { connectProjectRuntime } from "@/lib/build/sandbox/runtime";

export const runtime = "nodejs";
export const maxDuration = 300;

type RouteCtx = { params: Promise<{ projectId: string }> };

type Body = {
  workspaceId?: string;
  sha?: string;
  /** Recreate sandbox from restored tip (default true). */
  restartSandbox?: boolean;
};

export async function POST(request: Request, ctx: RouteCtx) {
  const auth = await requireBearerUser(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { projectId: rawId } = await ctx.params;
  const projectId = rawId?.trim();

  let body: Body = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const workspaceId = body.workspaceId?.trim();
  const sha = body.sha?.trim();
  if (!projectId || !workspaceId || !sha) {
    return NextResponse.json(
      { error: "projectId, workspaceId, and sha are required." },
      { status: 400 },
    );
  }

  const access = await assertProjectAccess({
    projectId,
    workspaceId,
    userId: auth.user.id,
  });
  if (!access.ok) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  try {
    const restored = await restoreDraftToSha({
      projectId,
      workspaceId,
      sha,
    });

    // Connect fast-forwards the existing VM to the restored tip; the VM is
    // only recreated when it is genuinely dead.
    let sandbox: Awaited<ReturnType<typeof connectProjectRuntime>> | null = null;
    if (body.restartSandbox !== false) {
      sandbox = await connectProjectRuntime({
        userId: auth.user.id,
        projectId,
        workspaceId,
      });
    }

    return NextResponse.json({
      ok: true,
      ...restored,
      sandbox: sandbox
        ? {
            status: sandbox.status,
            sessionId: sandbox.sessionId,
            previewPath: sandbox.previewPath,
            previewHost: sandbox.previewHost,
            message: sandbox.message,
          }
        : null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
