/**
 * POST /api/studio/image-edit — remove background, resize, or suggest-edit Studio canvas image.
 */

import { NextResponse } from "next/server";
import { toFile } from "openai/uploads";
import { requireBearerUser } from "@/lib/ai/raw-openai/auth";
import {
  isOpenAIImageGenerationEnabled,
  resolveOpenAIImageModel,
  resolveOpenAIImageQuality,
} from "@/lib/ai/raw-openai/image-generation";
import { createOpenAIMediaClient } from "@/lib/ai/raw-openai/media-provider";
import {
  STUDIO_RESIZE_PRESETS,
  type StudioResizePresetId,
} from "@/lib/studio-assets-client";
import {
  assertProjectInWorkspace,
  assertWorkspaceMember,
  deleteStudioAsset,
  parseDataUrl,
  resolveImageInputToDataUrl,
  storeStudioAsset,
  studioAssetIdFromUrl,
} from "@/lib/studio-assets-server";
import { enforceUsageForRequest, finalizeUsageReservation } from "@/lib/usage/server/guard-route";

export const runtime = "nodejs";
export const maxDuration = 120;

type Body = {
  workspaceId?: string;
  projectId?: string;
  imageUrl?: string;
  action?: "remove-bg" | "resize" | "suggest-edit";
  resizePreset?: StudioResizePresetId;
  prompt?: string;
  /** Current canvas ratio (e.g. "3:4") — used to pick output size for non-resize edits. */
  aspectRatio?: string | null;
};

function presetFor(id: StudioResizePresetId | undefined) {
  return STUDIO_RESIZE_PRESETS.find((item) => item.id === id) ?? null;
}

function sizeFromAspect(ratio: string | null | undefined): "1024x1024" | "1024x1536" | "1536x1024" {
  const raw = (ratio || "1:1").trim().replace("/", ":");
  const [aw, ah] = raw.split(":").map((part) => Number(part.trim()));
  if (!Number.isFinite(aw) || !Number.isFinite(ah) || aw <= 0 || ah <= 0) {
    return "1024x1024";
  }
  const r = aw / ah;
  if (r >= 1.2) return "1536x1024";
  if (r <= 0.85) return "1024x1536";
  return "1024x1024";
}

export async function POST(request: Request) {
  if (!isOpenAIImageGenerationEnabled()) {
    return NextResponse.json(
      { error: "Image generation is disabled (OPENAI_IMAGE_GENERATION)." },
      { status: 503 },
    );
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not configured." },
      { status: 503 },
    );
  }

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
  const imageUrl = body.imageUrl?.trim();
  const action = body.action;
  const suggestPrompt = body.prompt?.trim() ?? "";
  if (!workspaceId || !projectId || !imageUrl || !action) {
    return NextResponse.json(
      { error: "workspaceId, projectId, imageUrl, and action are required." },
      { status: 400 },
    );
  }
  if (
    action !== "remove-bg" &&
    action !== "resize" &&
    action !== "suggest-edit"
  ) {
    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  }
  if (action === "suggest-edit" && !suggestPrompt) {
    return NextResponse.json(
      { error: "prompt is required for suggest-edit." },
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

  const usage = await enforceUsageForRequest({
    request,
    feature: "image_generation",
    workspaceId,
    idempotencyKey:
      request.headers.get("Idempotency-Key")?.trim() ||
      `studio-edit:${projectId}:${action}:${Date.now()}`,
    estimatedUnits: 1,
    provider: "openai",
    model: resolveOpenAIImageModel(),
  });
  if (!usage.ok) {
    return usage.response;
  }

  const preset = action === "resize" ? presetFor(body.resizePreset) : null;
  if (action === "resize" && !preset) {
    return NextResponse.json(
      { error: "resizePreset is required for resize." },
      { status: 400 },
    );
  }

  try {
    const sourceDataUrl = await resolveImageInputToDataUrl(
      imageUrl,
      auth.user.id,
    );
    const { mimeType, bytes } = parseDataUrl(sourceDataUrl);
    const client = createOpenAIMediaClient(apiKey);
    const quality =
      resolveOpenAIImageQuality() === "auto"
        ? "medium"
        : resolveOpenAIImageQuality();

    const prompt =
      action === "remove-bg"
        ? "Remove the background completely. Keep the subject sharp with a fully transparent background. Do not crop the subject."
        : action === "suggest-edit"
          ? `Apply this edit to the image while preserving overall quality and coherence: ${suggestPrompt}`
          : `Reframe this image to a ${preset!.ratio} ${preset!.label.toLowerCase()} composition. Preserve the subject and important details. Fill the new canvas naturally.`;

    const outputSize =
      preset?.size ?? sizeFromAspect(body.aspectRatio);

    const result = await client.images.edit({
      model: resolveOpenAIImageModel(),
      image: await toFile(bytes, `source.${mimeType.includes("jpeg") ? "jpg" : "png"}`, {
        type: mimeType,
      }),
      prompt,
      size: outputSize,
      quality,
      background: action === "remove-bg" ? "transparent" : "opaque",
      output_format: "png",
    } as Parameters<typeof client.images.edit>[0]);

    const payload = result as {
      data?: Array<{ b64_json?: string | null } | undefined>;
    };
    const b64 = payload.data?.[0]?.b64_json?.trim();
    if (!b64) {
      throw new Error("Image edit returned no image data.");
    }
    const dataUrl = `data:image/png;base64,${b64}`;
    const previousAssetId = studioAssetIdFromUrl(imageUrl);
    const stored = await storeStudioAsset({
      userId: auth.user.id,
      workspaceId,
      projectId,
      dataUrl,
      source: action,
      aspectRatio:
        preset?.ratio ??
        (typeof body.aspectRatio === "string" && body.aspectRatio.trim()
          ? body.aspectRatio.trim()
          : null),
    });

    // Keep only the latest canvas version — drop the prior studio asset.
    if (previousAssetId && previousAssetId !== stored.assetId) {
      await deleteStudioAsset(previousAssetId, auth.user.id).catch(() => false);
    }

    await finalizeUsageReservation({
      reservationId: usage.reservationId,
      status: "confirmed",
      actualUnits: 1,
    });

    return NextResponse.json({
      assetId: stored.assetId,
      url: stored.url,
      mimeType: stored.mimeType,
      aspectRatio: stored.aspectRatio,
    });
  } catch (error) {
    await finalizeUsageReservation({
      reservationId: usage.reservationId,
      status: "failed",
    });
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not edit Studio image.",
      },
      { status: 500 },
    );
  }
}
