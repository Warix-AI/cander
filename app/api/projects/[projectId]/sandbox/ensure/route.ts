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

  const idempotencyKey =
    request.headers.get("Idempotency-Key")?.trim() ||
    `sandbox-ensure:${workspaceId}:${projectId}:${body.forceRestart ? "restart" : "reuse"}`;

  const usage = await enforceUsageForRequest({
    request,
    feature: "sandbox_runtime",
    workspaceId,
    idempotencyKey,
    estimatedUnits: 1,
    provider: "vercel",
    allowCookieAuth: true,
    metadata: { projectId, forceRestart: Boolean(body.forceRestart) },
  });
  if (!usage.ok) {
    return usage.response;
  }

  try {
    const result = await ensureProjectSandbox({
      userId: auth.user.id,
      projectId,
      workspaceId,
      forceRestart: Boolean(body.forceRestart),
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

    const httpStatus =
      result.status === "error"
        ? 503
        : result.status === "unavailable"
          ? 200
          : 200;

    return NextResponse.json({ ok: result.status !== "error", ...result }, {
      status: httpStatus,
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
