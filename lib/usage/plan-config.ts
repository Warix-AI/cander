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
function freeFeatures(): Record<UsageFeatureCategory, FeatureUsageLimit> {
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

function proFeatures(): Record<UsageFeatureCategory, FeatureUsageLimit> {
  const generous = (overrides: Partial<FeatureUsageLimit>) =>
    feature({
      enabled: true,
      monthlyUnits: null,
      rateLimits: { perMinute: 30, perHour: 300, perDay: 2000 },
      concurrentJobs: 3,
      softThrottleAtPercent: 95,
      costWeightMicrosPerUnit: 100,
      ...overrides,
    });
  return {
    ai_chat: generous({ rateLimits: { perMinute: 40, perHour: 400, perDay: 4000 } }),
    knowledge_index: generous({
      monthlyUnits: 500,
      rateLimits: { perDay: 200 },
      concurrentJobs: 2,
    }),
    knowledge_search: generous({ rateLimits: { perMinute: 20, perHour: 200 } }),
    web_research: generous({ rateLimits: { perMinute: 10, perHour: 120, perDay: 500 } }),
    review_analysis: generous({ rateLimits: { perDay: 200 } }),
    scheduled_reports: generous({ monthlyUnits: 60, rateLimits: { perDay: 20 }, concurrentJobs: 2 }),
    image_generation: generous({
      rateLimits: { perDay: 100, perHour: 20 },
      concurrentJobs: 2,
      costWeightMicrosPerUnit: 5000,
    }),
    audio_realtime: generous({
      monthlyUnits: 600,
      rateLimits: { perDay: 120 },
      concurrentJobs: 1,
      costWeightMicrosPerUnit: 800,
    }),
    coding_agent: feature({ enabled: false, monthlyUnits: 0, concurrentJobs: 0 }),
    sandbox_runtime: generous({
      rateLimits: { perDay: 400, perHour: 40 },
      concurrentJobs: 2,
      costWeightMicrosPerUnit: 2000,
    }),
    sandbox_build: generous({
      rateLimits: { perDay: 120, perHour: 20 },
      concurrentJobs: 2,
      costWeightMicrosPerUnit: 3000,
    }),
    sandbox_deploy: generous({
      monthlyUnits: 40,
      rateLimits: { perDay: 20 },
      concurrentJobs: 1,
      costWeightMicrosPerUnit: 4000,
    }),
    video_generation: feature({ enabled: false, monthlyUnits: 0, concurrentJobs: 0 }),
  };
}

function maxFeatures(): Record<UsageFeatureCategory, FeatureUsageLimit> {
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
      enabled: false,
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
  free: {
    plan: "free",
    label: "Free",
    marketingUnlimited: false,
    features: freeFeatures(),
    workspaceDailyCostCeilingMicros: 500_000,
    workspaceMonthlyCostCeilingMicros: 5_000_000,
    userDailyExpensiveActionCeilingMicros: 200_000,
  },
  pro: {
    plan: "pro",
    label: "Pro",
    marketingUnlimited: true,
    features: proFeatures(),
    workspaceDailyCostCeilingMicros: 15_000_000,
    workspaceMonthlyCostCeilingMicros: 150_000_000,
    userDailyExpensiveActionCeilingMicros: 5_000_000,
  },
  max: {
    plan: "max",
    label: "Max",
    marketingUnlimited: true,
    features: maxFeatures(),
    workspaceDailyCostCeilingMicros: 40_000_000,
    workspaceMonthlyCostCeilingMicros: 400_000_000,
    userDailyExpensiveActionCeilingMicros: 12_000_000,
  },
};

export function usagePlanConfigVersion() {
  return USAGE_PLAN_CONFIG_VERSION;
}

export function planUsagePolicy(plan: BillingPlan): PlanUsagePolicy {
  return PLAN_POLICIES[plan];
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
