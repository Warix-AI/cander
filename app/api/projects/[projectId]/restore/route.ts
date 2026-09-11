/**
 * POST /api/projects/:id/restore — undo an archive within the grace period.
 */

import { NextResponse } from "next/server";
import { requireBearerUser } from "@/lib/ai/raw-openai/auth";
import { assertProjectAccess } from "@/lib/security/project-access";
import { restoreProject } from "@/lib/build/infra/archive";

export const runtime = "nodejs";
export const maxDuration = 60;

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

  const result = await restoreProject({ projectId, workspaceId });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
  return NextResponse.json({ ok: true, restored: result.restored });
}
