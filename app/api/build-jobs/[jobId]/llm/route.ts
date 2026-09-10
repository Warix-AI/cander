/**
 * POST /api/build-jobs/:jobId/llm — OpenAI Responses API proxy for the sandbox
 * builder. OPENAI_API_KEY never enters the sandbox. Auth: per-job HMAC token.
 * Model is pinned to the job's planner / coder models.
 */

import { NextResponse } from "next/server";
import { requireBuildJobToken } from "@/lib/build/jobs/token";
import { getBuildJob } from "@/lib/build/jobs/store";
import {
  resolveOpenAICodingModel,
  resolveOpenAIModel,
} from "@/lib/ai/raw-openai/web-search";

export const runtime = "nodejs";
export const maxDuration = 800;

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const MAX_BODY_BYTES = 6 * 1024 * 1024;

type RouteCtx = { params: Promise<{ jobId: string }> };

export async function POST(request: Request, ctx: RouteCtx) {
  const { jobId: rawJob } = await ctx.params;
  const jobId = rawJob?.trim();
  if (!jobId) return NextResponse.json({ error: "jobId required." }, { status: 400 });
  const claims = requireBuildJobToken(request, jobId);
  if (!claims) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY not configured." }, { status: 503 });
  }

  const job = await getBuildJob(jobId);
  if (!job || !["running", "verifying"].includes(job.status)) {
    return NextResponse.json({ error: "Job is not running." }, { status: 409 });
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Request too large." }, { status: 413 });
  }
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const allowed = new Set(
    [
      job.facts.models?.planner,
      job.facts.models?.coder,
      resolveOpenAIModel(),
      resolveOpenAICodingModel(),
    ].filter(Boolean) as string[],
  );
  const model = typeof body.model === "string" ? body.model : "";
  if (!allowed.has(model)) {
    body.model = job.facts.models?.coder || resolveOpenAICodingModel();
  }
  // Never let the sandbox turn on streaming or background mode through the proxy.
  delete body.stream;
  delete body.background;

  const upstream = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(12 * 60 * 1000),
  });
  const text = await upstream.text();
  return new NextResponse(text, {
    status: upstream.status,
    headers: { "Content-Type": upstream.headers.get("content-type") || "application/json" },
  });
}
