/**
 * POST /api/projects/[projectId]/git/persist
 * Commit sandbox dirty files to cander/draft (Octokit).
 */

import { NextResponse } from "next/server";
import { requireBearerUser } from "@/lib/ai/raw-openai/auth";
import { assertProjectAccess } from "@/lib/security/project-access";
import { ensureBuildSandboxSession } from "@/lib/build/sandbox/files";
import { persistSandboxToDraft } from "@/lib/build/sandbox/persist";
import { commitFilesToDraftBranch } from "@/lib/build/git/commit-draft";

export const runtime = "nodejs";
export const maxDuration = 180;

type RouteCtx = { params: Promise<{ projectId: string }> };

type Body = {
  workspaceId?: string;
  message?: string;
  /** Optional explicit files (skip sandbox dirty scan). */
  files?: Array<{ path: string; content: string }>;
  /** Optional paths to delete in the same commit (e.g. legacy app/page.js). */
  deletePaths?: string[];
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
  if (!projectId || !workspaceId) {
    return NextResponse.json(
      { error: "projectId and workspaceId are required." },
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
    const message =
      body.message?.trim() || "Cander: persist project draft";

    if (
      (Array.isArray(body.files) && body.files.length > 0) ||
      (Array.isArray(body.deletePaths) && body.deletePaths.length > 0)
    ) {
      const result = await commitFilesToDraftBranch({
        projectId,
        workspaceId,
        message,
        files: Array.isArray(body.files) ? body.files : [],
        deletePaths: Array.isArray(body.deletePaths)
          ? body.deletePaths
          : undefined,
      });
      const outcome =
        result.dbSyncOk === false
          ? ("db_sync_failed" as const)
          : result.noop
            ? ("noop" as const)
            : ("committed" as const);
      const ok = outcome !== "db_sync_failed";
      return NextResponse.json(
        {
          ok,
          ...result,
          outcome,
          paths: (Array.isArray(body.files) ? body.files : []).map((f) => f.path),
          deletedPaths: Array.isArray(body.deletePaths) ? body.deletePaths : [],
          skippedPaths: [],
          error:
            outcome === "db_sync_failed"
              ? result.dbSyncError ||
                "GitHub tip advanced but database draft_sha sync failed."
              : undefined,
        },
        { status: ok ? 200 : 409 },
      );
    }

    const { sessionId } = await ensureBuildSandboxSession({
      userId: auth.user.id,
      projectId,
      workspaceId,
    });
    const result = await persistSandboxToDraft({
      sessionId,
      userId: auth.user.id,
      projectId,
      workspaceId,
      message,
    });
    const ok = result.outcome !== "db_sync_failed";
    return NextResponse.json(
      { ok, sessionId, ...result },
      { status: ok ? 200 : 409 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
