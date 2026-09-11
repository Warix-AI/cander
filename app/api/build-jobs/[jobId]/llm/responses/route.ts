/**
 * POST /api/build-jobs/:jobId/llm/responses — path used by the OpenAI / Agents
 * SDK when the client baseURL is …/llm.
 */

import { proxyBuildJobOpenAI } from "../proxy";

export const runtime = "nodejs";
export const maxDuration = 800;

type RouteCtx = { params: Promise<{ jobId: string }> };

export async function POST(request: Request, ctx: RouteCtx) {
  const { jobId } = await ctx.params;
  return proxyBuildJobOpenAI(request, jobId, "responses");
}
