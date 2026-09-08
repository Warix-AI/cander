import type { BillingPlan } from "../types.ts";
import { isExpensiveFeature, featureLimitFor, planUsagePolicy, usagePlanConfigVersion } from "./plan-config.ts";
import {
  globalSpendCeilings,
  isFeatureKillSwitchActive,
  isUsageEnforcementEnabled,
} from "./kill-switches.ts";
import { toGuardFailure, usageFeatureLabel } from "./messages.ts";
import {
  capabilityForUsageFeature,
  resolveModelRoute,
} from "./model-routing.ts";
import type { UsageStore } from "./store/memory-store.ts";
import { MemoryUsageStore, getUsageStoreForTests } from "./store/memory-store.ts";
import type {
  UsageFeatureCategory,
  UsageGuardInput,
  UsageGuardResult,
  UsageReconcileInput,
  UsageStatusSnapshot,
  UsageWindowKind,
} from "./types.ts";
import {
  estimateCostMicros,
  retryAfterSeconds,
  windowStartIso,
} from "./window.ts";

let defaultStore: UsageStore | null = null;
let defaultStorePromise: Promise<UsageStore> | null = null;

export async function getUsageStore(): Promise<UsageStore> {
  const test = getUsageStoreForTests();
  if (test) return test;
  if (defaultStore) return defaultStore;
  if (!defaultStorePromise) {
    defaultStorePromise = (async () => {
      try {
        const { createPostgresUsageStore } = await import("./store/postgres-store.ts");
        defaultStore = createPostgresUsageStore() ?? new MemoryUsageStore();
      } catch {
        defaultStore = new MemoryUsageStore();
      }
      return defaultStore;
    })();
  }
  return defaultStorePromise;
}

export function setDefaultUsageStore(store: UsageStore | null) {
  defaultStore = store;
}

type RateLimitCheck = {
  windowKind: UsageWindowKind;
  limit: number;
  current: number;
};

async function readRateLimits(
  store: UsageStore,
  input: {
    workspaceId: string;
    profileId: string;
    feature: UsageFeatureCategory;
    limits: {
      perMinute?: number;
      perHour?: number;
      perDay?: number;
      perMonth?: number;
    };
  },
): Promise<RateLimitCheck | null> {
  const checks: Array<[UsageWindowKind, number | undefined]> = [
    ["minute", input.limits.perMinute],
    ["hour", input.limits.perHour],
    ["day", input.limits.perDay],
    ["month", input.limits.perMonth],
  ];
  for (const [kind, limit] of checks) {
    if (!limit) continue;
    const start = windowStartIso(kind);
    const counter = await store.getWindowCounter({
      workspaceId: input.workspaceId,
      profileId: input.profileId,
      feature: input.feature,
      windowKind: kind,
      windowStart: start,
    });
    if (counter.requestCount >= limit) {
      return { windowKind: kind, limit, current: counter.requestCount };
    }
  }
  return null;
}

