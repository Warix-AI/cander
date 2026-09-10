/**
 * POST /api/projects/:id/build/ready
 * Server-authoritative ready after tip SHA pin + preview_check.
 */

import { NextResponse } from "next/server";
import { requireBearerUser } from "@/lib/ai/raw-openai/auth";
import { assertProjectAccess } from "@/lib/security/project-access";
import { finalizeBuildReady } from "@/lib/build/preview/finalize-ready";

export const runtime = "nodejs";
export const maxDuration = 300;

type RouteCtx = { params: Promise<{ projectId: string }> };

export async function POST(request: Request, ctx: RouteCtx) {
  const auth = await requireBearerUser(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { projectId: rawId } = await ctx.params;
  const projectId = rawId?.trim();

  let body: { workspaceId?: string } = {};
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
    const result = await finalizeBuildReady({
      userId: auth.user.id,
      projectId,
      workspaceId,
    });
    return NextResponse.json(result, {
      status: result.ok ? 200 : 409,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[cander:build-ready] failed", { projectId, message });
    return NextResponse.json(
      { ok: false, error: message, phase: "failed" },
      { status: 500 },
    );
  }
}
