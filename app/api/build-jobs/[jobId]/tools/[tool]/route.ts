/**
 * POST /api/build-jobs/:jobId/tools/:tool — provider tools for the in-sandbox
 * agent, authorized by the per-job token. The sandbox never holds provider
 * credentials; every tool resolves project/session/provider ids from the job
 * and project records (never from the request body) and runs server-side.
 *
 * Tools:
 *   git.checkpoint   { message? }  → commit the sandbox state to the draft branch
 *   project.status   {}            → plain-English project state (ProjectRuntime)
 *   db.status        {}            → backend status for this project
 *
 * Phase 4 adds db.schema / db.sql / db.migration; Phase 3 adds deploy.status.
 */

import { NextResponse } from "next/server";
import { requireBuildJobToken } from "@/lib/build/jobs/token";
import { getBuildJob } from "@/lib/build/jobs/store";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { renderProjectRuntimeForAgent, resolveProjectRuntime } from "@/lib/build/project-runtime";

export const runtime = "nodejs";
export const maxDuration = 300;

type RouteCtx = { params: Promise<{ jobId: string; tool: string }> };

const TOOLS = new Set(["git.checkpoint", "project.status", "db.status"]);

function text(output: string, status = 200) {
  return NextResponse.json({ ok: status < 400, output }, { status });
}

export async function POST(request: Request, ctx: RouteCtx) {
  const { jobId: rawJob, tool: rawTool } = await ctx.params;
  const jobId = rawJob?.trim();
  const tool = rawTool?.trim();
  if (!jobId || !tool) return text("jobId and tool required.", 400);
  if (!TOOLS.has(tool)) return text(`Unknown tool: ${tool}`, 404);

  const claims = requireBuildJobToken(request, jobId);
  if (!claims) return text("Unauthorized.", 401);

  const job = await getBuildJob(jobId);
  if (!job || !["running", "verifying"].includes(job.status)) return text("Job is not running.", 409);
  // Defense in depth: the token's scope must match the job it names.
  if (job.projectId !== claims.projectId || job.workspaceId !== claims.workspaceId) return text("Forbidden.", 403);

  let args: Record<string, unknown> = {};
  try {
    const raw = await request.text();
    if (raw.trim()) args = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return text("Invalid JSON.", 400);
  }

  const scope = { projectId: job.projectId, workspaceId: job.workspaceId };

  try {
    switch (tool) {
      case "project.status": {
        const rt = await resolveProjectRuntime(scope);
        return text(renderProjectRuntimeForAgent(rt));
      }
      case "db.status": {
        const rt = await resolveProjectRuntime({ ...scope, light: true });
        const status = rt.backend.status;
        return text(
          status === "ready"
            ? "Database connected. Client env: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY (already in .env.local). Server-only keys are never available in the browser."
            : status === "skipped"
              ? "This project has no database (static website)."
              : status === "creating"
                ? "Database is being provisioned; keep the app working with demo data until env vars appear."
                : "No database connected yet. Build with a demo-data fallback; Cander connects the database when the app is published or on request.",
        );
      }
      case "git.checkpoint": {
        const userId = job.facts.userId;
        if (!userId) return text("Job has no owner.", 409);
        const admin = createSupabaseAdminClient();
        const { data } = await admin
          .from("projects")
          .select("sandbox_session_id")
          .eq("id", job.projectId)
          .eq("workspace_id", job.workspaceId)
          .maybeSingle();
        const sessionId = data?.sandbox_session_id ? String(data.sandbox_session_id) : null;
        if (!sessionId) return text("No sandbox session for this project.", 409);
        const message = `Cander checkpoint: ${String(args.message ?? job.facts.instruction ?? "work in progress").slice(0, 72)}`;
        const { persistSandboxToDraft } = await import("@/lib/build/sandbox/persist");
        const persisted = await persistSandboxToDraft({ sessionId, userId, ...scope, message });
        if (persisted.outcome === "noop") return text("Nothing new to save — the draft already has these changes.");
        if (persisted.outcome === "db_sync_failed") return text(`Saved, but the record did not update: ${persisted.error || "unknown"}`, 500);
        return text(`Saved a checkpoint of your work${persisted.draftSha ? ` (${persisted.draftSha.slice(0, 7)})` : ""}.`);
      }
      default:
        return text(`Unknown tool: ${tool}`, 404);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[cander:job-tools] failed", { jobId, tool, error: msg.slice(0, 300) });
    return text(`Tool failed: ${msg.slice(0, 300)}`, 500);
  }
}
