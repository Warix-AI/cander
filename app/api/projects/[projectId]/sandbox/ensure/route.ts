/**
 * POST /api/projects/[projectId]/sandbox/ensure
 * Start or resume the project's disposable build sandbox (clone from GitHub draft).
 */

import { NextResponse } from "next/server";
import { requireBearerUser } from "@/lib/ai/raw-openai/auth";
import { assertProjectAccess } from "@/lib/security/project-access";
import { ensureProjectSandbox } from "@/lib/build/sandbox/lifecycle";
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

  let body: { workspaceId?: string; forceRestart?: boolean } = {};
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

  const forceRestart = Boolean(body.forceRestart);
  // Stable key so overlapping ensure calls from the same project reuse the
  // in-flight reservation instead of tripping rate/concurrency limits.
  const idempotencyKey =
    request.headers.get("Idempotency-Key")?.trim() ||
    `sandbox-ensure:${workspaceId}:${projectId}:${forceRestart ? "restart" : "reuse"}`;

  const usage = await enforceUsageForRequest({
    request,
    feature: "sandbox_runtime",
    workspaceId,
    idempotencyKey,
    estimatedUnits: 1,
    provider: "vercel",
    allowCookieAuth: true,
    metadata: { projectId, forceRestart },
  });
  if (!usage.ok) {
    // Soft-fail so the UI stays on "starting" with Retry instead of a hard error.
    let detail = "Sandbox runtime is busy. Wait a few seconds, then Retry.";
    try {
      const cloned = usage.response.clone();
      const payload = (await cloned.json()) as { error?: string; message?: string };
      detail = payload.error || payload.message || detail;
    } catch {
      /* keep default */
    }
    return NextResponse.json(
      {
        ok: false,
        status: "starting",
        sessionId: null,
        subdomain: null,
        draftBranch: null,
        draftSha: null,
        githubFullName: null,
        hasPreviewUpstream: false,
        previewPath: null,
        message: detail,
        error: detail,
      },
      { status: 200 },
    );
  }

  try {
    const result = await ensureProjectSandbox({
      userId: auth.user.id,
      projectId,
      workspaceId,
      forceRestart,
    });

    await finalizeUsageReservation({
      reservationId: usage.reservationId,
      status:
        result.status === "ready" || result.status === "needs_repo"
          ? "confirmed"
          : result.status === "unavailable"
            ? "confirmed"
            : result.status === "error"
              ? "failed"
              : "confirmed",
      actualUnits: result.status === "ready" ? 1 : 0,
    });

    return NextResponse.json({ ok: result.status !== "error", ...result }, {
      status: 200,
    });
  } catch (err) {
    await finalizeUsageReservation({
      reservationId: usage.reservationId,
      status: "failed",
    });
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
