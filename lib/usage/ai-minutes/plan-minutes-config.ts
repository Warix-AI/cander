/**
 * Admin-editable AI minute allocations.
 * Code defaults are fallbacks; DB `ai_plan_minute_configs` is preferred.
 * Period snapshots on account_usage_periods are never retroactively rewritten
 * when admin changes defaults — only new periods pick up new included_minutes.
 */

import { canonicalizePlan } from "../../billing/plan-catalog.ts";
import type { BillingPlan } from "../../types.ts";
import type { AIUsageLimitBehavior } from "./types.ts";

export type AiPlanMinuteConfig = {
  planId: BillingPlan;
  label: string;
  includedMinutes: number;
  minimumMinutes: number | null;
  maximumMinutes: number | null;
  minutesStep: number;
  internalBudgetUsd: number;
  usageLimitBehavior: AIUsageLimitBehavior;
  isEnterprise: boolean;
  isSelfServe: boolean;
  active: boolean;
};

/** Code defaults — must match plan catalog + migration 077 seed. */
export const DEFAULT_AI_PLAN_MINUTE_CONFIGS: Record<
  BillingPlan,
  AiPlanMinuteConfig
> = {
  minimal: {
    planId: "minimal",
    label: "Minimal",
    includedMinutes: 20,
    minimumMinutes: 20,
    maximumMinutes: 20,
    minutesStep: 1,
    internalBudgetUsd: 1,
    usageLimitBehavior: "hard",
    isEnterprise: false,
    isSelfServe: true,
    active: true,
  },
  light: {
    planId: "light",
    label: "Light",
    includedMinutes: 30,
    minimumMinutes: 30,
    maximumMinutes: 30,
    minutesStep: 1,
    internalBudgetUsd: 11,
    usageLimitBehavior: "hard",
    isEnterprise: false,
    isSelfServe: true,
    active: true,
  },
  moderate: {
    planId: "moderate",
    label: "Moderate",
    includedMinutes: 100,
    minimumMinutes: 100,
    maximumMinutes: 100,
    minutesStep: 1,
    internalBudgetUsd: 37,
    usageLimitBehavior: "hard",
    isEnterprise: false,
    isSelfServe: true,
    active: true,
  },
  heavy: {
    planId: "heavy",
    label: "Heavy",
    includedMinutes: 250,
    minimumMinutes: 250,
    maximumMinutes: 250,
    minutesStep: 1,
    internalBudgetUsd: 92,
    usageLimitBehavior: "hard",
    isEnterprise: false,
    isSelfServe: true,
    active: true,
  },
  limitless: {
    planId: "limitless",
    label: "Limitless",
    includedMinutes: 1000,
    minimumMinutes: 251,
    maximumMinutes: null,
    minutesStep: 1,
    internalBudgetUsd: 250,
    usageLimitBehavior: "hard",
    isEnterprise: true,
    isSelfServe: false,
    active: true,
  },
};

let cache: { at: number; configs: Record<BillingPlan, AiPlanMinuteConfig> } | null =
  null;
const CACHE_TTL_MS = 60_000;

function clampIncluded(
  plan: BillingPlan,
  value: number,
  cfg: AiPlanMinuteConfig,
): number {
  let next = value;
  if (cfg.minimumMinutes != null) next = Math.max(cfg.minimumMinutes, next);
  if (cfg.maximumMinutes != null) next = Math.min(cfg.maximumMinutes, next);
  if (plan === "limitless" && cfg.minimumMinutes != null) {
    next = Math.max(cfg.minimumMinutes, value);
  }
  return next;
}

function mapRow(row: Record<string, unknown>): AiPlanMinuteConfig {
  const planId = canonicalizePlan(row.plan_id);
  const fallback =
    DEFAULT_AI_PLAN_MINUTE_CONFIGS[planId] ??
    DEFAULT_AI_PLAN_MINUTE_CONFIGS.minimal;
  return {
    planId,
    label: String(row.label ?? fallback.label),
    includedMinutes: Number(row.included_minutes ?? fallback.includedMinutes),
    minimumMinutes:
      row.minimum_minutes == null ? null : Number(row.minimum_minutes),
    maximumMinutes:
      row.maximum_minutes == null ? null : Number(row.maximum_minutes),
    minutesStep: Number(row.minutes_step ?? 1),
    internalBudgetUsd: Number(row.internal_budget_usd ?? fallback.internalBudgetUsd),
    usageLimitBehavior:
      row.usage_limit_behavior === "soft" ? "soft" : "hard",
    isEnterprise: Boolean(row.is_enterprise) || planId === "limitless",
    isSelfServe: row.is_self_serve !== false && planId !== "limitless",
    active: row.active !== false,
  };
}

