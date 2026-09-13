import { canonicalizePlan } from "../billing/plan-catalog.ts";
import type { BillingPlan } from "../types.ts";
import {
  USAGE_PLAN_CONFIG_VERSION,
  type FeatureUsageLimit,
  type PlanUsagePolicy,
  type UsageFeatureCategory,
} from "./types.ts";

const ALL_FEATURES: UsageFeatureCategory[] = [
  "ai_chat",
  "knowledge_index",
  "knowledge_search",
  "web_research",
  "review_analysis",
  "scheduled_reports",
  "image_generation",
  "audio_realtime",
  "coding_agent",
  "sandbox_runtime",
  "sandbox_build",
  "sandbox_deploy",
  "video_generation",
];

function feature(
  partial: Partial<FeatureUsageLimit> & Pick<FeatureUsageLimit, "enabled">,
): FeatureUsageLimit {
  return {
    monthlyUnits: null,
    rateLimits: {},
    concurrentJobs: 1,
    costWeightMicrosPerUnit: 100,
    softThrottleAtPercent: 85,
    ...partial,
  };
}

/** Approved plan limits (v2) — adjust here without touching route handlers. */
function minimalFeatures(): Record<UsageFeatureCategory, FeatureUsageLimit> {
  const base = (overrides: Partial<FeatureUsageLimit>) =>
    feature({
      enabled: true,
      monthlyUnits: 200,
      rateLimits: { perMinute: 8, perHour: 60, perDay: 120 },
      concurrentJobs: 1,
      costWeightMicrosPerUnit: 50,
      ...overrides,
    });
  return {
    ai_chat: base({ monthlyUnits: 150, rateLimits: { perMinute: 6, perHour: 40, perDay: 80 } }),
    knowledge_index: feature({ enabled: false, monthlyUnits: 0, concurrentJobs: 0 }),
    knowledge_search: feature({ enabled: false, monthlyUnits: 0, concurrentJobs: 0 }),
    web_research: base({ monthlyUnits: 20, rateLimits: { perMinute: 2, perHour: 10, perDay: 20 } }),
    review_analysis: base({ monthlyUnits: 10, rateLimits: { perDay: 10 } }),
    scheduled_reports: feature({ enabled: false, monthlyUnits: 0, concurrentJobs: 0 }),
    image_generation: base({
      monthlyUnits: 5,
      rateLimits: { perDay: 5, perHour: 2 },
      concurrentJobs: 1,
      costWeightMicrosPerUnit: 5000,
    }),
    audio_realtime: feature({ enabled: false, monthlyUnits: 0, concurrentJobs: 0 }),
    coding_agent: feature({ enabled: false, monthlyUnits: 0, concurrentJobs: 0 }),
    sandbox_runtime: base({
      monthlyUnits: 30,
      rateLimits: { perDay: 30, perHour: 5 },
      concurrentJobs: 1,
      costWeightMicrosPerUnit: 2000,
    }),
    sandbox_build: base({
      monthlyUnits: 10,
      rateLimits: { perDay: 10, perHour: 3 },
      concurrentJobs: 1,
      costWeightMicrosPerUnit: 3000,
    }),
    sandbox_deploy: feature({ enabled: false, monthlyUnits: 0, concurrentJobs: 0 }),
    video_generation: feature({ enabled: false, monthlyUnits: 0, concurrentJobs: 0 }),
  };
}

function lightFeatures(): Record<UsageFeatureCategory, FeatureUsageLimit> {
  // Paid plans share the full feature set; they differ by AI minutes / budget only.
  return moderateFeatures();
}

function moderateFeatures(): Record<UsageFeatureCategory, FeatureUsageLimit> {
  const nearUnlimited = (overrides: Partial<FeatureUsageLimit>) =>
    feature({
      enabled: true,
      monthlyUnits: null,
      rateLimits: { perMinute: 60, perHour: 600, perDay: 8000 },
      concurrentJobs: 5,
      softThrottleAtPercent: 98,
      costWeightMicrosPerUnit: 100,
      ...overrides,
    });
  return {
    ai_chat: nearUnlimited({ rateLimits: { perMinute: 80, perHour: 800, perDay: 12000 } }),
    knowledge_index: nearUnlimited({ concurrentJobs: 4 }),
    knowledge_search: nearUnlimited({ concurrentJobs: 4 }),
    web_research: nearUnlimited({ rateLimits: { perMinute: 20, perHour: 240, perDay: 2000 } }),
    review_analysis: nearUnlimited({ concurrentJobs: 4 }),
    scheduled_reports: nearUnlimited({ concurrentJobs: 4 }),
    image_generation: nearUnlimited({
      rateLimits: { perDay: 300, perHour: 40 },
      concurrentJobs: 3,
      costWeightMicrosPerUnit: 5000,
    }),
    audio_realtime: nearUnlimited({
      monthlyUnits: null,
      rateLimits: { perDay: 480 },
      concurrentJobs: 2,
      costWeightMicrosPerUnit: 800,
    }),
    coding_agent: feature({
      enabled: true,
      monthlyUnits: null,
      rateLimits: { perDay: 50, perHour: 10 },
      concurrentJobs: 1,
      costWeightMicrosPerUnit: 10000,
    }),
    sandbox_runtime: nearUnlimited({
      rateLimits: { perDay: 1200, perHour: 80 },
      concurrentJobs: 4,
      costWeightMicrosPerUnit: 2000,
    }),
    sandbox_build: nearUnlimited({
      rateLimits: { perDay: 400, perHour: 40 },
      concurrentJobs: 4,
      costWeightMicrosPerUnit: 3000,
    }),
    sandbox_deploy: nearUnlimited({
      rateLimits: { perDay: 80 },
      concurrentJobs: 2,
      costWeightMicrosPerUnit: 4000,
    }),
    video_generation: feature({ enabled: false, monthlyUnits: 0, concurrentJobs: 0 }),
  };
}

