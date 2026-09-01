import type { BillingPlan } from "../types.ts";

/** Versioned plan config — bump when allowance structure changes. */
export const USAGE_PLAN_CONFIG_VERSION = 1;

/** Normalized feature categories for metering and enforcement. */
export type UsageFeatureCategory =
  | "ai_chat"
  | "knowledge_index"
  | "knowledge_search"
  | "web_research"
  | "review_analysis"
  | "scheduled_reports"
  | "image_generation"
  | "audio_realtime"
  | "coding_agent"
  | "sandbox_runtime"
  | "sandbox_build"
  | "sandbox_deploy"
  | "video_generation";

export type UsageUnitKind =
  | "requests"
  | "tokens"
  | "minutes"
  | "pages"
  | "files"
  | "images"
  | "cost_micros";

export type UsageWindowKind = "minute" | "hour" | "day" | "month";

export type UsageEventStatus =
  | "reserved"
  | "confirmed"
  | "released"
  | "failed";

export type UsageDecision =
  | "allowed"
  | "throttled"
  | "blocked"
  | "downgraded"
  | "queued";

export type RateLimitSpec = {
  perMinute?: number;
  perHour?: number;
  perDay?: number;
  perMonth?: number;
};

export type FeatureUsageLimit = {
  enabled: boolean;
  /** null = fair-use unlimited for paid tiers */
  monthlyUnits: number | null;
  rateLimits: RateLimitSpec;
  concurrentJobs: number;
  maxRequestBodyBytes?: number;
  /** Start soft throttle at this % of monthly allowance (free tier). */
  softThrottleAtPercent?: number;
  /** Estimated cost weight per normalized unit (micro-dollars). */
  costWeightMicrosPerUnit: number;
};

export type PlanUsagePolicy = {
  plan: BillingPlan;
  label: string;
  marketingUnlimited: boolean;
  features: Record<UsageFeatureCategory, FeatureUsageLimit>;
  workspaceDailyCostCeilingMicros: number;
  workspaceMonthlyCostCeilingMicros: number;
  userDailyExpensiveActionCeilingMicros: number;
};

export type UsageGuardInput = {
  feature: UsageFeatureCategory;
  workspaceId: string;
  profileId: string;
  idempotencyKey: string;
  estimatedUnits: number;
  unitKind: UsageUnitKind;
  estimatedCostMicros?: number;
  ipAddress?: string | null;
  provider?: string | null;
  model?: string | null;
  metadata?: Record<string, unknown>;
};

export type UsageGuardSuccess = {
  ok: true;
  reservationId: string;
  plan: BillingPlan;
  throttled: boolean;
  notice?: string;
  downgradedModel?: string | null;
};

export type UsageGuardFailure = {
  ok: false;
  status: number;
  code:
    | "unauthorized"
    | "forbidden"
    | "feature_disabled"
    | "rate_limited"
    | "quota_exceeded"
    | "concurrency_limited"
    | "cost_ceiling"
    | "kill_switch"
    | "invalid_request";
  message: string;
  retryAfterSec?: number;
};

export type UsageGuardResult = UsageGuardSuccess | UsageGuardFailure;

export type UsageReconcileInput = {
  reservationId: string;
  status: "confirmed" | "released" | "failed";
  actualUnits?: number;
  actualCostMicros?: number;
  provider?: string | null;
  model?: string | null;
  metadata?: Record<string, unknown>;
};

export type UsageStatusFeature = {
  feature: UsageFeatureCategory;
  label: string;
  enabled: boolean;
  status: "available" | "throttled" | "limited" | "unavailable";
  message?: string;
  resetAt?: string | null;
  unitsUsed?: number;
  monthlyLimit?: number | null;
  percentUsed?: number | null;
};

export type UsageStatusSnapshot = {
  plan: BillingPlan;
  planLabel: string;
  configVersion: number;
  features: UsageStatusFeature[];
  notices: string[];
  upgradePlan: BillingPlan | null;
};
