/**
 * Account-level monthly usable-dollar periods (shared across workspaces).
 */

import type { BillingPlan } from "../types.ts";
import { planUsagePolicy } from "./plan-config.ts";
import { createSupabaseAdminClient } from "../supabase/admin.ts";
import { windowStartIso } from "./window.ts";

export type AccountUsagePeriod = {
  id: string;
  profileId: string;
  plan: BillingPlan;
  periodStart: string;
  periodEnd: string;
  billAmountMicros: number;
  usableBudgetMicros: number;
  spentMicros: number;
  reservedMicros: number;
  status: "open" | "exhausted" | "closed";
};

function periodEndFromStart(periodStartIso: string): string {
  const start = new Date(periodStartIso);
  const end = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1),
  );
  return end.toISOString();
}

function mapPeriod(row: Record<string, unknown>): AccountUsagePeriod {
  return {
    id: String(row.id),
    profileId: String(row.profile_id),
    plan: row.plan as BillingPlan,
    periodStart: String(row.period_start),
    periodEnd: String(row.period_end),
    billAmountMicros: Number(row.bill_amount_micros ?? 0),
    usableBudgetMicros: Number(row.usable_budget_micros ?? 0),
    spentMicros: Number(row.spent_micros ?? 0),
    reservedMicros: Number(row.reserved_micros ?? 0),
    status: (row.status as AccountUsagePeriod["status"]) ?? "open",
  };
}

/** Ensure an open calendar-month period exists for this billing profile. */
export async function ensureAccountUsagePeriod(opts: {
  profileId: string;
  plan: BillingPlan;
}): Promise<AccountUsagePeriod | null> {
  try {
    const admin = createSupabaseAdminClient();
    const policy = planUsagePolicy(opts.plan);
    const periodStart = windowStartIso("month");
    const periodEnd = periodEndFromStart(periodStart);

    const { data: existing } = await admin
      .from("account_usage_periods")
      .select("*")
      .eq("profile_id", opts.profileId)
      .eq("period_start", periodStart)
      .maybeSingle();
    if (existing) return mapPeriod(existing);

    const { data, error } = await admin
      .from("account_usage_periods")
      .upsert(
        {
          profile_id: opts.profileId,
          plan: opts.plan,
          period_start: periodStart,
          period_end: periodEnd,
          bill_amount_micros: policy.billAmountMicros,
          usable_budget_micros: policy.usableBudgetMicros,
          spent_micros: 0,
          reserved_micros: 0,
          status: "open",
        },
        { onConflict: "profile_id,period_start" },
      )
      .select("*")
      .single();
    if (error || !data) return null;
    return mapPeriod(data);
  } catch {
    return null;
  }
}

export async function reserveAccountSpend(opts: {
  periodId: string;
  costMicros: number;
}): Promise<{ ok: true; period: AccountUsagePeriod } | { ok: false }> {
  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.rpc("reserve_account_usage_spend", {
      p_period_id: opts.periodId,
      p_cost_micros: opts.costMicros,
    });
    if (error || !data) return { ok: false };
    const row = Array.isArray(data) ? data[0] : data;
    return { ok: true, period: mapPeriod(row as Record<string, unknown>) };
  } catch {
    return { ok: false };
  }
}

export async function confirmAccountSpend(opts: {
  periodId: string;
  reservedMicros: number;
  actualMicros: number;
}): Promise<void> {
  try {
    const admin = createSupabaseAdminClient();
    await admin.rpc("confirm_account_usage_spend", {
      p_period_id: opts.periodId,
      p_reserved_micros: opts.reservedMicros,
      p_actual_micros: opts.actualMicros,
    });
  } catch {
    // best-effort
  }
}

export async function releaseAccountSpend(opts: {
  periodId: string;
  reservedMicros: number;
}): Promise<void> {
  try {
    const admin = createSupabaseAdminClient();
    await admin.rpc("release_account_usage_spend", {
      p_period_id: opts.periodId,
      p_reserved_micros: opts.reservedMicros,
    });
  } catch {
    // best-effort
  }
}

export function accountSpendSnapshot(period: AccountUsagePeriod) {
  const committed = period.spentMicros + period.reservedMicros;
  const percentUsed =
    period.usableBudgetMicros > 0
      ? Math.min(
          100,
          Math.round((committed / period.usableBudgetMicros) * 100),
        )
      : 0;
  const status =
    committed >= period.usableBudgetMicros
      ? ("exhausted" as const)
      : percentUsed >= 85
        ? ("approaching" as const)
        : ("ok" as const);
  return {
    spentMicros: period.spentMicros,
    reservedMicros: period.reservedMicros,
    usableBudgetMicros: period.usableBudgetMicros,
    billAmountMicros: period.billAmountMicros,
    percentUsed,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    status,
  };
}