const PLAN_POLICIES: Record<BillingPlan, PlanUsagePolicy> = {
  minimal: {
    plan: "minimal",
    label: "Minimal",
    marketingUnlimited: false,
    features: minimalFeatures(),
    workspaceDailyCostCeilingMicros: 500_000,
    workspaceMonthlyCostCeilingMicros: 5_000_000,
    userDailyExpensiveActionCeilingMicros: 200_000,
    billAmountMicros: 0,
    usableBudgetMicros: 1_000_000, // $1 usable (internal)
    includedMinutes: 20,
    minimumMinutes: 20,
    maximumMinutes: 20,
    usageLimitBehavior: "hard",
  },
  light: {
    plan: "light",
    label: "Light",
    marketingUnlimited: true,
    features: lightFeatures(),
    workspaceDailyCostCeilingMicros: 11_000_000,
    workspaceMonthlyCostCeilingMicros: 110_000_000,
    userDailyExpensiveActionCeilingMicros: 4_000_000,
    billAmountMicros: 15_000_000, // $15
    usableBudgetMicros: 11_000_000, // $11 usable (internal)
    includedMinutes: 30,
    minimumMinutes: 30,
    maximumMinutes: 30,
    usageLimitBehavior: "hard",
  },
  moderate: {
    plan: "moderate",
    label: "Moderate",
    marketingUnlimited: true,
    features: moderateFeatures(),
    workspaceDailyCostCeilingMicros: 37_000_000,
    workspaceMonthlyCostCeilingMicros: 370_000_000,
    userDailyExpensiveActionCeilingMicros: 12_000_000,
    billAmountMicros: 50_000_000, // $50
    usableBudgetMicros: 37_000_000, // $37 usable (internal)
    includedMinutes: 100,
    minimumMinutes: 100,
    maximumMinutes: 100,
    usageLimitBehavior: "hard",
  },
  heavy: {
    plan: "heavy",
    label: "Heavy",
    marketingUnlimited: true,
    features: moderateFeatures(),
    workspaceDailyCostCeilingMicros: 92_000_000,
    workspaceMonthlyCostCeilingMicros: 920_000_000,
    userDailyExpensiveActionCeilingMicros: 30_000_000,
    billAmountMicros: 125_000_000, // $125
    usableBudgetMicros: 92_000_000, // $92 usable (internal)
    includedMinutes: 250,
    minimumMinutes: 250,
    maximumMinutes: 250,
    usageLimitBehavior: "hard",
  },
  limitless: {
    plan: "limitless",
    label: "Limitless",
    marketingUnlimited: true,
    features: moderateFeatures(),
    workspaceDailyCostCeilingMicros: 200_000_000,
    workspaceMonthlyCostCeilingMicros: 2_000_000_000,
    userDailyExpensiveActionCeilingMicros: 80_000_000,
    billAmountMicros: 0, // custom contract
    usableBudgetMicros: 250_000_000, // $250 default internal (overridable)
    includedMinutes: 1000,
    minimumMinutes: 251,
    maximumMinutes: null,
    usageLimitBehavior: "hard",
  },
};

export function usagePlanConfigVersion() {
  return USAGE_PLAN_CONFIG_VERSION;
}

export function planUsagePolicy(plan: BillingPlan): PlanUsagePolicy {
  const canonical = canonicalizePlan(plan);
  return PLAN_POLICIES[canonical] ?? PLAN_POLICIES.minimal;
}

export function featureLimitFor(
  plan: BillingPlan,
  feature: UsageFeatureCategory,
): FeatureUsageLimit {
  return planUsagePolicy(plan).features[feature];
}

export function allUsageFeatureCategories(): UsageFeatureCategory[] {
  return [...ALL_FEATURES];
}

export function isExpensiveFeature(feature: UsageFeatureCategory): boolean {
  return (
    feature === "image_generation" ||
    feature === "audio_realtime" ||
    feature === "coding_agent" ||
    feature === "sandbox_runtime" ||
    feature === "sandbox_build" ||
    feature === "sandbox_deploy" ||
    feature === "video_generation"
  );
}
