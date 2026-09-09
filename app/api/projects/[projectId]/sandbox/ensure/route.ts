import { NextResponse } from "next/server";
import { requireBearerUser } from "@/lib/ai/raw-openai/auth";
import { assertProjectAccess } from "@/lib/security/project-access";
import { ensureProjectSandbox } from "@/lib/build/sandbox/lifecycle";
import { coalesceEnsureProjectSandbox } from "@/lib/build/sandbox/ensure-coalesce";
import { BUILD_RETRY_BUDGETS } from "@/lib/ai/build/retry-budgets";
import {
  enforceUsageForRequest,
  finalizeUsageReservation,
} from "@/lib/usage/server/guard-route";

export const runtime = "nodejs";
export const maxDuration = 300;

type RouteCtx = { params: Promise<{ projectId: string }> };

/** Per-project forceRestart budget within a short window (process-local). */
const restartBudgetKey = "__cander_sandbox_restart_budget__";
function restartBudgetStore(): Map<string, { count: number; resetAt: number }> {
  const g = globalThis as typeof globalThis & {
    [restartBudgetKey]?: Map<string, { count: number; resetAt: number }>;
  };
  if (!g[restartBudgetKey]) g[restartBudgetKey] = new Map();
  return g[restartBudgetKey]!;
}

function takeForceRestartSlot(projectId: string, workspaceId: string): boolean {
  const k = `${workspaceId}:${projectId}`;
  const map = restartBudgetStore();
  const now = Date.now();
  const row = map.get(k);
  if (!row || now > row.resetAt) {
    map.set(k, {
      count: 1,
      resetAt: now + 15 * 60_000,
    });
    return true;
  }
  if (row.count >= BUILD_RETRY_BUDGETS.sandboxForceRestart) {
    return false;
  }
  row.count += 1;
  return true;
}

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

  let forceRestart = Boolean(body.forceRestart);
  if (forceRestart && !takeForceRestartSlot(projectId, workspaceId)) {
    // Budget exhausted — resume/reuse instead of spawning another VM.
    forceRestart = false;
  }

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
      const payload = (await cloned.json()) as {
        error?: string;
        message?: string;
      };
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
    const result = await coalesceEnsureProjectSandbox({
      projectId,
      workspaceId,
      forceRestart,
      run: () =>
        ensureProjectSandbox({
          userId: auth.user.id,
          projectId,
          workspaceId,
          forceRestart,
        }),
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
