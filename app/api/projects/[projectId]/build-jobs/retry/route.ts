/**
 * POST /api/projects/:projectId/build-jobs/retry
 *
 * Resume a failed website build. The server diagnoses why the previous job
 * failed and continues in the same sandbox from the last good phase (verify →
 * repair, or rebuild with the saved plan) instead of re-running the whole
 * pipeline or asking the user to troubleshoot infrastructure.
 */

import { NextResponse, after } from "next/server";
import { requireBearerUser } from "@/lib/ai/raw-openai/auth";
import { assertProjectAccess } from "@/lib/security/project-access";
import { retryBuildJob, startBuildJob } from "@/lib/build/jobs/runner";
import {
  enforceUsageForRequest,
  finalizeUsageReservation,
} from "@/lib/usage/server/guard-route";

export const runtime = "nodejs";
export const maxDuration = 300;

type RouteCtx = { params: Promise<{ projectId: string }> };

export async function POST(request: Request, ctx: RouteCtx) {
  const auth = await requireBearerUser(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { projectId: rawId } = await ctx.params;
  const projectId = rawId?.trim();

  let body: { workspaceId?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const workspaceId = body.workspaceId?.trim();
  if (!projectId || !workspaceId) {
    return NextResponse.json(
      { error: "projectId and workspaceId are required." },
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

  const usage = await enforceUsageForRequest({
    request,
    feature: "sandbox_build",
    workspaceId,
    idempotencyKey: `build-job-retry:${workspaceId}:${projectId}:${Date.now()}`,
    estimatedUnits: 1,
    provider: "vercel",
    allowCookieAuth: true,
    metadata: { projectId, mode: "create", retry: true },
  });
  if (!usage.ok) return usage.response;

  const result = await retryBuildJob({ projectId, workspaceId, userId: auth.user.id });
  if (!result.ok) {
    await finalizeUsageReservation({ reservationId: usage.reservationId, status: "failed" }).catch(
      () => {},
    );
    return NextResponse.json(
      { ok: false, error: result.error, job: result.job ?? null },
      { status: result.status },
    );
  }

  const reservationId = usage.reservationId;
  const job = result.job;
  after(async () => {
    try {
      await startBuildJob(job);
      await finalizeUsageReservation({ reservationId, status: "confirmed", actualUnits: 1 });
    } catch (err) {
      console.warn(
        "[cander:build-job] retry start failed",
        job.id,
        err instanceof Error ? err.message : err,
      );
      await finalizeUsageReservation({ reservationId, status: "failed" }).catch(() => {});
    }
  });
  return NextResponse.json({ ok: true, job, resume: result.resume, starting: true });
}
