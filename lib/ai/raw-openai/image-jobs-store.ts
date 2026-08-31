/**
 * Server-side image generation job store (Supabase + in-memory fallback).
 */

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type ImageJobStatus =
  | "generating"
  | "completed"
  | "failed"
  | "cancelled";

export type ImageGenerationJob = {
  id: string;
  userId: string;
  threadId: string | null;
  messageId: string | null;
  prompt: string;
  status: ImageJobStatus;
  mimeType?: string;
  openaiFileId?: string;
  attachmentId?: string;
  /** data URL when completed (may be large; preferred for UI) */
  dataUrl?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
};

const memory = new Map<string, ImageGenerationJob>();

function nowIso() {
  return new Date().toISOString();
}

export function newImageGenerationId(): string {
  return `img_${crypto.randomUUID().replace(/-/g, "")}`;
}

export async function createImageGenerationJob(input: {
  id: string;
  userId: string;
  threadId?: string | null;
  messageId?: string | null;
  prompt: string;
}): Promise<ImageGenerationJob> {
  const job: ImageGenerationJob = {
    id: input.id,
    userId: input.userId,
    threadId: input.threadId ?? null,
    messageId: input.messageId ?? null,
    prompt: input.prompt,
    status: "generating",
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  memory.set(job.id, job);

  try {
    const admin = createSupabaseAdminClient();
    const { error } = await admin.from("image_generation_jobs").insert({
      id: job.id,
      user_id: job.userId,
      thread_id: job.threadId,
      message_id: job.messageId,
      prompt: job.prompt,
      status: job.status,
      created_at: job.createdAt,
      updated_at: job.updatedAt,
    });
    if (error) {
      console.log("[IMAGE_JOB]", {
        event: "db_insert_failed",
        id: job.id,
        error: error.message.slice(0, 200),
      });
    }
  } catch (e) {
    console.log("[IMAGE_JOB]", {
      event: "db_unavailable",
      id: job.id,
      error: e instanceof Error ? e.message.slice(0, 200) : "fail",
    });
  }

  console.log("[IMAGE_JOB]", {
    event: "created",
    id: job.id,
    threadId: job.threadId,
    messageId: job.messageId,
  });
  return job;
}

export async function getImageGenerationJob(
  id: string,
  userId: string,
): Promise<ImageGenerationJob | null> {
  const mem = memory.get(id);
  if (mem && mem.userId === userId) return mem;

  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("image_generation_jobs")
      .select("*")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();
    if (error || !data) return mem?.userId === userId ? mem : null;
    const job = rowToJob(data);
    memory.set(job.id, job);
    return job;
  } catch {
    return mem?.userId === userId ? mem : null;
  }
}

export async function updateImageGenerationJob(
  id: string,
  userId: string,
  patch: Partial<
    Pick<
      ImageGenerationJob,
      | "status"
      | "mimeType"
      | "openaiFileId"
      | "attachmentId"
      | "dataUrl"
      | "error"
    >
  >,
): Promise<ImageGenerationJob | null> {
  const current = await getImageGenerationJob(id, userId);
  if (!current) return null;
  if (current.status === "cancelled" && patch.status !== "cancelled") {
    // Ignore late provider results after cancel.
    console.log("[IMAGE_JOB]", { event: "ignore_after_cancel", id });
    return current;
  }

  const next: ImageGenerationJob = {
    ...current,
    ...patch,
    updatedAt: nowIso(),
  };
  memory.set(id, next);

  try {
    const admin = createSupabaseAdminClient();
    const b64 =
      next.dataUrl && next.dataUrl.includes("base64,")
        ? next.dataUrl.split("base64,")[1]
        : null;
    await admin
      .from("image_generation_jobs")
      .update({
        status: next.status,
        mime_type: next.mimeType ?? null,
        openai_file_id: next.openaiFileId ?? null,
        attachment_id: next.attachmentId ?? null,
        result_b64: b64,
        error: next.error ?? null,
        updated_at: next.updatedAt,
      })
      .eq("id", id)
      .eq("user_id", userId);
  } catch (e) {
    console.log("[IMAGE_JOB]", {
      event: "db_update_failed",
      id,
      error: e instanceof Error ? e.message.slice(0, 200) : "fail",
    });
  }

  console.log("[IMAGE_JOB]", {
    event: "updated",
    id,
    status: next.status,
    hasImage: Boolean(next.dataUrl),
    error: next.error?.slice(0, 120),
  });
  return next;
}

function rowToJob(row: Record<string, unknown>): ImageGenerationJob {
  const mime = typeof row.mime_type === "string" ? row.mime_type : "image/png";
  const b64 = typeof row.result_b64 === "string" ? row.result_b64 : null;
  return {
    id: String(row.id),
    userId: String(row.user_id),
    threadId: row.thread_id ? String(row.thread_id) : null,
    messageId: row.message_id ? String(row.message_id) : null,
    prompt: String(row.prompt || ""),
    status: row.status as ImageJobStatus,
    mimeType: mime,
    openaiFileId: row.openai_file_id ? String(row.openai_file_id) : undefined,
    attachmentId: row.attachment_id ? String(row.attachment_id) : undefined,
    dataUrl: b64 ? `data:${mime};base64,${b64}` : undefined,
    error: row.error ? String(row.error) : undefined,
    createdAt: String(row.created_at || nowIso()),
    updatedAt: String(row.updated_at || nowIso()),
  };
}
