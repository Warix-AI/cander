/**
 * GET/PATCH /api/projects/:id/website-setup
 * Guided website create brief (answers + status).
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
  // Never expose "ready" to clients when the tip cannot boot Next.
  const gatedBrief =
    brief.status === "ready" && !draftRunnable
      ? { ...brief, status: "building" as const }
      : brief;
  return NextResponse.json({
    ok: true,
    brief: gatedBrief,
    draftRunnable,
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
    brief = normalizeWebsiteSetupBrief({
      ...brief,
      ...body.brief,
      answers: {
        ...(brief.answers ?? {}),
        ...((body.brief.answers as Record<string, unknown> | undefined) ?? {}),
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
    // Fail closed: do not persist ready without a runnable Next tip.
    if (nextStatus === "ready") {
      const draftRunnable = await draftTipHasNextPackage({
        projectId,
        workspaceId,
      });
      if (!draftRunnable) {
        nextStatus = "building";
      }
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

  const saved = await saveWebsiteSetupBrief({
    projectId,
    workspaceId,
    brief: normalizeWebsiteSetupBrief(brief),
  });
  return NextResponse.json({ ok: true, brief: saved });
}
