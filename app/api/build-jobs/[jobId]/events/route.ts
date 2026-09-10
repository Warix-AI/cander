/**
 * POST /api/build-jobs/:jobId/events — builder → Cander push of progress events.
 * Auth: per-job HMAC token. The pull path (events.jsonl) remains authoritative;
 * this just lowers latency and lets `finished` complete immediately.
 */

import { NextResponse } from "next/server";
import { requireBuildJobToken } from "@/lib/build/jobs/token";
import { ingestPushedBuildJobEvents } from "@/lib/build/jobs/runner";
import type { BuildJobEvent } from "@/lib/build/jobs/store";

export const runtime = "nodejs";
export const maxDuration = 300;

type RouteCtx = { params: Promise<{ jobId: string }> };

export async function POST(request: Request, ctx: RouteCtx) {
  const { jobId: rawJob } = await ctx.params;
  const jobId = rawJob?.trim();
  if (!jobId) return NextResponse.json({ error: "jobId required." }, { status: 400 });
  const claims = requireBuildJobToken(request, jobId);
  if (!claims) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  let body: { events?: BuildJobEvent[] } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const events = Array.isArray(body.events) ? body.events.slice(0, 200) : [];
  try {
    await ingestPushedBuildJobEvents(jobId, events);
  } catch (err) {
    console.warn("[cander:build-job] push ingest failed", err);
  }
  return NextResponse.json({ ok: true, received: events.length });
}
