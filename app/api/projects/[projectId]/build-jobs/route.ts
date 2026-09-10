/**
 * POST /api/projects/:projectId/build-jobs  — start a V2 build job (create | edit)
 * GET  /api/projects/:projectId/build-jobs  — latest job for the project (synced)
 *
 * Website Builder V2: the builder agent runs inside the project sandbox; this
 * route only orchestrates. Sites and apps share it.
 */

import { NextResponse, after } from "next/server";
import { requireBearerUser } from "@/lib/ai/raw-openai/auth";
import { assertProjectAccess } from "@/lib/security/project-access";
import {
  createBuildJob,
  findActiveBuildJob,
  findLatestBuildJob,
  listBuildJobEvents,
  type BuildJobMode,
} from "@/lib/build/jobs/store";
import { startBuildJob, syncBuildJob } from "@/lib/build/jobs/runner";
import { loadWebsiteSetupBrief } from "@/lib/build/website-setup-brief-store";
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

  let body: {
    workspaceId?: string;
    mode?: BuildJobMode;
    instruction?: string;
    conversation?: string | null;
    threadId?: string | null;
    ackMessageId?: string | null;
  } = {};
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
  const mode: BuildJobMode = body.mode === "edit" ? "edit" : "create";
  const instruction = body.instruction?.trim() || "";
  if (mode === "edit" && !instruction) {
    return NextResponse.json({ error: "instruction required for edit jobs." }, { status: 400 });
  }

  const access = await assertProjectAccess({
    projectId,
    workspaceId,
    userId: auth.user.id,
  });
  if (!access.ok) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const active = await findActiveBuildJob({ projectId, workspaceId });
  let queueBehind: string | null = null;
  if (active) {
    // Nudge a sync so a finished job doesn't block the next one.
    const synced = active.status === "running" ? await syncBuildJob(active.id) : active;
    if (synced && ["queued", "running", "verifying"].includes(synced.status)) {
      if (mode === "create") {
        return NextResponse.json(
          { ok: false, error: "A build is already running for this project.", job: synced },
          { status: 409 },
        );
      }
      // Edits coalesce: queue behind the running job; started on completion.
      queueBehind = synced.id;
    }
  }

  const usage = await enforceUsageForRequest({
    request,
    feature: "sandbox_build",
    workspaceId,
    idempotencyKey: `build-job:${workspaceId}:${projectId}:${Date.now()}`,
    estimatedUnits: 1,
    provider: "vercel",
    allowCookieAuth: true,
    metadata: { projectId, mode },
  });
  if (!usage.ok) return usage.response;

  const brief = await loadWebsiteSetupBrief(projectId, workspaceId);
  const job = await createBuildJob({
    projectId,
    workspaceId,
    userId: auth.user.id,
    threadId: body.threadId ?? null,
    mode,
    title:
      mode === "create"
        ? instruction
          ? instruction.slice(0, 80)
          : "Draft website"
        : instruction.slice(0, 80),
    goal:
      mode === "create"
        ? instruction || "Build the full website from the setup brief"
        : instruction,
    instruction: instruction || undefined,
    conversation:
      typeof body.conversation === "string" && body.conversation.trim()
        ? body.conversation.trim().slice(0, 6000)
        : null,
    brief: brief?.answers ?? null,
    ackMessageId: body.ackMessageId ?? null,
  });

  if (queueBehind) {
    await finalizeUsageReservation({
      reservationId: usage.reservationId,
      status: "confirmed",
      actualUnits: 1,
    });
    return NextResponse.json(
      { ok: true, job, queued: true, behind: queueBehind },
      { status: 202 },
    );
  }

  // Starting a job (skeleton commit → GitHub, sandbox ensure, builder upload)
  // can take a minute or more. Respond now so the browser never sits on an
  // idle connection ("Failed to fetch"); do the start after the response.
  // startBuildJob marks the job failed itself if anything throws.
  const reservationId = usage.reservationId;
  after(async () => {
    try {
      await startBuildJob(job);
      await finalizeUsageReservation({
        reservationId,
        status: "confirmed",
        actualUnits: 1,
      });
    } catch (err) {
      console.warn(
        "[cander:build-job] start failed",
        job.id,
        err instanceof Error ? err.message : err,
      );
      await finalizeUsageReservation({ reservationId, status: "failed" }).catch(() => {});
    }
  });
  return NextResponse.json({ ok: true, job, starting: true });
}

export async function GET(request: Request, ctx: RouteCtx) {
  const auth = await requireBearerUser(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { projectId: rawId } = await ctx.params;
  const projectId = rawId?.trim();
  const url = new URL(request.url);
  const workspaceId = url.searchParams.get("workspaceId")?.trim();
  const afterSeq = Number(url.searchParams.get("after") || 0) || 0;
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

  let job =
    (await findActiveBuildJob({ projectId, workspaceId })) ??
    (await findLatestBuildJob({ projectId, workspaceId }));
  if (!job) return NextResponse.json({ ok: true, job: null, events: [] });
  if (job.status === "running") {
    job = (await syncBuildJob(job.id)) ?? job;
  }
  const events = await listBuildJobEvents({ jobId: job.id, afterSeq, limit: 300 });
  return NextResponse.json({ ok: true, job, events });
}
