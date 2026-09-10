/**
 * GET /api/projects/[projectId]/assets/[assetId] — stream a brand asset to a
 * signed-in workspace member (cookie or bearer).
 */

import { NextResponse } from "next/server";
import { resolveRequestUser } from "@/lib/usage/server/context";
import { assertProjectAccess } from "@/lib/security/project-access";
import { readProjectAssetBytes } from "@/lib/project-assets-server";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  ctx: { params: Promise<{ projectId: string; assetId: string }> },
) {
  const { projectId, assetId } = await ctx.params;
  if (!projectId || !assetId) {
    return NextResponse.json({ error: "Missing id." }, { status: 400 });
  }
  const user = await resolveRequestUser(request, { allowCookie: true });
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const asset = await readProjectAssetBytes({ projectId, assetId });
  if (!asset) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const access = await assertProjectAccess({
    projectId,
    workspaceId: asset.workspaceId,
    userId: user.id,
  });
  if (!access.ok) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  return new NextResponse(new Uint8Array(asset.bytes), {
    status: 200,
    headers: {
      "Content-Type": asset.mimeType,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
