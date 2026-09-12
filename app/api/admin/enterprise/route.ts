/**
 * GET /api/admin/enterprise — enterprise roster.
 * PATCH — assign plan / metering plan notes (audited).
 */

import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/admin/auth";
import { writeAdminAudit } from "@/lib/admin/audit";
import { applyAccountOverride } from "@/lib/admin/overrides";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { normalizePlan } from "@/lib/plans";
import type { BillingPlan } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requirePlatformAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select(
      "id, email, name, plan, ai_minutes_override, ai_minutes_plan, subscription_status, created_at, updated_at",
    )
    .or("plan.eq.enterprise,ai_minutes_plan.eq.enterprise")
    .order("updated_at", { ascending: false })
    .limit(200);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, accounts: data ?? [] });
}

export async function PATCH(request: Request) {
  const auth = await requirePlatformAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: {
    profileId?: string;
    plan?: string;
    aiMinutesPlan?: string | null;
    aiMinutesOverride?: number | null;
    reason?: string;
    budgetNotes?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  if (!body.profileId) {
    return NextResponse.json({ error: "profileId required." }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data: before } = await admin
    .from("profiles")
    .select("id, plan, ai_minutes_override, ai_minutes_plan")
    .eq("id", body.profileId)
    .maybeSingle();

  if (!before) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  if (body.plan) {
    const plan = normalizePlan(body.plan) as BillingPlan;
    const { error } = await admin
      .from("profiles")
      .update({ plan })
      .eq("id", body.profileId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    await writeAdminAudit({
      actorId: auth.user.id,
      action: "enterprise.assign_plan",
      targetType: "profile",
      targetId: body.profileId,
      before,
      after: { ...before, plan },
      reason: body.reason ?? body.budgetNotes ?? null,
    });
  }

  if (
    body.aiMinutesPlan !== undefined ||
    body.aiMinutesOverride !== undefined
  ) {
    await applyAccountOverride({
      profileId: body.profileId,
      actorId: auth.user.id,
      aiMinutesPlan:
        body.aiMinutesPlan === undefined
          ? undefined
          : body.aiMinutesPlan === null
            ? null
            : (normalizePlan(body.aiMinutesPlan) as BillingPlan),
      aiMinutesOverride: body.aiMinutesOverride,
      reason: body.reason ?? body.budgetNotes ?? null,
      metadata: body.budgetNotes ? { budgetNotes: body.budgetNotes } : {},
    });
  }

  const { data: after } = await admin
    .from("profiles")
    .select(
      "id, email, name, plan, ai_minutes_override, ai_minutes_plan, subscription_status",
    )
    .eq("id", body.profileId)
    .maybeSingle();

  return NextResponse.json({
    ok: true,
    account: after,
    note: "Open period snapshots unchanged by default.",
  });
}
