/**
 * GET/POST/DELETE /api/projects/[projectId]/domains
 * Custom domain attach / status / detach (Phase 10).
 */

import { NextResponse } from "next/server";
import { requireBearerUser } from "@/lib/ai/raw-openai/auth";
import { assertProjectAccess } from "@/lib/security/project-access";
import {
  attachProjectCustomDomain,
  detachProjectCustomDomain,
  getProjectCustomDomain,
} from "@/lib/build/publish/custom-domain";
import {
  enforceUsageForRequest,
  finalizeUsageReservation,
} from "@/lib/usage/server/guard-route";

export const runtime = "nodejs";
export const maxDuration = 60;

type RouteCtx = { params: Promise<{ projectId: string }> };

async function authz(request: Request, projectId: string, workspaceId: string) {
  const auth = await requireBearerUser(request);
  if (!auth.ok) {
    return { ok: false as const, response: NextResponse.json({ error: auth.error }, { status: auth.status }) };
  }
  const access = await assertProjectAccess({
    projectId,
    workspaceId,
    userId: auth.user.id,
  });
  if (!access.ok) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Forbidden." }, { status: 403 }),
    };
  }
  return { ok: true as const, userId: auth.user.id };
}

export async function GET(request: Request, ctx: RouteCtx) {
  const { projectId: rawId } = await ctx.params;
  const projectId = rawId?.trim();
  const workspaceId = new URL(request.url).searchParams.get("workspaceId")?.trim();
  if (!projectId || !workspaceId) {
    return NextResponse.json(
      { error: "projectId and workspaceId are required." },
      { status: 400 },
    );
  }
  const gate = await authz(request, projectId, workspaceId);
  if (!gate.ok) return gate.response;

  try {
    const state = await getProjectCustomDomain({ projectId, workspaceId });
    return NextResponse.json({ ok: true, ...state });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request, ctx: RouteCtx) {
  const { projectId: rawId } = await ctx.params;
  const projectId = rawId?.trim();
  let body: { workspaceId?: string; domain?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const workspaceId = body.workspaceId?.trim();
  const domain = body.domain?.trim();
  if (!projectId || !workspaceId || !domain) {
    return NextResponse.json(
      { error: "projectId, workspaceId, and domain are required." },
      { status: 400 },
    );
  }
  const gate = await authz(request, projectId, workspaceId);
  if (!gate.ok) return gate.response;

  const usage = await enforceUsageForRequest({
    request,
    feature: "sandbox_deploy",
    workspaceId,
    idempotencyKey:
      request.headers.get("Idempotency-Key")?.trim() ||
      `domain-attach:${workspaceId}:${projectId}:${domain}`,
    estimatedUnits: 1,
    provider: "vercel",
    allowCookieAuth: true,
    metadata: { projectId, action: "domain_attach" },
  });
  if (!usage.ok) return usage.response;

  try {
    const state = await attachProjectCustomDomain({
      projectId,
      workspaceId,
      domain,
    });
    await finalizeUsageReservation({
      reservationId: usage.reservationId,
      status: "confirmed",
      actualUnits: 1,
    });
    return NextResponse.json({ ok: true, ...state });
  } catch (err) {
    await finalizeUsageReservation({
      reservationId: usage.reservationId,
      status: "failed",
    });
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}

export async function DELETE(request: Request, ctx: RouteCtx) {
  const { projectId: rawId } = await ctx.params;
  const projectId = rawId?.trim();
  const url = new URL(request.url);
  let workspaceId = url.searchParams.get("workspaceId")?.trim() || "";
  let domain = url.searchParams.get("domain")?.trim() || "";
  if (!workspaceId) {
    try {
      const body = (await request.json()) as {
        workspaceId?: string;
        domain?: string;
      };
      workspaceId = body.workspaceId?.trim() || "";
      domain = body.domain?.trim() || domain;
    } catch {
      /* query only */
    }
  }
  if (!projectId || !workspaceId) {
    return NextResponse.json(
      { error: "projectId and workspaceId are required." },
      { status: 400 },
    );
  }
  const gate = await authz(request, projectId, workspaceId);
  if (!gate.ok) return gate.response;

  try {
    const state = await detachProjectCustomDomain({
      projectId,
      workspaceId,
      domain: domain || undefined,
    });
    return NextResponse.json({ ok: true, ...state });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
