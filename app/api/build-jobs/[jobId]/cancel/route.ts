/**
 * POST /api/build-jobs/:jobId/cancel — stop a running or queued change.
 * Edits return to the saved draft; creates keep what was saved so far.
 */

import { NextResponse } from "next/server";
import { requireBearerUser } from "@/lib/ai/raw-openai/auth";
import { assertProjectAccess } from "@/lib/security/project-access";
import { getBuildJob } from "@/lib/build/jobs/store";
import { cancelBuildJob } from "@/lib/build/jobs/runner";

export const runtime = "nodejs";
export const maxDuration = 60;

type RouteCtx = { params: Promise<{ jobId: string }> };

export async function POST(request: Request, ctx: RouteCtx) {
  const auth = await requireBearerUser(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { jobId: raw } = await ctx.params;
  const jobId = raw?.trim();
  if (!jobId) return NextResponse.json({ error: "jobId is required." }, { status: 400 });

  const job = await getBuildJob(jobId);
  if (!job) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const access = await assertProjectAccess({ projectId: job.projectId, workspaceId: job.workspaceId, userId: auth.user.id });
  if (!access.ok) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const updated = await cancelBuildJob({ jobId, userId: auth.user.id });
  return NextResponse.json({ ok: true, status: updated?.status ?? "cancelled", message: "Stopped." });
}
