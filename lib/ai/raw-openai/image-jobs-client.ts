/**
 * Client helpers for async image generation jobs (poll-based).
 */

import { getRawOpenAIAuthHeaders } from "./upload-client.ts";
import type { ChatBlock } from "../../types.ts";

export type ImageJobClientStatus =
  | "generating"
  | "completed"
  | "failed"
  | "cancelled";

export type ImageJobPollResult = {
  generationId: string;
  status: ImageJobClientStatus;
  prompt?: string;
  dataUrl?: string;
  mimeType?: string;
  attachmentId?: string;
  openaiFileId?: string;
  error?: string;
};

export function newClientImageGenerationId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `img_${crypto.randomUUID().replace(/-/g, "")}`;
  }
  return `img_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export function createGeneratingImageBlock(opts: {
  generationId: string;
  prompt: string;
}): Extract<ChatBlock, { type: "image_generation" }> {
  return {
    type: "image_generation",
    status: "generating",
    generationId: opts.generationId,
    prompt: opts.prompt,
    imageUrl: null,
  };
}

export async function startImageGenerationJob(opts: {
  prompt: string;
  generationId: string;
  threadId?: string | null;
  messageId?: string | null;
  workspaceId?: string | null;
}): Promise<
  | {
      ok: true;
      generationId: string;
      status: ImageJobClientStatus;
      dataUrl?: string;
      mimeType?: string;
      attachmentId?: string;
      openaiFileId?: string;
      error?: string;
    }
  | { ok: false; error: string }
> {
  try {
    const authHeaders = await getRawOpenAIAuthHeaders();
    const res = await fetch("/api/ai/raw-openai/image-jobs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
      },
      body: JSON.stringify({
        prompt: opts.prompt,
        generationId: opts.generationId,
        threadId: opts.threadId,
        messageId: opts.messageId,
        workspaceId: opts.workspaceId,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as ImageJobPollResult & {
      error?: string;
    };
    if (!res.ok) {
      return {
        ok: false,
        error: data.error || `Image job failed (HTTP ${res.status})`,
      };
    }
    return {
      ok: true,
      generationId: data.generationId || opts.generationId,
      status: data.status || "generating",
      dataUrl: data.dataUrl,
      mimeType: data.mimeType,
      attachmentId: data.attachmentId,
      openaiFileId: data.openaiFileId,
      error: data.error,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "network_error",
    };
  }
}

export async function pollImageGenerationJob(
  generationId: string,
): Promise<ImageJobPollResult | null> {
  try {
    const authHeaders = await getRawOpenAIAuthHeaders();
    const res = await fetch(
      `/api/ai/raw-openai/image-jobs/${encodeURIComponent(generationId)}`,
      { headers: { ...authHeaders } },
    );
    if (res.status === 404) return null;
    const data = (await res.json().catch(() => ({}))) as ImageJobPollResult & {
      error?: string;
    };
    if (!res.ok) {
      return {
        generationId,
        status: "failed",
        error: data.error || `HTTP ${res.status}`,
      };
    }
    return data;
  } catch (e) {
    return {
      generationId,
      status: "failed",
      error: e instanceof Error ? e.message : "network_error",
    };
  }
}

export async function cancelImageGenerationJob(
  generationId: string,
): Promise<boolean> {
  try {
    const authHeaders = await getRawOpenAIAuthHeaders();
    const res = await fetch(
      `/api/ai/raw-openai/image-jobs/${encodeURIComponent(generationId)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        body: JSON.stringify({ action: "cancel" }),
      },
    );
    return res.ok;
  } catch {
    return false;
  }
}

/** Poll until terminal status. Treat sustained 404 as failed (lost job). */
export async function waitForImageGenerationJob(
  generationId: string,
  opts?: {
    intervalMs?: number;
    timeoutMs?: number;
    signal?: AbortSignal;
    onUpdate?: (job: ImageJobPollResult) => void;
  },
): Promise<ImageJobPollResult> {
  const intervalMs = opts?.intervalMs ?? 1200;
  const timeoutMs = opts?.timeoutMs ?? 180_000;
  const started = Date.now();
  let consecutiveMisses = 0;
  while (Date.now() - started < timeoutMs) {
    if (opts?.signal?.aborted) {
      return { generationId, status: "cancelled" };
    }
    const job = await pollImageGenerationJob(generationId);
    if (job) {
      consecutiveMisses = 0;
      opts?.onUpdate?.(job);
      if (
        job.status === "completed" ||
        job.status === "failed" ||
        job.status === "cancelled"
      ) {
        return job;
      }
    } else {
      consecutiveMisses += 1;
      // Job not in memory/DB yet or lost after reload without persistence.
      if (consecutiveMisses >= 20) {
        return {
          generationId,
          status: "failed",
          error: "Image generation job was not found.",
        };
      }
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return {
    generationId,
    status: "failed",
    error: "Timed out waiting for image generation.",
  };
}
