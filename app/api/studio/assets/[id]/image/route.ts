/**
 * GET /api/studio/assets/[id]/image — stream a Studio canvas image.
 */

import { NextResponse } from "next/server";
import { resolveRequestUser } from "@/lib/usage/server/context";
import { readStudioAssetBytes } from "@/lib/studio-assets-server";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const assetId = id?.trim();
  if (!assetId) {
    return NextResponse.json({ error: "Missing asset id." }, { status: 400 });
  }

  const user = await resolveRequestUser(request, { allowCookie: true });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const asset = await readStudioAssetBytes(assetId, user.id);
  if (!asset) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(asset.bytes), {
    status: 200,
    headers: {
      "Content-Type": asset.mimeType,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
