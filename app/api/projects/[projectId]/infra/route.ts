/**
 * GET /api/projects/[projectId]/infra?workspaceId=
 * Infra status for Build UI — no management secrets.
 */

import { NextResponse } from "next/server";
import { requireBearerUser } from "@/lib/ai/raw-openai/auth";
import { assertProjectAccess } from "@/lib/security/project-access";
import { loadProjectInfra } from "@/lib/build/ensure-project-infra";
import { getBuildInfraCapabilities } from "@/lib/build/config";

export const runtime = "nodejs";

type RouteCtx = { params: Promise<{ projectId: string }> };

export async function GET(request: Request, ctx: RouteCtx) {
  const auth = await requireBearerUser(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { projectId: rawId } = await ctx.params;
  const projectId = rawId?.trim();
  const workspaceId = new URL(request.url).searchParams
    .get("workspaceId")
    ?.trim();
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

  const row = await loadProjectInfra(projectId, workspaceId);
  if (!row) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    capabilities: getBuildInfraCapabilities(),
    infra: {
      status: row.infra_status,
      subdomain: row.cander_subdomain,
      github: row.github_full_name
        ? {
            bound: true,
            fullName: row.github_full_name,
            draftBranch: row.draft_branch,
            draftSha: row.draft_sha,
            publishedSha: row.published_sha,
          }
        : { bound: false },
    },
  });
}
