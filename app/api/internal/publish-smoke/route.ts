/**
 * TEMPORARY: production publish smoke for SEO-repair verification.
 * POST /api/internal/publish-smoke
 * Auth: Bearer $CANDER_VERCEL_DIAGNOSTIC_SECRET
 */

import { NextResponse } from "next/server";
import { publishProject } from "@/lib/build/publish/publish-project";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { vercelFetch } from "@/lib/build/vercel/api";

export const runtime = "nodejs";
export const maxDuration = 800;

function authorize(request: Request): boolean {
  const secret = process.env.CANDER_VERCEL_DIAGNOSTIC_SECRET?.trim();
  if (!secret) return false;
  const auth = request.headers.get("authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const header = request.headers.get("x-cander-diagnostic-secret")?.trim() || "";
  return bearer === secret || header === secret;
}

async function countProd(vercelProjectId: string): Promise<number> {
  const res = await vercelFetch(
    `/v6/deployments?projectId=${encodeURIComponent(vercelProjectId)}&target=production&limit=50`,
  );
  if (!res.ok) return -1;
  const body = (await res.json()) as { deployments?: unknown[] };
  return (body.deployments || []).length;
}

export async function POST(request: Request) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    projectId?: string;
  };
  const projectId = body.projectId?.trim();
  if (!projectId) {
    return NextResponse.json({ error: "projectId required" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data: project, error } = await admin
    .from("projects")
    .select("id, workspace_id, created_by, draft_sha, vercel_project_id, title")
    .eq("id", projectId)
    .maybeSingle();
  if (error || !project) {
    return NextResponse.json({ error: "project not found" }, { status: 404 });
  }

  const beforeId = project.vercel_project_id
    ? String(project.vercel_project_id)
    : null;
  const before = beforeId ? await countProd(beforeId) : 0;

  const result = await publishProject({
    userId: String(project.created_by),
    projectId: String(project.id),
    workspaceId: String(project.workspace_id),
    preferredUrl: null,
  });

  const afterId = result.vercelProjectId || beforeId;
  const after = afterId ? await countProd(afterId) : -1;

  return NextResponse.json({
    title: project.title,
    draftSha: project.draft_sha,
    beforeCount: before,
    afterCount: after,
    delta: before >= 0 && after >= 0 ? after - before : null,
    result: {
      ok: result.ok,
      status: result.status,
      message: result.message,
      publishedSha: result.publishedSha,
      vercelDeploymentId: result.vercelDeploymentId,
      vercelProjectId: result.vercelProjectId,
      publishAttemptId: result.publishAttemptId,
      gitSyncRepairNeeded: result.gitSyncRepairNeeded,
    },
  });
}
