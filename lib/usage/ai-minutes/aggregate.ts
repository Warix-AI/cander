/**
 * Period aggregate refresh + user-facing AI minutes snapshot.
 */

import type { BillingPlan } from "../../types.ts";
import {
  ensureAccountUsagePeriod,
  type AccountUsagePeriod,
} from "../account-period.ts";
import { planUsagePolicy } from "../plan-config.ts";
import {
  formatMinutesDetail,
  formatMinutesRemainingLine,
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
}): AIMinutesSnapshot {
  const included = Math.max(0, input.includedMinutes);
  const used = Math.max(0, input.usedMinutes);
  const remaining = Math.max(0, included - used);
  const percentUsed =
    included > 0 ? Math.min(100, Math.round((used / included) * 100)) : 0;
  const status: AIMinutesSnapshot["status"] =
    included > 0 && used >= included
      ? "exhausted"
      : percentUsed >= 85
        ? "approaching"
        : "ok";

  return {
    planId: input.planId,
    includedMinutes: included,
    usedMinutes: used,
    remainingMinutes: remaining,
    percentUsed,
    usedBillableMs: input.usedBillableMs,
    estimatedCostUsd: input.estimatedCostUsd,
    actualCostUsd: input.actualCostUsd,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    status,
    limitBehavior: input.limitBehavior,
    usedLabel: formatUsedMinutes(used),
    remainingLabel: formatRemainingMinutes(remaining),
    detailLabel: formatMinutesDetail({
      usedMinutes: used,
      includedMinutes: included,
    }),
  };
}
