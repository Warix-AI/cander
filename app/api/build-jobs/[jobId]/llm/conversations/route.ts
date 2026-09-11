/**
 * POST /api/build-jobs/:jobId/llm/conversations — creates a server-managed
 * OpenAI conversation for the job so the Agents SDK sends only per-turn deltas
 * instead of replaying the whole transcript on every model call.
 */

import { proxyBuildJobOpenAI } from "../proxy";

export const runtime = "nodejs";
export const maxDuration = 60;

type RouteCtx = { params: Promise<{ jobId: string }> };

export async function POST(request: Request, ctx: RouteCtx) {
  const { jobId } = await ctx.params;
  return proxyBuildJobOpenAI(request, jobId, "conversations");
}
