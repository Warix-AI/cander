/**
 * POST /api/projects/[projectId]/supabase/ensure
 * GET  /api/projects/[projectId]/supabase?workspaceId=
 *
 * Lazy Warix-managed Supabase for generated apps. Never returns secret keys.
 */

import { NextResponse } from "next/server";
import { requireBearerUser } from "@/lib/ai/raw-openai/auth";
import { assertProjectAccess } from "@/lib/security/project-access";
import {
  ensureAppSupabaseProject,
  getAppSupabasePublicStatus,
} from "@/lib/build/supabase/provision";
import { injectAppSupabaseIntoSandbox } from "@/lib/build/supabase/inject";
import { ensureBuildSandboxSession } from "@/lib/build/sandbox/files";
import { isSupabaseManagementConfigured } from "@/lib/build/config";

export const runtime = "nodejs";
export const maxDuration = 300;

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

  const status = await getAppSupabasePublicStatus({ projectId, workspaceId });
  return NextResponse.json({ ok: true, ...status });
}

export async function POST(request: Request, ctx: RouteCtx) {
  const auth = await requireBearerUser(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { projectId: rawId } = await ctx.params;
  const projectId = rawId?.trim();

  let body: {
    workspaceId?: string;
    injectSandbox?: boolean;
  } = {};
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

  if (!isSupabaseManagementConfigured()) {
    return NextResponse.json({
      ok: true,
      status: "skipped",
      projectRef: null,
      url: null,
      message:
        "Supabase Management API is not configured. Auth recipes stay inactive until it is.",
    });
  }

  try {
    const ensured = await ensureAppSupabaseProject({
      projectId,
      workspaceId,
      includeSecrets: false,
    });

    let inject: { ok: boolean; message?: string } | undefined;
    if (body.injectSandbox !== false && ensured.status === "ready") {
      try {
        const { sessionId } = await ensureBuildSandboxSession({
          userId: auth.user.id,
          projectId,
          workspaceId,
        });
        const injected = await injectAppSupabaseIntoSandbox({
          userId: auth.user.id,
          projectId,
          workspaceId,
          sessionId,
        });
        inject = { ok: injected.ok, message: injected.message };
      } catch (err) {
        inject = {
          ok: false,
          message: err instanceof Error ? err.message : String(err),
        };
      }
    }

    return NextResponse.json({
      ok: ensured.status === "ready" || ensured.status === "skipped",
      status: ensured.status,
      projectRef: ensured.projectRef,
      url: ensured.url,
      created: ensured.created,
      message: ensured.message,
      inject,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
