/**
 * POST /api/studio/assets — upload / persist a Studio canvas image.
 * GET /api/studio/assets — list project images (oldest generated for covers).
 */

import { NextResponse } from "next/server";
import { requireBearerUser } from "@/lib/ai/raw-openai/auth";
import {
  assertProjectInWorkspace,
  assertWorkspaceMember,
  listStudioProjectAssets,
  storeStudioAsset,
  type StudioAssetSource,
} from "@/lib/studio-assets-server";

export const runtime = "nodejs";
export const maxDuration = 60;

type Body = {
  workspaceId?: string;
  projectId?: string;
  dataUrl?: string;
  source?: "upload" | "generate" | "remove-bg" | "resize";
  aspectRatio?: string | null;
};

export async function POST(request: Request) {
  const auth = await requireBearerUser(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const workspaceId = body.workspaceId?.trim();
  const projectId = body.projectId?.trim();
  const dataUrl = body.dataUrl?.trim();
  if (!workspaceId || !projectId || !dataUrl) {
    return NextResponse.json(
      { error: "workspaceId, projectId, and dataUrl are required." },
      { status: 400 },
    );
  }

  const member = await assertWorkspaceMember(workspaceId, auth.user.id);
  if (!member) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  const projectOk = await assertProjectInWorkspace(projectId, workspaceId);
  if (!projectOk) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  try {
    const stored = await storeStudioAsset({
      userId: auth.user.id,
      workspaceId,
      projectId,
      dataUrl,
      source: body.source ?? "upload",
      aspectRatio: body.aspectRatio ?? null,
    });
    return NextResponse.json({
      assetId: stored.assetId,
      url: stored.url,
      mimeType: stored.mimeType,
      aspectRatio: stored.aspectRatio,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not store Studio image.",
      },
      { status: 500 },
    );
  }
}

const ASSET_SOURCES = new Set<StudioAssetSource>([
  "upload",
  "generate",
  "remove-bg",
  "resize",
]);

export async function GET(request: Request) {
  const auth = await requireBearerUser(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const url = new URL(request.url);
  const workspaceId = url.searchParams.get("workspaceId")?.trim() || "";
  const projectId = url.searchParams.get("projectId")?.trim() || "";
  if (!workspaceId || !projectId) {
    return NextResponse.json(
      { error: "workspaceId and projectId are required." },
      { status: 400 },
    );
  }

  const sourceRaw = url.searchParams.get("source")?.trim();
  const source =
    sourceRaw && ASSET_SOURCES.has(sourceRaw as StudioAssetSource)
      ? (sourceRaw as StudioAssetSource)
      : undefined;
  const limit = Number(url.searchParams.get("limit") || "1");
  const oldestFirst = url.searchParams.get("order") === "asc";
  // Default newest-first so canvas restore can take the latest asset.

  const assets = await listStudioProjectAssets({
    workspaceId,
    projectId,
    userId: auth.user.id,
    source,
    oldestFirst,
    limit: Number.isFinite(limit) ? limit : 1,
  });
  return NextResponse.json({ assets });
}
