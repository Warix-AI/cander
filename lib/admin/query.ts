/**
 * Server-side read helpers for platform admin AI tools.
 * Same data surfaces as /api/admin/* — keep mutations out of chat.
 */

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { loadPricingPlans } from "@/lib/admin/pricing";
import { loadAiPlanMinuteConfigs } from "@/lib/usage/ai-minutes";
import { resolveBillingProviderDisplay } from "@/lib/billing-provider/types";

function periodStartIso(d = new Date()) {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1),
  ).toISOString();
}

export async function adminQueryOverview() {
  const admin = createSupabaseAdminClient();
  const periodStart = periodStartIso();
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
      .select("id", { count: "exact", head: true })
      .eq("period_start", periodStart),
    admin
      .from("ai_usage_events")
      .select("id", { count: "exact", head: true })
      .eq("status", "running")
      .lt("started_at", new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()),
    admin
      .from("ai_usage_events")
      .select("id", { count: "exact", head: true })
      .eq("status", "failed")
      .gte("started_at", periodStart),
  ]);

  const accountsByPlan: Record<string, number> = {};
  for (const row of byPlanRes.data ?? []) {
    const p = String((row as { plan?: string }).plan ?? "free");
    accountsByPlan[p] = (accountsByPlan[p] ?? 0) + 1;
  }

  return {
    totalAccounts: profilesRes.count ?? 0,
    accountsByPlan,
    activeSubscriptions: activeSubsRes.count ?? 0,
    enterpriseAccounts: enterpriseRes.count ?? 0,
    openPeriodsThisMonth: periodsRes.count ?? 0,
    orphanRunningEvents: orphansRes.count ?? 0,
    failedEventsThisMonth: failedRes.count ?? 0,
    notes: [
      "Usage periods are calendar months, not Stripe subscription_period_end.",
      "Polar is not connected; Stripe fields are read-only labels.",
    ],
  };
}

export async function adminQueryAccounts(opts: {
  q?: string;
  plan?: string;
  limit?: number;
}) {
  const admin = createSupabaseAdminClient();
  const limit = Math.min(Math.max(opts.limit ?? 25, 1), 50);
  let query = admin
    .from("profiles")
    .select(
      "id, email, name, plan, subscription_status, subscription_period_end, ai_minutes_override, ai_minutes_plan, is_platform_admin, created_at",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(0, limit - 1);

  const q = opts.q?.trim();
  if (q) query = query.or(`email.ilike.%${q}%,name.ilike.%${q}%`);
  if (opts.plan) query = query.eq("plan", opts.plan);

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);
  return { total: count ?? 0, accounts: data ?? [], limit };
}

export async function adminQueryAccount(idOrEmail: string) {
  const admin = createSupabaseAdminClient();
  const key = idOrEmail.trim();
  const looksUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      key,
    );
  let query = admin
    .from("profiles")
    .select(
      "id, email, name, plan, role, subscription_status, subscription_period_end, stripe_customer_id, stripe_subscription_id, ai_minutes_override, ai_minutes_plan, is_platform_admin, created_at, updated_at",
    )
    .limit(1);
  query = looksUuid ? query.eq("id", key) : query.ilike("email", key);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function adminQueryPlans() {
  const configs = await loadAiPlanMinuteConfigs({ force: true });
  return {
    plans: Object.values(configs),
    note: "included_minutes changes affect NEW billing periods only.",
  };
}

export async function adminQueryPricing() {
  const plans = await loadPricingPlans();
  return {
    plans,
    note: "Pricing is display/slider SoT; metering uses ai_plan_minute_configs.",
  };
}

export async function adminQuerySubscriptions(opts?: {
  status?: string;
  limit?: number;
}) {
  const admin = createSupabaseAdminClient();
  const limit = Math.min(Math.max(opts?.limit ?? 25, 1), 50);
  let query = admin
    .from("profiles")
    .select(
      "id, email, name, plan, subscription_status, subscription_period_end, stripe_customer_id, stripe_subscription_id, updated_at",
      { count: "exact" },
    )
    .neq("subscription_status", "none")
    .order("updated_at", { ascending: false })
    .range(0, limit - 1);
  if (opts?.status) query = query.eq("subscription_status", opts.status);
  const { data, error, count } = await query;
  if (error) throw new Error(error.message);
  return {
    total: count ?? 0,
    subscriptions: (data ?? []).map((row) => ({
      ...row,
      provider: resolveBillingProviderDisplay(row),
    })),
  };
}

