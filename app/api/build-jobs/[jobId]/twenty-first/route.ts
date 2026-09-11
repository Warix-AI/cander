/**
 * POST /api/build-jobs/:jobId/twenty-first — 21st.dev MCP proxy for the sandbox
 * builder. API_KEY_21ST stays server-side. Auth: per-job HMAC token.
 * Body:
 *   { action: "search", query, limit, type? }  type = component|template|theme
 *   { action: "get", id, type? }
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

let clientPromise: Promise<TwentyFirstMcpClient | null> | null = null;
function client() {
  if (!clientPromise) clientPromise = createTwentyFirstMcpClient();
  return clientPromise;
}

function normalizeType(raw: unknown): "component" | "template" | "theme" {
  const t = String(raw ?? "").toLowerCase();
  if (t === "template" || t === "theme") return t;
  return "component";
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

  let body: {
    action?: string;
    query?: string;
    limit?: number;
    id?: string;
    type?: string;
  } = {};
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
      const type = normalizeType(body.type);
      const hits = await mcp.search({
        query: String(body.query ?? "").slice(0, 200),
        limit: Math.min(Math.max(Number(body.limit) || 5, 1), 5),
        type,
      });
      return NextResponse.json({
        ok: true,
        result: hits.map((h) => ({
          id: h.id,
          name: h.name,
          category: h.category,
          description: undefined,
          type,
        })),
      });
    }
    if (body.action === "get") {
      const c = await mcp.getComponent(String(body.id ?? ""));
      if (!c) return NextResponse.json({ ok: true, result: null });
      // Reconstruct files from codeSnippet when it contains // FILE: markers.
      const files = splitFileMarkers(c.codeSnippet ?? "");
      return NextResponse.json({
        ok: true,
        result: {
          id: c.id,
          name: c.name,
          code: c.codeSnippet ?? "",
          dependencies: c.dependencies ?? [],
          files,
          type: normalizeType(body.type || c.category),
        },
      });
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}

function splitFileMarkers(code: string): Array<{ path: string; content: string }> {
  if (!code.includes("// FILE:")) return [];
  const parts = code.split(/^\/\/ FILE:\s*/m).filter(Boolean);
  const files: Array<{ path: string; content: string }> = [];
  for (const part of parts) {
    const nl = part.indexOf("\n");
    if (nl < 0) continue;
    const path = part.slice(0, nl).trim().replace(/^\/+/, "");
    const content = part.slice(nl + 1);
    if (path && content.trim()) files.push({ path, content });
  }
  return files;
}
