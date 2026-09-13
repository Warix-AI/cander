/**
 * Period aggregate refresh + user-facing AI minutes snapshot.
 */

import type { BillingPlan } from "../../types.ts";
import { canonicalizePlan } from "../../billing/plan-catalog.ts";
import {
  ensureAccountUsagePeriod,
  type AccountUsagePeriod,
} from "../account-period.ts";
import { planUsagePolicy } from "../plan-config.ts";
import {
  formatMinutesDetail,
  formatRemainingMinutes,
  formatUsedMinutes,
} from "./format.ts";
import { msToMinutes } from "./intervals.ts";
import {
  computeMergedBillableMs,
  listBillableIntervalsForPeriod,
  readPeriodAggregate,
  upsertPeriodAggregate,
} from "./store.ts";
import type { AIMinutesSnapshot, AIUsageLimitBehavior } from "./types.ts";

async function limitlessAllowanceConfigured(
  profileId: string,
): Promise<boolean> {
  try {
    const { createSupabaseAdminClient } = await import(
      "../../supabase/admin.ts"
    );
    const admin = createSupabaseAdminClient();
    const { data } = await admin
      .from("profiles")
      .select("purchased_ai_minutes, ai_minutes_override")
      .eq("id", profileId)
      .maybeSingle();
    return (
      (data?.purchased_ai_minutes != null &&
        Number.isFinite(Number(data.purchased_ai_minutes))) ||
      (data?.ai_minutes_override != null &&
        Number.isFinite(Number(data.ai_minutes_override)))
    );
  } catch {
    return false;
  }
}

async function resolveFixedAllowance(
  plan: BillingPlan,
  profileId: string,
): Promise<boolean> {
  if (canonicalizePlan(plan) !== "limitless") return true;
  return limitlessAllowanceConfigured(profileId);
}

export async function refreshAIMinutesAggregate(opts: {
  profileId: string;
  plan: BillingPlan;
  period?: AccountUsagePeriod | null;
}): Promise<AIMinutesSnapshot | null> {
  const period =
    opts.period ??
    (await ensureAccountUsagePeriod({
      profileId: opts.profileId,
      plan: opts.plan,
    }));
  if (!period) return null;

  const policy = planUsagePolicy(opts.plan);
  const includedMinutes =
    period.includedMinutes ?? policy.includedMinutes;
  const limitBehavior =
    period.usageLimitBehavior ?? policy.usageLimitBehavior;

  const listed = await listBillableIntervalsForPeriod({
    userId: opts.profileId,
    periodId: period.id,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
  });
  const usedBillableMs = computeMergedBillableMs(listed.intervals);
  const usedMinutes = msToMinutes(usedBillableMs);

  await upsertPeriodAggregate({
    profileId: opts.profileId,
    periodId: period.id,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    planId: opts.plan,
    includedMinutes,
    usedBillableMs,
    usedMinutes,
    estimatedCostUsd: listed.estimatedCostUsd,
    actualCostUsd: listed.actualCostUsd,
    eventCount: listed.eventCount,
  });

  const fixedAllowance = await resolveFixedAllowance(
    opts.plan,
    opts.profileId,
  );

  return toSnapshot({
    planId: opts.plan,
    includedMinutes,
    usedMinutes,
    usedBillableMs,
    estimatedCostUsd: listed.estimatedCostUsd,
    actualCostUsd: listed.actualCostUsd,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    limitBehavior,
    fixedAllowance,
  });
}

export async function getAIMinutesSnapshot(opts: {
  profileId: string;
  plan: BillingPlan;
  /** When false, return cached aggregate without recomputing from ledger. */
  refresh?: boolean;
}): Promise<AIMinutesSnapshot | null> {
  const period = await ensureAccountUsagePeriod({
    profileId: opts.profileId,
    plan: opts.plan,
  });
  if (!period) return null;

  if (opts.refresh !== false) {
    return refreshAIMinutesAggregate({
      profileId: opts.profileId,
      plan: opts.plan,
      period,
    });
  }

  const policy = planUsagePolicy(opts.plan);
  const cached = await readPeriodAggregate(period.id);
  if (!cached) {
    return refreshAIMinutesAggregate({
      profileId: opts.profileId,
      plan: opts.plan,
      period,
    });
  }

  return toSnapshot({
    planId: cached.planId || opts.plan,
    includedMinutes: cached.includedMinutes || policy.includedMinutes,
    usedMinutes: cached.usedMinutes,
    usedBillableMs: cached.usedBillableMs,
    estimatedCostUsd: cached.estimatedCostUsd,
    actualCostUsd: cached.actualCostUsd,
    periodStart: cached.periodStart || period.periodStart,
    periodEnd: cached.periodEnd || period.periodEnd,
    limitBehavior:
      period.usageLimitBehavior ?? policy.usageLimitBehavior,
    fixedAllowance: await resolveFixedAllowance(opts.plan, opts.profileId),
  });
}

function toSnapshot(input: {
  planId: string;
  includedMinutes: number;
  usedMinutes: number;
  usedBillableMs: number;
  estimatedCostUsd: number;
  actualCostUsd: number;
  periodStart: string;
  periodEnd: string;
  limitBehavior: AIUsageLimitBehavior;
  fixedAllowance: boolean;
}): AIMinutesSnapshot {
  const included = Math.max(0, input.includedMinutes);
  const used = Math.max(0, input.usedMinutes);
  const remaining = input.fixedAllowance
    ? Math.max(0, included - used)
    : 0;
  const percentUsed = input.fixedAllowance && included > 0
    ? Math.min(100, Math.round((used / included) * 100))
    : 0;
  const status: AIMinutesSnapshot["status"] =
    input.fixedAllowance && included > 0 && used >= included
      ? "exhausted"
      : input.fixedAllowance && percentUsed >= 85
        ? "approaching"
        : "ok";

  return {
    planId: input.planId,
    includedMinutes: included,
    usedMinutes: used,
    remainingMinutes: remaining,
    percentUsed: input.fixedAllowance ? percentUsed : 0,
    usedBillableMs: input.usedBillableMs,
    estimatedCostUsd: input.estimatedCostUsd,
    actualCostUsd: input.actualCostUsd,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    status,
    limitBehavior: input.limitBehavior,
    usedLabel: formatUsedMinutes(used),
    remainingLabel: input.fixedAllowance
      ? formatRemainingMinutes(remaining)
      : formatUsedMinutes(used),
    detailLabel: input.fixedAllowance
      ? formatMinutesDetail({
          usedMinutes: used,
          includedMinutes: included,
        })
      : `${formatUsedMinutes(used)} Active AI Minutes used`,
  };
}
