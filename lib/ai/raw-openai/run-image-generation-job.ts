/**
 * Execute an OpenAI Images API job and persist the result.
 * Intended to run via Next `after()` so client disconnect does not cancel work.
 */

import {
  getImageGenerationJob,
  updateImageGenerationJob,
  type ImageGenerationJob,
} from "@/lib/ai/raw-openai/image-jobs-store";
import {
  resolveOpenAIImageModel,
  resolveOpenAIImageQuality,
} from "@/lib/ai/raw-openai/image-generation";
import {
  createOpenAIMediaClient,
  generateImageViaImagesApi,
  persistGeneratedImageFile,
} from "@/lib/ai/raw-openai/media-provider";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { finalizeUsageReservation } from "@/lib/usage/server/guard-route";

export const IMAGE_JOB_STALE_MS = 130_000;

export function isImageJobStale(job: ImageGenerationJob): boolean {
  if (job.status !== "generating") return false;
  const updated = Date.parse(job.updatedAt || job.createdAt);
  if (!Number.isFinite(updated)) return false;
  return Date.now() - updated > IMAGE_JOB_STALE_MS;
}

export async function runImageGenerationJob(opts: {
  jobId: string;
  userId: string;
  prompt: string;
  apiKey: string;
  reservationId: string;
}): Promise<ImageGenerationJob | null> {
  const latest = await getImageGenerationJob(opts.jobId, opts.userId);
  if (!latest || latest.status === "cancelled") {
    console.log("[IMAGE_JOB]", { event: "skip_cancelled", id: opts.jobId });
    return latest;
  }

  console.log("[IMAGE_JOB]", {
    event: "provider_request_started",
    id: opts.jobId,
    model: resolveOpenAIImageModel(),
  });

  // Heartbeat so leave/return + stale checks don't treat an active job as dead.
  const heartbeat = setInterval(() => {
    void updateImageGenerationJob(opts.jobId, opts.userId, {
      status: "generating",
    }).catch(() => {});
  }, 20_000);

  try {
    const client = createOpenAIMediaClient(opts.apiKey);
    const generated = await generateImageViaImagesApi(client, opts.prompt, {
      model: resolveOpenAIImageModel(),
      quality: resolveOpenAIImageQuality(),
    });

    const again = await getImageGenerationJob(opts.jobId, opts.userId);
    if (!again || again.status === "cancelled") {
      console.log("[IMAGE_JOB]", {
        event: "discard_result_cancelled",
        id: opts.jobId,
      });
      return again;
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
        user_id: opts.userId,
        thread_id: again.threadId,
        message_id: again.messageId,
        filename: "generated.png",
        mime_type: persisted.mimeType,
        size: persisted.size,
        attachment_type: "image",
        openai_file_id: persisted.openaiFileId,
        status: again.messageId ? "attached" : "pending",
      });
      console.log("[IMAGE_JOB]", {
        event: "asset_stored",
        id: opts.jobId,
        attachmentId,
        openaiFileId,
      });
    } catch (e) {
      console.log("[IMAGE_JOB]", {
        event: "asset_store_failed",
        id: opts.jobId,
        error: e instanceof Error ? e.message.slice(0, 200) : "fail",
      });
    }

    const completed = await updateImageGenerationJob(opts.jobId, opts.userId, {
      status: "completed",
      mimeType: generated.mimeType,
      dataUrl: generated.dataUrl,
      attachmentId,
      openaiFileId,
    });
    await finalizeUsageReservation({
      reservationId: opts.reservationId,
      status: "confirmed",
      actualUnits: 1,
    });
    console.log("[IMAGE_JOB]", {
      event: "provider_request_completed",
      id: opts.jobId,
    });
    return completed;
  } catch (e) {
    const message = e instanceof Error ? e.message : "image_generation_failed";
    console.log("[IMAGE_JOB]", {
      event: "failure",
      id: opts.jobId,
      error: message.slice(0, 300),
    });
    const failed = await updateImageGenerationJob(opts.jobId, opts.userId, {
      status: "failed",
      error: message.slice(0, 500),
    });
    await finalizeUsageReservation({
      reservationId: opts.reservationId,
      status: "failed",
    });
    return failed;
  } finally {
    clearInterval(heartbeat);
  }
}
