/**
 * GET /api/projects/:projectId/build-jobs/:jobId?workspaceId=&after=
 * Poll one job: syncs the sandbox event log, returns job + new events.
 */

import { NextResponse } from "next/server";
import { requireBearerUser } from "@/lib/ai/raw-openai/auth";
import { assertProjectAccess } from "@/lib/security/project-access";
import { getBuildJob, listBuildJobEvents } from "@/lib/build/jobs/store";
import { syncBuildJob } from "@/lib/build/jobs/runner";

export const runtime = "nodejs";
export const maxDuration = 300;

type RouteCtx = { params: Promise<{ projectId: string; jobId: string }> };

export async function GET(request: Request, ctx: RouteCtx) {
  const auth = await requireBearerUser(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { projectId: rawId, jobId: rawJob } = await ctx.params;
  const projectId = rawId?.trim();
  const jobId = rawJob?.trim();
  const url = new URL(request.url);
  const workspaceId = url.searchParams.get("workspaceId")?.trim();
  const afterSeq = Number(url.searchParams.get("after") || 0) || 0;
  if (!projectId || !workspaceId || !jobId) {
    return NextResponse.json(
      { error: "projectId, jobId and workspaceId are required." },
      { status: 400 },
    );
  }
  const access = await assertProjectAccess({
    projectId,
    workspaceId,
    userId: auth.user.id,
  });
  if (!access.ok) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  let job = await getBuildJob(jobId);
  if (!job || job.projectId !== projectId || job.workspaceId !== workspaceId) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }
  if (job.status === "running") {
    job = (await syncBuildJob(job.id)) ?? job;
  }
  const events = await listBuildJobEvents({ jobId: job.id, afterSeq, limit: 300 });
  return NextResponse.json({ ok: true, job, events });
}