export async function guardUsage(
  input: UsageGuardInput,
  opts?: { plan: BillingPlan; store?: UsageStore },
): Promise<UsageGuardResult> {
  const plan = opts?.plan ?? "free";
  const store = opts?.store ?? (await getUsageStore());
  const policy = planUsagePolicy(plan);
  const limit = featureLimitFor(plan, input.feature);

  if (!isUsageEnforcementEnabled()) {
    const reservation = await store.reserve({
      idempotencyKey: input.idempotencyKey,
      workspaceId: input.workspaceId,
      profileId: input.profileId,
      feature: input.feature,
      provider: input.provider,
      model: input.model,
      units: input.estimatedUnits,
      unitKind: input.unitKind,
      estimatedCostMicros: input.estimatedCostMicros ?? 0,
      metadata: input.metadata,
    });
    return {
      ok: true,
      reservationId: reservation.id,
      plan,
      throttled: false,
    };
  }

  if (isFeatureKillSwitchActive(input.feature)) {
    const failure = toGuardFailure(
      { ok: false, status: 503, code: "kill_switch" },
      plan,
      input.feature,
    );
    await store.writeAudit({
      workspaceId: input.workspaceId,
      profileId: input.profileId,
      feature: input.feature,
      decision: "blocked",
      reason: failure.message,
      metadata: input.metadata ?? {},
    });
    return failure;
  }

  if (!limit.enabled) {
    const failure = toGuardFailure(
      { ok: false, status: 403, code: "feature_disabled" },
      plan,
      input.feature,
    );
    await store.writeAudit({
      workspaceId: input.workspaceId,
      profileId: input.profileId,
      feature: input.feature,
      decision: "blocked",
      reason: failure.message,
      metadata: input.metadata ?? {},
    });
    return failure;
  }

  const capability = capabilityForUsageFeature(input.feature);
  if (capability === "coding_agent") {
    const route = resolveModelRoute("coding_agent");
    if (!route.enabled) {
      const failure = toGuardFailure(
        {
          ok: false,
          status: 403,
          code: "feature_disabled",
          message: route.reason,
        },
        plan,
        input.feature,
      );
      await store.writeAudit({
        workspaceId: input.workspaceId,
        profileId: input.profileId,
        feature: input.feature,
        decision: "blocked",
        reason: failure.message,
        metadata: input.metadata ?? {},
      });
      return failure;
    }
  }

  const active = await store.countActiveReservations({
    workspaceId: input.workspaceId,
    feature: input.feature,
  });
  if (active >= limit.concurrentJobs) {
    const failure = toGuardFailure(
      { ok: false, status: 429, code: "concurrency_limited" },
      plan,
      input.feature,
    );
    await store.writeAudit({
      workspaceId: input.workspaceId,
      profileId: input.profileId,
      feature: input.feature,
      decision: "blocked",
      reason: failure.message,
      metadata: { active, max: limit.concurrentJobs },
    });
    return failure;
  }

  const rateHit = await readRateLimits(store, {
    workspaceId: input.workspaceId,
    profileId: input.profileId,
    feature: input.feature,
    limits: limit.rateLimits,
  });
  if (rateHit) {
    const failure = toGuardFailure(
      {
        ok: false,
        status: 429,
        code: "rate_limited",
        retryAfterSec: retryAfterSeconds(rateHit.windowKind),
      },
      plan,
      input.feature,
    );
    await store.writeAudit({
      workspaceId: input.workspaceId,
      profileId: input.profileId,
      feature: input.feature,
      decision: "throttled",
      reason: failure.message,
      metadata: { ...rateHit },
    });
    return failure;
  }

  const estimatedCost =
    input.estimatedCostMicros ??
    estimateCostMicros(input.estimatedUnits, limit.costWeightMicrosPerUnit);

  const dayStart = windowStartIso("day");
  const monthStart = windowStartIso("month");
  const workspaceDayCost = await store.sumWorkspaceCost({
    workspaceId: input.workspaceId,
    windowKind: "day",
    windowStart: dayStart,
  });
  if (
    workspaceDayCost + estimatedCost >
    policy.workspaceDailyCostCeilingMicros
  ) {
    const failure = toGuardFailure(
      { ok: false, status: 429, code: "cost_ceiling" },
      plan,
      input.feature,
    );
    await store.writeAudit({
      workspaceId: input.workspaceId,
      profileId: input.profileId,
      feature: input.feature,
      decision: "blocked",
      reason: failure.message,
      metadata: { workspaceDayCost, estimatedCost },
    });
    return failure;
  }

  const workspaceMonthCost = await store.sumWorkspaceCost({
    workspaceId: input.workspaceId,
    windowKind: "month",
    windowStart: monthStart,
  });
  if (
    workspaceMonthCost + estimatedCost >
    policy.workspaceMonthlyCostCeilingMicros
  ) {
    const failure = toGuardFailure(
      { ok: false, status: 429, code: "cost_ceiling" },
      plan,
      input.feature,
    );
    await store.writeAudit({
      workspaceId: input.workspaceId,
      profileId: input.profileId,
      feature: input.feature,
      decision: "blocked",
      reason: failure.message,
      metadata: { workspaceMonthCost, estimatedCost },
    });
    return failure;
  }

  if (isExpensiveFeature(input.feature)) {
    const userDayCost = await store.sumUserExpensiveCost({
      profileId: input.profileId,
      windowKind: "day",
      windowStart: dayStart,
    });
    if (
      userDayCost + estimatedCost >
      policy.userDailyExpensiveActionCeilingMicros
    ) {
      const failure = toGuardFailure(
        { ok: false, status: 429, code: "cost_ceiling" },
        plan,
        input.feature,
      );
      await store.writeAudit({
        workspaceId: input.workspaceId,
        profileId: input.profileId,
        feature: input.feature,
        decision: "blocked",
        reason: failure.message,
        metadata: { userDayCost, estimatedCost },
      });
      return failure;
    }
  }

  const global = globalSpendCeilings();
  const globalDay = await store.sumGlobalCost({
    windowKind: "day",
    windowStart: dayStart,
  });
  if (globalDay + estimatedCost > global.dailyMicros) {
    const failure = toGuardFailure(
      {
        ok: false,
        status: 503,
        code: "cost_ceiling",
        message:
          "Cander is temporarily limiting new requests due to high platform load. Try again shortly.",
      },
      plan,
      input.feature,
    );
    await store.writeAudit({
      workspaceId: input.workspaceId,
      profileId: input.profileId,
      feature: input.feature,
      decision: "blocked",
      reason: failure.message,
      metadata: { globalDay, estimatedCost },
    });
    return failure;
  }

  let throttled = false;
  let notice: string | undefined;
  if (limit.monthlyUnits != null) {
    const monthCounter = await store.getWindowCounter({
      workspaceId: input.workspaceId,
      profileId: input.profileId,
      feature: input.feature,
      windowKind: "month",
      windowStart: monthStart,
    });
    const pct = (monthCounter.units / limit.monthlyUnits) * 100;
    const soft = limit.softThrottleAtPercent ?? 90;
    if (monthCounter.units + input.estimatedUnits > limit.monthlyUnits) {
      const failure = toGuardFailure(
        { ok: false, status: 429, code: "quota_exceeded" },
        plan,
        input.feature,
      );
      await store.writeAudit({
        workspaceId: input.workspaceId,
        profileId: input.profileId,
        feature: input.feature,
        decision: "blocked",
        reason: failure.message,
        metadata: { monthCounter, limit: limit.monthlyUnits },
      });
      return failure;
    }
    if (pct >= soft) {
      throttled = true;
      notice =
        plan === "free"
          ? `You're approaching this month's ${usageFeatureLabel(input.feature).toLowerCase()} allowance.`
          : "Your workspace is in fair-use throttle due to unusually high usage today.";
    }
  }

  // Account-level usable $ hard stop (shared across workspaces).
  let periodId: string | undefined;
  let periodReserved = estimatedCost;
  try {
    const accountPeriod = await import("./account-period.ts");
    const period = await accountPeriod.ensureAccountUsagePeriod({
      profileId: input.profileId,
      plan,
    });
    if (period) {
      const committed = period.spentMicros + period.reservedMicros;
      if (committed + estimatedCost > period.usableBudgetMicros) {
        const failure = toGuardFailure(
          {
            ok: false,
            status: 429,
            code: "quota_exceeded",
            message:
              "You've reached this month's account usage budget. Upgrade or wait until your period resets.",
          },
          plan,
          input.feature,
        );
        await store.writeAudit({
          workspaceId: input.workspaceId,
          profileId: input.profileId,
          feature: input.feature,
          decision: "blocked",
          reason: failure.message,
          metadata: { periodId: period.id, committed, estimatedCost },
        });
        return failure;
      }
      const reserved = await accountPeriod.reserveAccountSpend({
        periodId: period.id,
        costMicros: estimatedCost,
      });
      if (!reserved.ok) {
        const failure = toGuardFailure(
          {
            ok: false,
            status: 429,
            code: "quota_exceeded",
            message:
              "You've reached this month's account usage budget. Upgrade or wait until your period resets.",
          },
          plan,
          input.feature,
        );
        await store.writeAudit({
          workspaceId: input.workspaceId,
          profileId: input.profileId,
          feature: input.feature,
          decision: "blocked",
          reason: failure.message,
          metadata: { periodId: period.id, estimatedCost },
        });
        return failure;
      }
      periodId = period.id;
      const spendPct = accountPeriod.accountSpendSnapshot(reserved.period)
        .percentUsed;
      if (spendPct >= 85 && !throttled) {
        throttled = true;
        notice =
          notice ??
          "You're approaching this month's account usage budget.";
      }
    }
  } catch {
    // Periods table / admin client unavailable (local tests) — skip account hard-stop.
  }

  const reservation = await store.reserve({
    idempotencyKey: input.idempotencyKey,
    workspaceId: input.workspaceId,
    profileId: input.profileId,
    feature: input.feature,
    provider: input.provider,
    model: input.model,
    units: input.estimatedUnits,
    unitKind: input.unitKind,
    estimatedCostMicros: estimatedCost,
    metadata: {
      ...(input.metadata ?? {}),
      ...(periodId
        ? {
            periodId,
            periodReservedMicros: periodReserved,
            billingProfileId: input.profileId,
          }
        : {}),
    },
  });

  for (const kind of ["minute", "hour", "day", "month"] as UsageWindowKind[]) {
    await store.incrementWindowCounter({
      workspaceId: input.workspaceId,
      profileId: input.profileId,
      feature: input.feature,
      windowKind: kind,
      windowStart: windowStartIso(kind),
      requestDelta: 1,
      unitsDelta: input.estimatedUnits,
      costMicrosDelta: estimatedCost,
    });
  }

  await store.writeAudit({
    workspaceId: input.workspaceId,
    profileId: input.profileId,
    feature: input.feature,
    decision: throttled ? "throttled" : "allowed",
    reason: notice ?? "Request allowed.",
    metadata: { reservationId: reservation.id, estimatedCost },
  });

  return {
    ok: true,
    reservationId: reservation.id,
    plan,
    throttled,
    notice,
    downgradedModel: null,
  };
}

