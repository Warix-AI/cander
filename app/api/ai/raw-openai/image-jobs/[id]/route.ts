/**
 * GET  /api/ai/raw-openai/image-jobs/[id] — poll job status
 * POST /api/ai/raw-openai/image-jobs/[id] — { action: "cancel" }
 */

import { NextResponse } from "next/server";
import { requireBearerUser } from "@/lib/ai/raw-openai/auth";
import {
  getImageGenerationJob,
  updateImageGenerationJob,
} from "@/lib/ai/raw-openai/image-jobs-store";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: Ctx) {
  const auth = await requireBearerUser(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { id } = await ctx.params;
  const job = await getImageGenerationJob(id, auth.user.id);
  if (!job) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }
  return NextResponse.json({
    generationId: job.id,
    status: job.status,
    prompt: job.prompt,
    mimeType: job.mimeType,
    dataUrl: job.status === "completed" ? job.dataUrl : undefined,
    attachmentId: job.attachmentId,
    openaiFileId: job.openaiFileId,
    error: job.error,
    threadId: job.threadId,
    messageId: job.messageId,
  });
}

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireBearerUser(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { id } = await ctx.params;
  let body: { action?: string } = {};
  try {
    body = await request.json();
  } catch {
    /* empty */
  }
  if (body.action !== "cancel") {
    return NextResponse.json(
      { error: "Unsupported action. Use { action: \"cancel\" }." },
      { status: 400 },
    );
  }
  const job = await getImageGenerationJob(id, auth.user.id);
  if (!job) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }
  if (job.status === "completed" || job.status === "failed") {
    return NextResponse.json({
      generationId: job.id,
      status: job.status,
    });
  }
  const updated = await updateImageGenerationJob(id, auth.user.id, {
    status: "cancelled",
  });
  console.log("[IMAGE_JOB]", { event: "cancellation", id });
  return NextResponse.json({
    generationId: id,
    status: updated?.status ?? "cancelled",
  });
}
