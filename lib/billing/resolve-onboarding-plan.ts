/**
 * Resolve which plan to persist when finishing onboarding.
 *
 * Platform (native vs web) may control checkout UI availability, but must never
 * downgrade an existing paid/Limitless account to Minimal.
 */

import { canonicalizePlan } from "./plan-catalog.ts";
import type { BillingPlan } from "../types.ts";

function hasPlanValue(value: unknown): boolean {
  return value != null && String(value).trim() !== "";
}

function isPaid(plan: BillingPlan): boolean {
  return plan !== "minimal";
}

/**
 * @param existingPlan Stored `profiles.plan` (legacy or canonical), if any
 * @param requestedPlan Plan from onboarding UI / native default request
 */
export function resolveOnboardingFinishPlan(input: {
  existingPlan?: unknown;
  requestedPlan?: unknown;
}): BillingPlan {
  const existing = hasPlanValue(input.existingPlan)
    ? canonicalizePlan(input.existingPlan)
    : null;
  const requested = hasPlanValue(input.requestedPlan)
    ? canonicalizePlan(input.requestedPlan)
    : null;

  // Never wipe Light/Moderate/Heavy/Limitless during onboarding finish.
  if (existing && isPaid(existing)) {
    if (requested && isPaid(requested)) {
      // Allow an explicit paid→paid change (web checkout), but not paid→Minimal.
      return requested;
    }
    return existing;
  }

  return requested ?? existing ?? "minimal";
}

/**
 * Native shells skip paid checkout UI. They may request Minimal only when the
 * account does not already have a paid plan.
 */
export function requestedPlanForNativeFinish(
  existingPlan?: unknown,
): BillingPlan | null {
  if (hasPlanValue(existingPlan) && isPaid(canonicalizePlan(existingPlan))) {
    return null; // preserve via resolveOnboardingFinishPlan
  }
  return "minimal";
}
