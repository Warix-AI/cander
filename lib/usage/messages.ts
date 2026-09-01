import type { BillingPlan } from "../types.ts";
import type { UsageFeatureCategory, UsageGuardFailure } from "./types.ts";
import { nextPlanTier } from "../plan-entitlements.ts";

const FEATURE_LABELS: Record<UsageFeatureCategory, string> = {
  ai_chat: "AI chat",
  knowledge_index: "Knowledge indexing",
  knowledge_search: "File search",
  web_research: "Web research",
  review_analysis: "Review analysis",
  scheduled_reports: "Scheduled reports",
  image_generation: "Image generation",
  audio_realtime: "Voice and audio",
  coding_agent: "Coding agent",
  sandbox_runtime: "Sandbox runtime",
  sandbox_build: "Builds",
  sandbox_deploy: "Deployments",
  video_generation: "Video generation",
};

export function usageFeatureLabel(feature: UsageFeatureCategory): string {
  return FEATURE_LABELS[feature];
}

export function rateLimitedMessage(feature: UsageFeatureCategory): string {
  const label = usageFeatureLabel(feature);
  return `Your workspace is processing several ${label.toLowerCase()} requests. Try again shortly.`;
}

export function quotaExceededMessage(
  feature: UsageFeatureCategory,
  plan: BillingPlan,
): string {
  const label = usageFeatureLabel(feature);
  if (plan === "free") {
    return `You've reached this month's ${label.toLowerCase()} allowance on the Free plan. Upgrade for higher limits.`;
  }
  return `You've reached today's ${label.toLowerCase()} capacity for unusually high usage. It resets soon.`;
}

export function concurrencyLimitedMessage(feature: UsageFeatureCategory): string {
  const label = usageFeatureLabel(feature);
  return `Your workspace already has the maximum number of ${label.toLowerCase()} jobs running. Try again when one finishes.`;
}

export function costCeilingMessage(plan: BillingPlan): string {
  if (plan === "free") {
    return "This workspace reached its daily usage safeguard. Upgrade or try again tomorrow.";
  }
  return "Your workspace reached a temporary usage safeguard due to unusually high activity. Try again later today.";
}

export function featureDisabledMessage(feature: UsageFeatureCategory, plan: BillingPlan): string {
  const label = usageFeatureLabel(feature);
  const upgrade = nextPlanTier(plan);
  if (upgrade) {
    return `${label} isn't included on your current plan. Upgrade to unlock it.`;
  }
  return `${label} isn't available on your current plan.`;
}

export function killSwitchMessage(feature: UsageFeatureCategory): string {
  return `${usageFeatureLabel(feature)} is temporarily unavailable. Please try again later.`;
}

export function toGuardFailure(
  partial: Omit<UsageGuardFailure, "message"> & { message?: string },
  plan: BillingPlan,
  feature: UsageFeatureCategory,
): UsageGuardFailure {
  const message =
    partial.message ??
    (partial.code === "rate_limited"
      ? rateLimitedMessage(feature)
      : partial.code === "quota_exceeded"
        ? quotaExceededMessage(feature, plan)
        : partial.code === "concurrency_limited"
          ? concurrencyLimitedMessage(feature)
          : partial.code === "cost_ceiling"
            ? costCeilingMessage(plan)
            : partial.code === "feature_disabled"
              ? featureDisabledMessage(feature, plan)
              : partial.code === "kill_switch"
                ? killSwitchMessage(feature)
                : "This request can't be completed right now.");
  return { ...partial, message };
}
