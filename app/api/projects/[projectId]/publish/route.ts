/**
 * POST /api/projects/[projectId]/publish
 * Promote draft tip → exactly one Vercel production deploy (API-only).
 *
 * The publish itself runs after the response (`after()`), tracked by a durable
 * publish_attempts row with a heartbeat. Clients poll GET for the user state
 * (publishing → live | needs_fix | needs_retry). Nothing provider-specific
 * ever leaves this route: raw errors live in publish_attempts.error and logs.
 */

import { NextResponse } from "next/server";
import { after } from "next/server";
import { requireBearerUser } from "@/lib/ai/raw-openai/auth";
import { assertProjectAccess } from "@/lib/security/project-access";
import { publishProject } from "@/lib/build/publish/publish-project";
import {
  beginPublishAttempt,
  findLatestPublishAttempt,
  findPublishAttemptById,
  isPublishAttemptStale,
  updatePublishAttempt,
  type PublishAttemptRow,
} from "@/lib/build/publish/attempts";
import {
  PUBLISH_STATE_COPY,
  publishUserStateFromAttempt,
  type PublishUserState,
} from "@/lib/build/publish/user-copy";
import {
  enforceUsageForRequest,
  finalizeUsageReservation,
} from "@/lib/usage/server/guard-route";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 800;

type RouteCtx = { params: Promise<{ projectId: string }> };

type Body = {
  workspaceId?: string;
  url?: string | null;
  slug?: string | null;
};

export type PublishAttemptPublic = {
  publishAttemptId: string;
  state: PublishUserState;
  message: string;
  draftSha: string;
  publishedUrl: string | null;
  startedAt: string;
  completedAt: string | null;
};

