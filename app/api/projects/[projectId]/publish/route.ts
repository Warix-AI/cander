/**
 * POST /api/projects/[projectId]/publish
 * Promote draft tip → Vercel production deploy (Warix-managed).
 */

import { NextResponse } from "next/server";
import { requireBearerUser } from "@/lib/ai/raw-openai/auth";
import { assertProjectAccess } from "@/lib/security/project-access";
import { publishProject } from "@/lib/build/publish/publish-project";
import {
  enforceUsageForRequest,
  finalizeUsageReservation,
} from "@/lib/usage/server/guard-route";

export const runtime = "nodejs";
export const maxDuration = 300;

type RouteCtx = { params: Promise<{ projectId: string }> };

type Body = {
  workspaceId?: string;
  url?: string | null;
  slug?: string | null;
};

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

  const draftShaHint =
    request.headers.get("X-Cander-Draft-Sha")?.trim().slice(0, 40) || "tip";
  const idempotencyKey =
    request.headers.get("Idempotency-Key")?.trim() ||
    `publish:${workspaceId}:${projectId}:${draftShaHint}`;

  const usage = await enforceUsageForRequest({
    request,
    feature: "sandbox_deploy",
    workspaceId,
    idempotencyKey,
    estimatedUnits: 1,
    provider: "vercel",
    allowCookieAuth: true,
    metadata: { projectId, action: "publish" },
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

    return NextResponse.json(
      {
        ...result,
        url: result.publishedUrl,
      },
      { status: httpStatus },
    );
  } catch (err) {
    await finalizeUsageReservation({
      reservationId: usage.reservationId,
      status: "failed",
    });
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
