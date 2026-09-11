/**
 * Job-token OpenAI proxy shared by the sandbox builder's LLM routes.
 * OPENAI_API_KEY never enters the sandbox; each request is authorized with a
 * per-job HMAC token and the job must still be running.
 *
 * Allowed upstreams:
 *  - responses      → model calls (model pinned to the job's planner/coder)
 *  - conversations  → server-managed conversation state (no model call);
 *                     lets the Agents SDK send only deltas per turn.
 */

import { NextResponse } from "next/server";
import { requireBuildJobToken } from "@/lib/build/jobs/token";
import { getBuildJob } from "@/lib/build/jobs/store";
import {
  resolveOpenAICodingModel,
  resolveOpenAIModel,
} from "@/lib/ai/raw-openai/web-search";

const OPENAI_BASE = "https://api.openai.com/v1";
const MAX_BODY_BYTES = 6 * 1024 * 1024;

export type ProxyUpstream = "responses" | "conversations";

export async function proxyBuildJobOpenAI(
  request: Request,
  jobIdRaw: string | undefined,
  upstream: ProxyUpstream,
): Promise<Response> {
  const jobId = jobIdRaw?.trim();
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
  let body: Record<string, unknown> = {};
  if (raw.trim()) {
    try {
      body = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
    }
  }

  if (upstream === "responses") {
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
  } else {
    // Conversations: only an empty/metadata-only create is meaningful here.
    body = { metadata: { cander_job: jobId, cander_project: job.projectId } };
  }

  const res = await fetch(`${OPENAI_BASE}/${upstream}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(12 * 60 * 1000),
  });
  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { "Content-Type": res.headers.get("content-type") || "application/json" },
  });
}
