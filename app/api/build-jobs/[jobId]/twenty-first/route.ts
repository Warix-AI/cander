/**
 * POST /api/build-jobs/:jobId/twenty-first — 21st.dev MCP proxy for the sandbox
 * builder. API_KEY_21ST stays server-side. Auth: per-job HMAC token.
 * Body: { action: "search", query, limit } | { action: "get", id }
 */

import { NextResponse } from "next/server";
import { requireBuildJobToken } from "@/lib/build/jobs/token";
import { getBuildJob } from "@/lib/build/jobs/store";
import {
  createTwentyFirstMcpClient,
  type TwentyFirstMcpClient,
} from "@/lib/ai/build/twenty-first-mcp";

export const runtime = "nodejs";
export const maxDuration = 120;

type RouteCtx = { params: Promise<{ jobId: string }> };

// One MCP client per warm instance; per-job caches live in the builder.
let clientPromise: Promise<TwentyFirstMcpClient | null> | null = null;
function client() {
  if (!clientPromise) clientPromise = createTwentyFirstMcpClient();
  return clientPromise;
}

export async function POST(request: Request, ctx: RouteCtx) {
  const { jobId: rawJob } = await ctx.params;
  const jobId = rawJob?.trim();
  if (!jobId) return NextResponse.json({ error: "jobId required." }, { status: 400 });
  const claims = requireBuildJobToken(request, jobId);
  if (!claims) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const job = await getBuildJob(jobId);
  if (!job || !["running", "verifying"].includes(job.status)) {
    return NextResponse.json({ error: "Job is not running." }, { status: 409 });
  }

  let body: { action?: string; query?: string; limit?: number; id?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const mcp = await client();
  if (!mcp) {
    return NextResponse.json({ ok: false, error: "21st.dev not configured." }, { status: 503 });
  }

  try {
    if (body.action === "search") {
      const hits = await mcp.search({
        query: String(body.query ?? "").slice(0, 200),
        limit: Math.min(Math.max(Number(body.limit) || 5, 1), 5),
      });
      return NextResponse.json({
        ok: true,
        result: hits.map((h) => ({
          id: h.id,
          name: h.name,
          category: h.category,
        })),
      });
    }
    if (body.action === "get") {
      const c = await mcp.getComponent(String(body.id ?? ""));
      return NextResponse.json({
        ok: true,
        result: c
          ? {
              id: c.id,
              name: c.name,
              code: c.codeSnippet ?? "",
              dependencies: c.dependencies ?? [],
            }
          : null,
      });
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
