/**
 * GET /api/admin/usage/aggregates
 * POST — rebuild aggregate for a profile/period (audited).
 */

import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/admin/auth";
import { writeAdminAudit } from "@/lib/admin/audit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { refreshAIMinutesAggregate } from "@/lib/usage/ai-minutes";
import { normalizePlan } from "@/lib/plans";
import type { BillingPlan } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requirePlatformAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const url = new URL(request.url);
  const profileId = url.searchParams.get("profileId");
  const periodId = url.searchParams.get("periodId");
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);

  const admin = createSupabaseAdminClient();
  let query = admin
    .from("ai_usage_period_aggregates")
    .select("*")
    .order("period_start", { ascending: false })
    .limit(limit);
  if (profileId) query = query.eq("profile_id", profileId);
  if (periodId) query = query.eq("period_id", periodId);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, aggregates: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requirePlatformAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: { profileId?: string; plan?: string; reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  if (!body.profileId) {
    return NextResponse.json({ error: "profileId required." }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("plan")
    .eq("id", body.profileId)
    .maybeSingle();
  const plan = normalizePlan(body.plan ?? profile?.plan) as BillingPlan;

  try {
    const snapshot = await refreshAIMinutesAggregate({
      profileId: body.profileId,
      plan,
    });
    await writeAdminAudit({
      actorId: auth.user.id,
      action: "usage.aggregate_rebuild",
      targetType: "profile",
      targetId: body.profileId,
      after: snapshot,
      reason: body.reason ?? null,
    });
    return NextResponse.json({ ok: true, snapshot });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Rebuild failed." },
      { status: 500 },
    );
  }
}
