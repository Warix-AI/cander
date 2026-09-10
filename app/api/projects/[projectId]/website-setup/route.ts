/**
 * GET/PATCH /api/projects/:id/website-setup
 * Guided website create brief (answers + status).
 * Client cannot set status=ready — only POST /build/ready after preview_check.
 */

import { NextResponse } from "next/server";
import { requireBearerUser } from "@/lib/ai/raw-openai/auth";
import { assertProjectAccess } from "@/lib/security/project-access";
import {
  countCompletedSetupSteps,
  emptyWebsiteSetupBrief,
  mergeAnswersIntoBrief,
  normalizeWebsiteSetupBrief,
  type WebsiteSetupStatus,
} from "@/lib/ai/build/website-setup-brief";
import {
  loadWebsiteSetupBrief,
  saveWebsiteSetupBrief,
} from "@/lib/build/website-setup-brief-store";
import { draftTipHasNextPackage } from "@/lib/build/git/draft-tip";
import {
  briefStatusFromBuildPhase,
  getProjectBuildPhase,
} from "@/lib/build/build-phase";

export const runtime = "nodejs";

type RouteCtx = { params: Promise<{ projectId: string }> };

export async function GET(request: Request, ctx: RouteCtx) {
  const auth = await requireBearerUser(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { projectId: rawId } = await ctx.params;
  const projectId = rawId?.trim();
  const workspaceId = new URL(request.url).searchParams
    .get("workspaceId")
    ?.trim();
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

  const brief = await loadWebsiteSetupBrief(projectId, workspaceId);
  const draftRunnable = await draftTipHasNextPackage({
    projectId,
    workspaceId,
  });
  const buildPhase = await getProjectBuildPhase({ projectId, workspaceId });

  // build_phase is source of truth when present.
  let gatedBrief = brief;
  if (buildPhase) {
    gatedBrief = {
      ...brief,
      status: briefStatusFromBuildPhase(buildPhase),
    };
  }
  // Never expose "ready" when tip cannot boot Next.
  if (gatedBrief.status === "ready" && !draftRunnable) {
    gatedBrief = { ...gatedBrief, status: "building" as const };
  }

  return NextResponse.json({
    ok: true,
    brief: gatedBrief,
    draftRunnable,
    buildPhase: buildPhase ?? null,
  });
}

export async function PATCH(request: Request, ctx: RouteCtx) {
  const auth = await requireBearerUser(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { projectId: rawId } = await ctx.params;
  const projectId = rawId?.trim();

  let body: {
    workspaceId?: string;
    answers?: Record<string, unknown>;
    status?: WebsiteSetupStatus;
    completedSteps?: number;
    init?: boolean;
    /** Full brief replace/merge from client build turns. */
    brief?: Record<string, unknown>;
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

  const access = await assertProjectAccess({
    projectId,
    workspaceId,
    userId: auth.user.id,
  });
  if (!access.ok) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  let brief = await loadWebsiteSetupBrief(projectId, workspaceId);
  if (body.brief && typeof body.brief === "object") {
    const incoming = { ...body.brief };
    // Client cannot promote to ready via brief merge.
    if (incoming.status === "ready") {
      incoming.status = "building";
    }
    brief = normalizeWebsiteSetupBrief({
      ...brief,
      ...incoming,
      answers: {
        ...(brief.answers ?? {}),
        ...((incoming.answers as Record<string, unknown> | undefined) ?? {}),
      },
    });
  }
  if (body.init && (!brief.answers || Object.keys(brief.answers).length === 0)) {
    brief = emptyWebsiteSetupBrief({ status: "setup" });
  }
  if (body.answers) {
    brief = mergeAnswersIntoBrief(brief, body.answers);
  }
  if (body.status) {
    let nextStatus = body.status;
    // Phase 3: client never sets ready — only /build/ready after preview_check.
    if (nextStatus === "ready") {
      nextStatus = "building";
    }
    brief = { ...brief, status: nextStatus };
  }
  if (typeof body.completedSteps === "number") {
    brief = {
      ...brief,
      completedSteps: Math.max(0, Math.min(8, body.completedSteps)),
    };
  } else {
    brief = {
      ...brief,
      completedSteps: countCompletedSetupSteps(brief.answers),
    };
  }

  // Never persist ready through this route.
  if (brief.status === "ready") {
    brief = { ...brief, status: "building" };
  }

  const saved = await saveWebsiteSetupBrief({
    projectId,
    workspaceId,
    brief: normalizeWebsiteSetupBrief(brief),
  });

  const buildPhase = await getProjectBuildPhase({ projectId, workspaceId });
  return NextResponse.json({
    ok: true,
    brief: saved,
    buildPhase: buildPhase ?? null,
  });
}
