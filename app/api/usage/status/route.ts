import { NextResponse } from "next/server";
import { requireBearerUser } from "@/lib/ai/raw-openai/auth";
import { buildUsageStatusSnapshot } from "@/lib/usage/enforce";
import { resolveUsageContext } from "@/lib/usage/server/context";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireBearerUser(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const url = new URL(request.url);
  const workspaceId = url.searchParams.get("workspaceId");

  const ctx = await resolveUsageContext({
    user: auth.user,
    workspaceId,
  });
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  try {
    createSupabaseAdminClient();
  } catch {
    return NextResponse.json(
      {
        error: "Usage tracking is not configured on this deployment.",
      },
      { status: 503 },
    );
  }

  const snapshot = await buildUsageStatusSnapshot({
    plan: ctx.plan,
    workspaceId: ctx.workspaceId,
    profileId: ctx.user.id,
  });

  return NextResponse.json({ ok: true, usage: snapshot });
}
