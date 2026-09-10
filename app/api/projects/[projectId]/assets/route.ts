/**
 * POST /api/projects/[projectId]/assets — upload a brand asset (logo, favicon, OG image).
 * GET  /api/projects/[projectId]/assets?workspaceId=&role= — list.
 */

import { NextResponse } from "next/server";
import { requireBearerUser } from "@/lib/ai/raw-openai/auth";
import { assertProjectAccess } from "@/lib/security/project-access";
import {
  listProjectAssets,
  storeProjectAsset,
  type ProjectAssetRole,
} from "@/lib/project-assets-server";

export const runtime = "nodejs";
export const maxDuration = 60;

type RouteCtx = { params: Promise<{ projectId: string }> };

const ROLES: ProjectAssetRole[] = ["logo", "favicon", "og_image", "image"];

export async function POST(request: Request, ctx: RouteCtx) {
  const auth = await requireBearerUser(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { projectId } = await ctx.params;

  let body: { workspaceId?: string; dataUrl?: string; role?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const workspaceId = body.workspaceId?.trim();
  const dataUrl = body.dataUrl?.trim();
  const role = ROLES.includes(body.role as ProjectAssetRole) ? (body.role as ProjectAssetRole) : "image";
  if (!projectId || !workspaceId || !dataUrl) {
    return NextResponse.json({ error: "workspaceId and dataUrl are required." }, { status: 400 });
  }
  const access = await assertProjectAccess({ projectId, workspaceId, userId: auth.user.id });
  if (!access.ok) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  try {
    const asset = await storeProjectAsset({
      userId: auth.user.id,
      workspaceId,
      projectId,
      dataUrl,
      role,
    });
    return NextResponse.json({ ok: true, asset });
  } catch (err) {
    console.warn("[project-assets] upload failed", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "That image couldn’t be saved. Try a PNG, JPG or SVG under 10 MB." }, { status: 400 });
  }
}

export async function GET(request: Request, ctx: RouteCtx) {
  const auth = await requireBearerUser(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { projectId } = await ctx.params;
  const url = new URL(request.url);
  const workspaceId = url.searchParams.get("workspaceId")?.trim();
  const roleParam = url.searchParams.get("role");
  const role = ROLES.includes(roleParam as ProjectAssetRole) ? (roleParam as ProjectAssetRole) : undefined;
  if (!projectId || !workspaceId) {
    return NextResponse.json({ error: "workspaceId is required." }, { status: 400 });
  }
  const access = await assertProjectAccess({ projectId, workspaceId, userId: auth.user.id });
  if (!access.ok) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  const assets = await listProjectAssets({ projectId, workspaceId, role });
  return NextResponse.json({ ok: true, assets });
}
