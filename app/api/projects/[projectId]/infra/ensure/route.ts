/**
 * POST /api/projects/[projectId]/infra/ensure
 * Idempotent Warix build infra provisioning (subdomain + GitHub repo).
 */

import { NextResponse } from "next/server";
import { requireBearerUser } from "@/lib/ai/raw-openai/auth";
import { assertProjectAccess } from "@/lib/security/project-access";
import { ensureProjectInfra } from "@/lib/build/ensure-project-infra";
import { getBuildInfraCapabilities } from "@/lib/build/config";

export const runtime = "nodejs";
export const maxDuration = 60;

type RouteCtx = { params: Promise<{ projectId: string }> };

export async function POST(request: Request, ctx: RouteCtx) {
  const auth = await requireBearerUser(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { projectId: rawId } = await ctx.params;
  const projectId = rawId?.trim();

  let body: { workspaceId?: string; force?: boolean } = {};
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

  const result = await ensureProjectInfra({
    projectId,
    workspaceId,
    force: Boolean(body.force),
  });

  if (result.error && result.infraStatus === "error" && !result.subdomain) {
    return NextResponse.json(
      { ok: false, ...result, capabilities: getBuildInfraCapabilities() },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    ...result,
    capabilities: getBuildInfraCapabilities(),
  });
}
