/**
 * POST /api/projects/[projectId]/preview-session
 * Mint a short-lived preview session for the draft host so the Build iframe
 * can run the user's site on its own origin (draft--{sub}.cander.app) with
 * working cookies, forms and client routing.
 */

import { NextResponse } from "next/server";
import { requireBearerUser } from "@/lib/ai/raw-openai/auth";
import { assertProjectAccess } from "@/lib/security/project-access";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { draftPreviewUrl } from "@/lib/build/preview/urls";
import {
  mintPreviewToken,
  previewSessionHandshakeUrl,
} from "@/lib/build/preview/preview-token";

export const runtime = "nodejs";

type RouteCtx = { params: Promise<{ projectId: string }> };

export async function POST(request: Request, ctx: RouteCtx) {
  const auth = await requireBearerUser(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { projectId: rawId } = await ctx.params;
  const projectId = rawId?.trim();
  let body: { workspaceId?: string; next?: string } = {};
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

  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("projects")
    .select("cander_subdomain")
    .eq("id", projectId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  const subdomain = data?.cander_subdomain ? String(data.cander_subdomain) : null;
  if (!subdomain) {
    return NextResponse.json({ ok: false, url: null, host: null });
  }

  const token = mintPreviewToken({ uid: auth.user.id, pid: projectId, ws: workspaceId });
  const draftOrigin = draftPreviewUrl(subdomain);
  return NextResponse.json({
    ok: true,
    host: new URL(draftOrigin).host,
    url: previewSessionHandshakeUrl({ draftOrigin, token, next: body.next || "/" }),
  });
}