export async function reconcileUsage(
  input: UsageReconcileInput,
  store?: UsageStore,
) {
  const resolved = store ?? (await getUsageStore());
  const event = await resolved.reconcile(input);
  if (event) {
    const periodId =
      typeof event.metadata.periodId === "string"
        ? event.metadata.periodId
        : null;
    const reservedMicros = Number(
      event.metadata.periodReservedMicros ?? event.estimatedCostMicros ?? 0,
    );
    if (periodId) {
      try {
        const accountPeriod = await import("./account-period.ts");
        if (input.status === "confirmed") {
          await accountPeriod.confirmAccountSpend({
            periodId,
            reservedMicros,
            actualMicros:
              input.actualCostMicros ??
              event.actualCostMicros ??
              event.estimatedCostMicros,
          });
        } else {
          await accountPeriod.releaseAccountSpend({
            periodId,
            reservedMicros,
          });
        }
      } catch {
        // best-effort when admin/periods unavailable
      }
    }
  }
  return event;
}

export async function buildUsageStatusSnapshot(input: {
  plan: BillingPlan;
  workspaceId: string;
  profileId: string;
  store?: UsageStore;
}): Promise<UsageStatusSnapshot> {
  const store = input.store ?? (await getUsageStore());
  const policy = planUsagePolicy(input.plan);
  const monthStart = windowStartIso("month");
  const features = await Promise.all(
    (Object.keys(policy.features) as UsageFeatureCategory[]).map(async (feature) => {
      const limit = policy.features[feature];
      const counter = await store.getWindowCounter({
        workspaceId: input.workspaceId,
        profileId: input.profileId,
        feature,
        windowKind: "month",
        windowStart: monthStart,
      });
      let status: "available" | "throttled" | "limited" | "unavailable" = "available";
      let message: string | undefined;
      if (!limit.enabled) {
        status = "unavailable";
        message = `${usageFeatureLabel(feature)} isn't on your plan.`;
      } else if (
        limit.monthlyUnits != null &&
        counter.units >= limit.monthlyUnits
      ) {
        status = "limited";
        message = `You've reached this month's ${usageFeatureLabel(feature).toLowerCase()} allowance.`;
      } else if (
        limit.monthlyUnits != null &&
        counter.units / limit.monthlyUnits >=
          (limit.softThrottleAtPercent ?? 90) / 100
      ) {
        status = "throttled";
        message = `You're approaching this month's ${usageFeatureLabel(feature).toLowerCase()} allowance.`;
      }
      return {
        feature,
        label: usageFeatureLabel(feature),
        enabled: limit.enabled,
        status,
        message,
        resetAt: null,
        unitsUsed: counter.units,
        monthlyLimit: limit.monthlyUnits,
        percentUsed:
          limit.monthlyUnits != null && limit.monthlyUnits > 0
            ? Math.min(100, Math.round((counter.units / limit.monthlyUnits) * 100))
            : status === "throttled"
              ? 85
              : null,
      };
    }),
  );

  let accountSpend: UsageStatusSnapshot["accountSpend"];
  try {
    const accountPeriod = await import("./account-period.ts");
    const period = await accountPeriod.ensureAccountUsagePeriod({
      profileId: input.profileId,
      plan: input.plan,
    });
    accountSpend = period
      ? accountPeriod.accountSpendSnapshot(period)
      : undefined;
  } catch {
    accountSpend = undefined;
  }
  const notices = [
    ...(policy.marketingUnlimited
      ? ["Your plan includes generous fair-use limits for normal work."]
      : []),
    ...(accountSpend?.status === "approaching"
      ? ["You're approaching this month's account usage budget."]
      : []),
    ...(accountSpend?.status === "exhausted"
      ? ["You've reached this month's account usage budget."]
      : []),
  ];

  return {
    plan: input.plan,
    planLabel: policy.label,
    configVersion: usagePlanConfigVersion(),
    features,
    notices,
    upgradePlan: input.plan === "free" ? "pro" : input.plan === "pro" ? "max" : null,
    accountSpend,
  };
}
