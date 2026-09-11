/**
 * POST /api/projects/:id/archive — "delete" in the product.
 * Soft-archives the project (hidden, sandbox stopped, database paused). The
 * repo, Vercel project and live site stay until the grace period ends, so a
 * mistaken delete is recoverable with /restore.
 */

import { NextResponse } from "next/server";
import { requireBearerUser } from "@/lib/ai/raw-openai/auth";
import { assertProjectAccess } from "@/lib/security/project-access";
import { archiveProject } from "@/lib/build/infra/archive";

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

  const result = await archiveProject({ projectId, workspaceId, userId: auth.user.id });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 404 });
  return NextResponse.json({ ok: true, archivedAt: result.archivedAt, restorableUntil: result.teardownAfter });
}
