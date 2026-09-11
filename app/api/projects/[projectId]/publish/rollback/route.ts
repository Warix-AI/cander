/**
 * POST /api/projects/:id/publish/rollback — restore the previous live version.
 * Promotes the last healthy production deployment recorded before the current
 * one. Never deletes anything; the current deployment stays available.
 */

import { NextResponse } from "next/server";
import { requireBearerUser } from "@/lib/ai/raw-openai/auth";
import { assertProjectAccess } from "@/lib/security/project-access";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { acquirePublishLock, releasePublishLock, rollbackToDeployment } from "@/lib/build/publish/pipeline";

export const runtime = "nodejs";
export const maxDuration = 120;

type RouteCtx = { params: Promise<{ projectId: string }> };

export async function POST(request: Request, ctx: RouteCtx) {
  const auth = await requireBearerUser(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { projectId: rawId } = await ctx.params;
  const projectId = rawId?.trim();
  const body = (await request.json().catch(() => ({}))) as { workspaceId?: string };
  const workspaceId = body.workspaceId?.trim();
  if (!projectId || !workspaceId) {
    return NextResponse.json({ error: "projectId and workspaceId are required." }, { status: 400 });
  }
  const access = await assertProjectAccess({ projectId, workspaceId, userId: auth.user.id });
  if (!access.ok) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const admin = createSupabaseAdminClient();
  const { data: p } = await admin
    .from("projects")
    .select("vercel_project_id, vercel_production_deployment_id, published_sha, vercel_previous_deployment_id, vercel_previous_sha")
    .eq("id", projectId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  const vercelProjectId = p?.vercel_project_id ? String(p.vercel_project_id) : null;
  const previousId = p?.vercel_previous_deployment_id ? String(p.vercel_previous_deployment_id) : null;
  if (!vercelProjectId || !previousId) {
    return NextResponse.json({ ok: false, error: "There is no earlier live version to go back to." }, { status: 409 });
  }

  const holder = `rollback:${crypto.randomUUID()}`;
  const locked = await acquirePublishLock({ projectId, holder, attemptId: holder });
  if (!locked) {
    return NextResponse.json({ ok: false, error: "A publish is in progress. Try again when it finishes." }, { status: 409 });
  }
  try {
    const currentId = p?.vercel_production_deployment_id ? String(p.vercel_production_deployment_id) : null;
    const currentSha = p?.published_sha ? String(p.published_sha) : null;
    const result = await rollbackToDeployment({
      projectId,
      workspaceId,
      vercelProjectId,
      deploymentId: previousId,
      sha: p?.vercel_previous_sha ? String(p.vercel_previous_sha) : null,
      reason: "user_requested",
    });
    if (result.ok) {
      // The version we just left becomes the one you can come back to.
      await admin
        .from("projects")
        .update({ vercel_previous_deployment_id: currentId, vercel_previous_sha: currentSha, updated_at: new Date().toISOString() })
        .eq("id", projectId)
        .eq("workspace_id", workspaceId);
    }
    return NextResponse.json({ ok: result.ok, message: result.message }, { status: result.ok ? 200 : 502 });
  } finally {
    await releasePublishLock({ projectId, holder });
  }
}
