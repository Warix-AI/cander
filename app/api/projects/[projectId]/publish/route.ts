/**
 * POST /api/projects/[projectId]/publish
 * Promote draft tip → exactly one Vercel production deploy (API-only).
 */

import { NextResponse } from "next/server";
import { requireBearerUser } from "@/lib/ai/raw-openai/auth";
import { assertProjectAccess } from "@/lib/security/project-access";
import { publishProject } from "@/lib/build/publish/publish-project";
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

/**
 * GET /api/projects/[projectId]/publish?workspaceId=&verify=1
 * Publish status: draft vs live SHA ("draft ahead of live"), live URL, and an
 * optional fresh verification of the live site.
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
    customDomain: data?.custom_domain ? String(data.custom_domain) : null,
    customDomainStatus: data?.custom_domain_status ? String(data.custom_domain_status) : null,
    verification,
  });
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
  });

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

  try {
    const result = await publishProject({
      userId: auth.user.id,
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

    const httpStatus =
      result.status === "published"
        ? 200
        : result.status === "unavailable"
          ? 503
          : 502;

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

    return NextResponse.json(
      {
        ...result,
        url: result.publishedUrl,
        publishAttemptId: result.publishAttemptId || publishAttemptId,
        verification,
      },
      { status: httpStatus },
    );
  } catch (err) {
    await finalizeUsageReservation({
      reservationId: usage.reservationId,
      status: "failed",
    });
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, error: message, publishAttemptId },
      { status: 500 },
    );
  }
}
