/**
 * POST /api/ai/raw-openai/image-jobs — start GPT Image generation.
 * Creates the job, returns 202 immediately, and finishes OpenAI work in `after()`
 * so leave/navigation does not cancel generation.
 *
 * Re-POSTing the same generating job re-attaches the worker (HMR / reload safe)
 * without double-billing when a runner is already active or a reservation exists.
 */

import { after, NextResponse } from "next/server";
import { requireBearerUser } from "@/lib/ai/raw-openai/auth";
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
  isImageJobRunnerActive,
  isImageJobStale,
  rememberImageJobReservation,
  runImageGenerationJob,
} from "@/lib/ai/raw-openai/run-image-generation-job";
import { enforceUsageForRequest } from "@/lib/usage/server/guard-route";

export const runtime = "nodejs";
export const maxDuration = 120;

type Body = {
  prompt?: string;
  generationId?: string;
  threadId?: string | null;
  messageId?: string | null;
  workspaceId?: string | null;
};

function jobResponse(job: NonNullable<Awaited<ReturnType<typeof getImageGenerationJob>>>) {
  return {
    generationId: job.id,
    status: job.status,
    prompt: job.prompt,
    mimeType: job.mimeType,
    dataUrl: job.status === "completed" ? job.dataUrl : undefined,
    attachmentId: job.attachmentId,
    openaiFileId: job.openaiFileId,
    error: job.error,
  };
}

function scheduleImageJob(jobId: string, work: () => Promise<void>) {
  const run = () =>
    work().catch((error) => {
      console.log("[IMAGE_JOB]", {
        event: "after_failure",
        id: jobId,
        error: error instanceof Error ? error.message.slice(0, 300) : "fail",
      });
    });
  after(run);
  // Local/dev: `after()` can be dropped on HMR; kick immediately too.
  // In-process lock in runImageGenerationJob prevents duplicate OpenAI calls.
  if (process.env.NODE_ENV !== "production") {
    void run();
  }
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

  const prompt = (body.prompt || "").trim();
  if (!prompt) {
    return NextResponse.json({ error: "prompt required." }, { status: 400 });
  }

  const generationId =
    (typeof body.generationId === "string" && body.generationId.trim()) ||
    newImageGenerationId();

  const idempotencyKey =
    request.headers.get("Idempotency-Key")?.trim() ||
    `image-job:${generationId}`;

  let existing = await getImageGenerationJob(generationId, auth.user.id);
  if (existing && existing.status !== "generating") {
    return NextResponse.json(jobResponse(existing), { status: 200 });
  }

  const stale =
    existing?.status === "generating" && isImageJobStale(existing);
  const runnerActive =
    existing != null && isImageJobRunnerActive(existing.id);

  // Fresh create or stale retry → reserve usage. Live re-attach → reuse.
  const needsReservation = !existing || stale;

  if (stale && existing) {
    console.log("[IMAGE_JOB]", { event: "retry_stale_job", id: existing.id });
    await updateImageGenerationJob(existing.id, auth.user.id, {
      status: "generating",
      error: undefined,
    });
  }

  let reservationId: string | null = null;
  if (needsReservation) {
    const usage = await enforceUsageForRequest({
      request,
      feature: "image_generation",
      workspaceId: body.workspaceId,
      threadId: body.threadId,
      idempotencyKey,
      estimatedUnits: 1,
      provider: "openai",
      model: resolveOpenAIImageModel(),
    });
    if (!usage.ok) {
      return usage.response;
    }
    reservationId = usage.reservationId;
  }

  if (!existing) {
    existing = await createImageGenerationJob({
      id: generationId,
      userId: auth.user.id,
      threadId: body.threadId ?? null,
      messageId: body.messageId ?? null,
      prompt,
    });
    console.log("[IMAGE_JOB]", {
      event: "provider_request_scheduled",
      id: generationId,
      model: resolveOpenAIImageModel(),
      quality: resolveOpenAIImageQuality(),
    });
  } else if (!runnerActive) {
    console.log("[IMAGE_JOB]", {
      event: "provider_request_reattached",
      id: existing.id,
      stale: Boolean(stale),
    });
  }

  const jobId = existing.id;
  const jobPrompt = existing.prompt || prompt;
  const userId = auth.user.id;
  rememberImageJobReservation(jobId, reservationId);

  // Detach OpenAI work from the client connection so leave/navigation cannot
  // abort generation. Client resumes via poll; re-POST re-attaches if needed.
  if (!runnerActive) {
    scheduleImageJob(jobId, () =>
      runImageGenerationJob({
        jobId,
        userId,
        prompt: jobPrompt,
        apiKey,
        reservationId,
      }).then(() => undefined),
    );
  }

  const latest = await getImageGenerationJob(jobId, userId);
  return NextResponse.json(jobResponse(latest ?? existing), { status: 202 });
}
