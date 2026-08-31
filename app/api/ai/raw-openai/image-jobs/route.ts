/**
 * POST /api/ai/raw-openai/image-jobs — start async GPT Image generation.
 * Returns immediately; work continues via next/server `after()`.
 */

import { after } from "next/server";
import { NextResponse } from "next/server";
import { requireBearerUser } from "@/lib/ai/raw-openai/auth";
import { isRawOpenAIModeAllowedOnServer } from "@/lib/ai/raw-openai/flags";
import {
  isOpenAIImageGenerationEnabled,
  resolveOpenAIImageModel,
  resolveOpenAIImageQuality,
} from "@/lib/ai/raw-openai/image-generation";
import {
  createImageGenerationJob,
  getImageGenerationJob,
  newImageGenerationId,
  updateImageGenerationJob,
} from "@/lib/ai/raw-openai/image-jobs-store";
import {
  createOpenAIMediaClient,
  generateImageViaImagesApi,
  persistGeneratedImageFile,
} from "@/lib/ai/raw-openai/media-provider";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 120;

type Body = {
  prompt?: string;
  generationId?: string;
  threadId?: string | null;
  messageId?: string | null;
};

export async function POST(request: Request) {
  if (!isRawOpenAIModeAllowedOnServer()) {
    return NextResponse.json(
      { error: "Raw OpenAI mode is disabled." },
      { status: 403 },
    );
  }
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

  const prompt = (body.prompt || "").trim();
  if (!prompt) {
    return NextResponse.json({ error: "prompt required." }, { status: 400 });
  }

  const generationId =
    (typeof body.generationId === "string" && body.generationId.trim()) ||
    newImageGenerationId();

  // Idempotent: resume/poll must not re-schedule provider work.
  const existing = await getImageGenerationJob(generationId, auth.user.id);
  if (existing) {
    console.log("[IMAGE_JOB]", {
      event: "job_already_exists",
      id: existing.id,
      status: existing.status,
    });
    return NextResponse.json(
      {
        generationId: existing.id,
        status: existing.status,
        prompt: existing.prompt,
      },
      { status: existing.status === "generating" ? 202 : 200 },
    );
  }

  const job = await createImageGenerationJob({
    id: generationId,
    userId: auth.user.id,
    threadId: body.threadId ?? null,
    messageId: body.messageId ?? null,
    prompt,
  });

  console.log("[IMAGE_JOB]", {
    event: "provider_request_scheduled",
    id: job.id,
    model: resolveOpenAIImageModel(),
    quality: resolveOpenAIImageQuality(),
  });

  after(async () => {
    try {
      const latest = await getImageGenerationJob(job.id, auth.user.id);
      if (!latest || latest.status === "cancelled") {
        console.log("[IMAGE_JOB]", { event: "skip_cancelled", id: job.id });
        return;
      }

      console.log("[IMAGE_JOB]", {
        event: "provider_request_started",
        id: job.id,
        model: resolveOpenAIImageModel(),
      });

      const client = createOpenAIMediaClient(apiKey);
      const generated = await generateImageViaImagesApi(client, prompt, {
        model: resolveOpenAIImageModel(),
        quality: resolveOpenAIImageQuality(),
      });

      const again = await getImageGenerationJob(job.id, auth.user.id);
      if (!again || again.status === "cancelled") {
        console.log("[IMAGE_JOB]", {
          event: "discard_result_cancelled",
          id: job.id,
        });
        return;
      }

      let attachmentId: string | undefined;
      let openaiFileId: string | undefined;
      try {
        const persisted = await persistGeneratedImageFile(
          client,
          generated.dataUrl,
          "generated.png",
        );
        openaiFileId = persisted.openaiFileId;
        attachmentId = `att_${crypto.randomUUID().replace(/-/g, "")}`;
        const admin = createSupabaseAdminClient();
        await admin.from("chat_attachments").insert({
          id: attachmentId,
          user_id: auth.user.id,
          thread_id: job.threadId,
          message_id: job.messageId,
          filename: "generated.png",
          mime_type: persisted.mimeType,
          size: persisted.size,
          attachment_type: "image",
          openai_file_id: persisted.openaiFileId,
          status: job.messageId ? "attached" : "pending",
        });
        console.log("[IMAGE_JOB]", {
          event: "asset_stored",
          id: job.id,
          attachmentId,
          openaiFileId,
        });
      } catch (e) {
        console.log("[IMAGE_JOB]", {
          event: "asset_store_failed",
          id: job.id,
          error: e instanceof Error ? e.message.slice(0, 200) : "fail",
        });
      }

      await updateImageGenerationJob(job.id, auth.user.id, {
        status: "completed",
        mimeType: generated.mimeType,
        dataUrl: generated.dataUrl,
        attachmentId,
        openaiFileId,
      });
      console.log("[IMAGE_JOB]", {
        event: "provider_request_completed",
        id: job.id,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "image_generation_failed";
      console.log("[IMAGE_JOB]", {
        event: "failure",
        id: job.id,
        error: message.slice(0, 300),
      });
      await updateImageGenerationJob(job.id, auth.user.id, {
        status: "failed",
        error: message.slice(0, 500),
      });
    }
  });

  return NextResponse.json(
    {
      generationId: job.id,
      status: job.status,
      prompt: job.prompt,
    },
    { status: 202 },
  );
}
