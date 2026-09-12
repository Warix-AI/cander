/**
 * GET /api/admin/operations — reconciliation candidates.
 * POST — close orphans or rebuild aggregates (audited, idempotent where possible).
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

  const admin = createSupabaseAdminClient();
  const staleBefore = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

  const [orphans, failed, overBudget] = await Promise.all([
    admin
      .from("ai_usage_events")
      .select("id, user_id, feature, source, started_at, status")
      .eq("status", "running")
      .lt("started_at", staleBefore)
      .order("started_at", { ascending: true })
      .limit(100),
    admin
      .from("ai_usage_events")
      .select("id, user_id, feature, source, started_at, status, metadata")
      .eq("status", "failed")
      .order("started_at", { ascending: false })
      .limit(50),
    admin
      .from("ai_usage_period_aggregates")
      .select(
        "profile_id, period_id, period_start, included_minutes, used_minutes, used_billable_ms",
      )
      .order("used_minutes", { ascending: false })
      .limit(100),
  ]);

  const overMinuteAccounts = (overBudget.data ?? []).filter((row) => {
    const included = Number(row.included_minutes ?? 0);
    const used = Number(row.used_minutes ?? 0);
    return included > 0 && used > included;
  });

  return NextResponse.json({
    ok: true,
    orphans: orphans.data ?? [],
    failed: failed.data ?? [],
    overMinuteAccounts,
    notes: [
      "Close orphans via close_orphaned_ai_usage_events RPC.",
      "Rebuild aggregates via POST with action=rebuild_aggregate.",
      "Compare aggregate used_minutes vs merged billable events when investigating mismatches.",
    ],
    errors: {
      orphans: orphans.error?.message ?? null,
      failed: failed.error?.message ?? null,
      overBudget: overBudget.error?.message ?? null,
    },
  });
}

export async function POST(request: Request) {
  const auth = await requirePlatformAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: {
    action?: "close_orphans" | "rebuild_aggregate";
    maxAgeHours?: number;
    profileId?: string;
    plan?: string;
    reason?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();

  if (body.action === "close_orphans") {
    const maxAgeHours = Math.max(1, Number(body.maxAgeHours ?? 2));
    const olderThanMinutes = Math.max(5, Math.floor(maxAgeHours * 60));
    const { data, error } = await admin.rpc("close_orphaned_ai_usage_events", {
      p_older_than_minutes: olderThanMinutes,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    await writeAdminAudit({
      actorId: auth.user.id,
      action: "operations.close_orphans",
      targetType: "ai_usage_events",
      after: { closed: data, olderThanMinutes },
      reason: body.reason ?? null,
    });
    return NextResponse.json({ ok: true, closed: data });
  }

  if (body.action === "rebuild_aggregate") {
    if (!body.profileId) {
      return NextResponse.json({ error: "profileId required." }, { status: 400 });
    }
    const { data: profile } = await admin
      .from("profiles")
      .select("plan")
      .eq("id", body.profileId)
      .maybeSingle();
    const plan = normalizePlan(body.plan ?? profile?.plan) as BillingPlan;
    const snapshot = await refreshAIMinutesAggregate({
      profileId: body.profileId,
      plan,
    });
    await writeAdminAudit({
      actorId: auth.user.id,
      action: "operations.rebuild_aggregate",
      targetType: "profile",
      targetId: body.profileId,
      after: snapshot,
      reason: body.reason ?? null,
    });
    return NextResponse.json({ ok: true, snapshot });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
