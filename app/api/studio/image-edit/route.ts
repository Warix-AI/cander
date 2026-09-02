/**
 * POST /api/studio/image-edit — remove background or resize Studio canvas image.
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
  parseDataUrl,
  resolveImageInputToDataUrl,
  storeStudioAsset,
} from "@/lib/studio-assets-server";
import { enforceUsageForRequest, finalizeUsageReservation } from "@/lib/usage/server/guard-route";

export const runtime = "nodejs";
export const maxDuration = 120;

type Body = {
  workspaceId?: string;
  projectId?: string;
  imageUrl?: string;
  action?: "remove-bg" | "resize";
  resizePreset?: StudioResizePresetId;
};

function presetFor(id: StudioResizePresetId | undefined) {
  return STUDIO_RESIZE_PRESETS.find((item) => item.id === id) ?? null;
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
  if (!workspaceId || !projectId || !imageUrl || !action) {
    return NextResponse.json(
      { error: "workspaceId, projectId, imageUrl, and action are required." },
      { status: 400 },
    );
  }
  if (action !== "remove-bg" && action !== "resize") {
    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
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
        : `Reframe this image to a ${preset!.ratio} ${preset!.label.toLowerCase()} composition. Preserve the subject and important details. Fill the new canvas naturally.`;

    const result = await client.images.edit({
      model: resolveOpenAIImageModel(),
      image: await toFile(bytes, `source.${mimeType.includes("jpeg") ? "jpg" : "png"}`, {
        type: mimeType,
      }),
      prompt,
      size: preset?.size ?? "1024x1024",
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
    const stored = await storeStudioAsset({
      userId: auth.user.id,
      workspaceId,
      projectId,
      dataUrl,
      source: action,
      aspectRatio: preset?.ratio ?? null,
    });

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