export function defaultAiPlanMinuteConfig(plan: BillingPlan): AiPlanMinuteConfig {
  const canonical = canonicalizePlan(plan);
  return (
    DEFAULT_AI_PLAN_MINUTE_CONFIGS[canonical] ??
    DEFAULT_AI_PLAN_MINUTE_CONFIGS.minimal
  );
}

export async function loadAiPlanMinuteConfigs(opts?: {
  force?: boolean;
}): Promise<Record<BillingPlan, AiPlanMinuteConfig>> {
  if (!opts?.force && cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.configs;
  }

  const configs = { ...DEFAULT_AI_PLAN_MINUTE_CONFIGS };
  try {
    const { createSupabaseAdminClient } = await import(
      "../../supabase/admin.ts"
    );
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.from("ai_plan_minute_configs").select("*");
    if (!error && data?.length) {
      for (const row of data) {
        const mapped = mapRow(row as Record<string, unknown>);
        configs[mapped.planId] = mapped;
      }
    }
  } catch {
    // Fall back to code defaults when admin client / table unavailable.
  }

  cache = { at: Date.now(), configs };
  return configs;
}

export function clearAiPlanMinuteConfigCache() {
  cache = null;
}

export async function resolveIncludedMinutesForPlan(
  plan: BillingPlan,
  opts?: { overrideMinutes?: number | null },
): Promise<{
  includedMinutes: number;
  config: AiPlanMinuteConfig;
  usageLimitBehavior: AIUsageLimitBehavior;
  internalBudgetUsd: number;
}> {
  const canonical = canonicalizePlan(plan);
  const configs = await loadAiPlanMinuteConfigs();
  const config = configs[canonical] ?? defaultAiPlanMinuteConfig(canonical);
  const base =
    opts?.overrideMinutes != null && Number.isFinite(opts.overrideMinutes)
      ? Number(opts.overrideMinutes)
      : config.includedMinutes;
  return {
    includedMinutes: clampIncluded(canonical, base, config),
    config,
    usageLimitBehavior: config.usageLimitBehavior,
    internalBudgetUsd: config.internalBudgetUsd,
  };
}

export async function upsertAiPlanMinuteConfig(
  input: Partial<AiPlanMinuteConfig> & { planId: BillingPlan },
  updatedBy?: string | null,
): Promise<AiPlanMinuteConfig> {
  const planId = canonicalizePlan(input.planId);
  const current =
    (await loadAiPlanMinuteConfigs({ force: true }))[planId] ??
    defaultAiPlanMinuteConfig(planId);
  const next: AiPlanMinuteConfig = {
    ...current,
    ...input,
    planId,
    includedMinutes: clampIncluded(
      planId,
      input.includedMinutes ?? current.includedMinutes,
      {
        ...current,
        ...input,
        planId,
      },
    ),
  };

  const { createSupabaseAdminClient } = await import("../../supabase/admin.ts");
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("ai_plan_minute_configs")
    .upsert(
      {
        plan_id: next.planId,
        label: next.label,
        included_minutes: next.includedMinutes,
        minimum_minutes: next.minimumMinutes,
        maximum_minutes: next.maximumMinutes,
        minutes_step: next.minutesStep,
        internal_budget_usd: next.internalBudgetUsd,
        usage_limit_behavior: next.usageLimitBehavior,
        is_enterprise: next.isEnterprise,
        is_self_serve: next.isSelfServe,
        active: next.active,
        updated_by: updatedBy ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "plan_id" },
    )
    .select("*")
    .single();

  clearAiPlanMinuteConfigCache();
  if (error || !data) return next;
  return mapRow(data as Record<string, unknown>);
}
