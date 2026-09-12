/**
 * GET /api/admin/summary — platform overview metrics (real columns only).
 */

import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/admin/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requirePlatformAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const admin = createSupabaseAdminClient();
  const now = new Date();
  const periodStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  ).toISOString();

  const [
    profilesRes,
    byPlanRes,
    activeSubsRes,
    enterpriseRes,
    periodsRes,
    orphansRes,
    failedRes,
  ] = await Promise.all([
    admin.from("profiles").select("id", { count: "exact", head: true }),
    admin.from("profiles").select("plan"),
    admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .in("subscription_status", ["active", "trialing"]),
    admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("plan", "enterprise"),
    admin
      .from("account_usage_periods")
      .select("included_minutes, profile_id", { count: "exact", head: true })
      .eq("period_start", periodStart),
    admin
      .from("ai_usage_events")
      .select("id", { count: "exact", head: true })
      .eq("status", "running")
      .lt(
        "started_at",
        new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      ),
    admin
      .from("ai_usage_events")
      .select("id", { count: "exact", head: true })
      .eq("status", "failed")
      .gte("started_at", periodStart),
  ]);

  const planCounts: Record<string, number> = {};
  for (const row of byPlanRes.data ?? []) {
    const p = String((row as { plan?: string }).plan ?? "free");
    planCounts[p] = (planCounts[p] ?? 0) + 1;
  }

  return NextResponse.json({
    ok: true,
    summary: {
      totalAccounts: profilesRes.count ?? 0,
      accountsByPlan: planCounts,
      activeSubscriptions: activeSubsRes.count ?? 0,
      enterpriseAccounts: enterpriseRes.count ?? 0,
      openPeriodsThisMonth: periodsRes.count ?? 0,
      orphanRunningEvents: orphansRes.count ?? 0,
      failedEventsThisMonth: failedRes.count ?? 0,
      notes: [
        "Usage periods are calendar-month snapshots, not Stripe subscription_period_end.",
        "Metrics use existing columns only; Polar is not connected.",
      ],
    },
  });
}