function attemptPublic(row: PublishAttemptRow): PublishAttemptPublic {
  const stale = isPublishAttemptStale(row);
  const state = publishUserStateFromAttempt({ status: row.status, meta: row.meta, stale });
  return {
    publishAttemptId: row.publish_attempt_id,
    state,
    message: PUBLISH_STATE_COPY[state],
    draftSha: row.draft_sha,
    publishedUrl: state === "live" ? row.published_url : null,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}

/**
 * GET /api/projects/[projectId]/publish?workspaceId=&verify=1&attempt=
 * Publish status: draft vs live SHA ("draft ahead of live"), live URL, the
 * latest (or requested) attempt's user state, and optional live verification.
 */
export async function GET(request: Request, ctx: RouteCtx) {
  const auth = await requireBearerUser(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { projectId: rawId } = await ctx.params;
  const projectId = rawId?.trim();
  const url = new URL(request.url);
  const workspaceId = url.searchParams.get("workspaceId")?.trim();
  const verify = url.searchParams.get("verify") === "1";
  const attemptId = url.searchParams.get("attempt")?.trim() || null;
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

  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("projects")
    .select("draft_sha, published_sha, published_url, custom_domain, custom_domain_status, updated_at")
    .eq("id", projectId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  const draftSha = data?.draft_sha ? String(data.draft_sha).toLowerCase() : null;
  const publishedSha = data?.published_sha ? String(data.published_sha).toLowerCase() : null;
  const publishedUrl = data?.published_url ? String(data.published_url) : null;
  const aheadOfLive = Boolean(draftSha && publishedSha && draftSha !== publishedSha);

  const attemptRow = attemptId
    ? await findPublishAttemptById(attemptId)
    : await findLatestPublishAttempt(projectId);
  const attempt =
    attemptRow && attemptRow.project_id === projectId ? attemptPublic(attemptRow) : null;

  let verification = null;
  if (verify && publishedUrl) {
    try {
      const { verifyLiveSite } = await import("@/lib/build/publish/verify-live");
      verification = await verifyLiveSite(publishedUrl);
    } catch {
      verification = null;
    }
  }

  return NextResponse.json({
    ok: true,
    draftSha,
    publishedSha,
    publishedUrl,
    published: Boolean(publishedSha && publishedUrl),
    aheadOfLive,
    publishing: attempt?.state === "publishing",
    attempt,
    customDomain: data?.custom_domain ? String(data.custom_domain) : null,
    customDomainStatus: data?.custom_domain_status ? String(data.custom_domain_status) : null,
    verification,
  });
}

/** Make sure a failed publish always leaves a row the UI can read. */
async function recordEarlyFailure(opts: {
  workspaceId: string;
  projectId: string;
  publishAttemptId: string;
  draftSha: string;
  userId: string;
  message: string;
}) {
  try {
    if (await findPublishAttemptById(opts.publishAttemptId)) return;
    const reason = /Another build is already in progress/i.test(opts.message)
      ? "build_in_progress"
      : "early_failure";
    await beginPublishAttempt({
      workspaceId: opts.workspaceId,
      projectId: opts.projectId,
      publishAttemptId: opts.publishAttemptId,
      draftSha: opts.draftSha === "unknown" ? `unknown-${opts.publishAttemptId.slice(0, 8)}` : opts.draftSha,
      meta: { userId: opts.userId, reason },
    });
    await updatePublishAttempt({
      publishAttemptId: opts.publishAttemptId,
      projectId: opts.projectId,
      patch: {
        status: "failed",
        error: opts.message.slice(0, 4000),
        completed_at: new Date().toISOString(),
        meta: { userId: opts.userId, reason, draftNeedsRepair: false },
      },
    });
  } catch (err) {
    console.warn("[cander:publish] recordEarlyFailure", err instanceof Error ? err.message : err);
  }
}

export async function POST(request: Request, ctx: RouteCtx) {
  const auth = await requireBearerUser(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { projectId: rawId } = await ctx.params;
  const projectId = rawId?.trim();

  let body: Body = {};
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

  const publishAttemptId =
    request.headers.get("X-Cander-Publish-Attempt-Id")?.trim() ||
    crypto.randomUUID();
  const sync = request.headers.get("X-Cander-Publish-Sync") === "1";

  // Resolve server draft tip for durable idempotency (ignore client "tip").
  const admin = createSupabaseAdminClient();
  const { data: tipRow } = await admin
    .from("projects")
    .select("draft_sha")
    .eq("id", projectId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  const draftSha =
    tipRow?.draft_sha
      ? String(tipRow.draft_sha).toLowerCase()
      : request.headers.get("X-Cander-Draft-Sha")?.trim().toLowerCase() ||
        "unknown";

  const idempotencyKey =
    request.headers.get("Idempotency-Key")?.trim() ||
    `publish:${projectId}:${draftSha}`;

  console.info("[cander:publish]", {
    publishAttemptId,
    stage: "client_request",
    projectId,
    workspaceId,
    draftSha: draftSha.slice(0, 12),
    idempotencyKey,
    sync,
  });

  // Debounce: an in-flight, healthy attempt for this project is *the* publish.
  const latest = await findLatestPublishAttempt(projectId);
  if (latest && publishUserStateFromAttempt({ status: latest.status, meta: latest.meta, stale: isPublishAttemptStale(latest) }) === "publishing") {
    const pub = attemptPublic(latest);
    return NextResponse.json(
      { ok: true, status: "publishing", ...pub, url: null },
      { status: 202 },
    );
  }

  const usage = await enforceUsageForRequest({
    request,
    feature: "sandbox_deploy",
    workspaceId,
    idempotencyKey,
    estimatedUnits: 1,
    provider: "vercel",
    allowCookieAuth: true,
    metadata: {
      projectId,
      action: "publish",
      publishAttemptId,
      draftSha,
    },
  });
  if (!usage.ok) {
    return usage.response;
  }

  const userId = auth.user.id;
  const run = async () => {
    try {
      const result = await publishProject({
        userId,
        projectId,
        workspaceId,
        preferredUrl: body.url ?? null,
        slug: body.slug ?? null,
        publishAttemptId,
      });
      await finalizeUsageReservation({
        reservationId: usage.reservationId,
        status: result.ok ? "confirmed" : "failed",
        actualUnits: result.ok ? 1 : 0,
      });
      if (!result.ok) {
        await recordEarlyFailure({
          workspaceId,
          projectId,
          publishAttemptId,
          draftSha,
          userId,
          message: result.message || "Publish failed.",
        });
      }
      // Post-publish verification (SEO / crawlability). Best-effort; the deploy
      // is already live even if a check fails.
      let verification = null;
      if (result.ok && result.publishedUrl) {
        try {
          const { verifyLiveSite } = await import("@/lib/build/publish/verify-live");
          verification = await verifyLiveSite(result.publishedUrl);
          console.info("[cander:publish] verified", {
            publishAttemptId,
            ok: verification.ok,
            failed: verification.checks.filter((c) => !c.ok).map((c) => c.id),
          });
        } catch (err) {
          console.warn("[cander:publish] verify failed", err);
        }
      }
      return { result, verification };
    } catch (err) {
      await finalizeUsageReservation({
        reservationId: usage.reservationId,
        status: "failed",
      });
      const message = err instanceof Error ? err.message : String(err);
      console.error("[cander:publish] unhandled", { publishAttemptId, message });
      await recordEarlyFailure({
        workspaceId,
        projectId,
        publishAttemptId,
        draftSha,
        userId,
        message,
      });
      return { result: null, verification: null, error: message };
    }
  };

  if (sync) {
    // Scripts / tests: wait for the outcome. User-facing copy only.
    const { result, verification } = await run();
    const row = await findPublishAttemptById(publishAttemptId);
    const pub = row ? attemptPublic(row) : null;
    const state: PublishUserState = pub?.state ?? (result?.ok ? "live" : "needs_retry");
    return NextResponse.json(
      {
        ok: state === "live",
        status: state === "live" ? "published" : "error",
        state,
        message: PUBLISH_STATE_COPY[state],
        url: result?.publishedUrl ?? pub?.publishedUrl ?? null,
        publishedSha: result?.publishedSha ?? null,
        publishAttemptId: result?.publishAttemptId || publishAttemptId,
        gitSyncRepairNeeded: result?.gitSyncRepairNeeded ?? false,
        verification,
      },
      { status: state === "live" ? 200 : 502 },
    );
  }

  after(run);

  return NextResponse.json(
    {
      ok: true,
      status: "publishing",
      state: "publishing" as PublishUserState,
      message: PUBLISH_STATE_COPY.publishing,
      publishAttemptId,
      draftSha,
      url: null,
    },
    { status: 202 },
  );
}