export async function adminQueryEnterprise(limit = 25) {
  const admin = createSupabaseAdminClient();
  const { data, error, count } = await admin
    .from("profiles")
    .select(
      "id, email, name, plan, ai_minutes_override, ai_minutes_plan, subscription_status, created_at",
      { count: "exact" },
    )
    .eq("plan", "enterprise")
    .order("created_at", { ascending: false })
    .range(0, Math.min(limit, 50) - 1);
  if (error) throw new Error(error.message);
  return { total: count ?? 0, accounts: data ?? [] };
}

export async function adminQueryUsagePeriods(opts?: {
  profileId?: string;
  limit?: number;
}) {
  const admin = createSupabaseAdminClient();
  const limit = Math.min(Math.max(opts?.limit ?? 20, 1), 50);
  let query = admin
    .from("account_usage_periods")
    .select("*", { count: "exact" })
    .order("period_start", { ascending: false })
    .range(0, limit - 1);
  if (opts?.profileId) query = query.eq("profile_id", opts.profileId);
  const { data, error, count } = await query;
  if (error) throw new Error(error.message);
  return { total: count ?? 0, periods: data ?? [] };
}

export async function adminQueryUsageAggregates(opts?: {
  profileId?: string;
  limit?: number;
}) {
  const admin = createSupabaseAdminClient();
  const limit = Math.min(Math.max(opts?.limit ?? 20, 1), 50);
  let query = admin
    .from("ai_usage_period_aggregates")
    .select(
      "profile_id, period_id, period_start, included_minutes, used_minutes, used_billable_ms",
    )
    .order("used_minutes", { ascending: false })
    .limit(limit);
  if (opts?.profileId) query = query.eq("profile_id", opts.profileId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return { aggregates: data ?? [] };
}

export async function adminQueryUsageEvents(opts?: {
  profileId?: string;
  status?: string;
  limit?: number;
}) {
  const admin = createSupabaseAdminClient();
  const limit = Math.min(Math.max(opts?.limit ?? 25, 1), 50);
  let query = admin
    .from("ai_usage_events")
    .select(
      "id, user_id, feature, source, status, started_at, ended_at, billable_to_user",
    )
    .order("started_at", { ascending: false })
    .limit(limit);
  if (opts?.profileId) query = query.eq("user_id", opts.profileId);
  if (opts?.status) query = query.eq("status", opts.status);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return { events: data ?? [] };
}

export async function adminQueryAudit(limit = 25) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("admin_audit_log")
    .select(
      "id, actor_id, action, target_type, target_id, reason, metadata, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(Math.min(limit, 50));
  if (error) throw new Error(error.message);
  return { entries: data ?? [] };
}

export async function adminQueryOperations() {
  const admin = createSupabaseAdminClient();
  const staleBefore = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const [orphans, failed, overBudget] = await Promise.all([
    admin
      .from("ai_usage_events")
      .select("id, user_id, feature, source, started_at, status")
      .eq("status", "running")
      .lt("started_at", staleBefore)
      .order("started_at", { ascending: true })
      .limit(50),
    admin
      .from("ai_usage_events")
      .select("id, user_id, feature, source, started_at, status")
      .eq("status", "failed")
      .order("started_at", { ascending: false })
      .limit(30),
    admin
      .from("ai_usage_period_aggregates")
      .select(
        "profile_id, period_id, period_start, included_minutes, used_minutes, used_billable_ms",
      )
      .order("used_minutes", { ascending: false })
      .limit(50),
  ]);

  const overMinuteAccounts = (overBudget.data ?? []).filter((row) => {
    const included = Number(row.included_minutes ?? 0);
    const used = Number(row.used_minutes ?? 0);
    return included > 0 && used >= included;
  });

  return {
    orphanRunningEvents: orphans.data ?? [],
    recentFailedEvents: failed.data ?? [],
    overMinuteAccounts: overMinuteAccounts.slice(0, 25),
    notes: [
      "Ops actions (close orphans / rebuild aggregates) stay in the Operations panel for now.",
    ],
  };
}
