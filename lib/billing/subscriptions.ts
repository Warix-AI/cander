/**
 * Fixed-plan subscription boundary (Polar later).
 * Simulated now — selects a catalog plan, not arbitrary minutes.
 */

import {
  getPlan,
  isSelfServePlan,
  canonicalizePlan,
} from "@/lib/billing/plan-catalog";
import type { BillingPlan } from "@/lib/types";

export type BillingProvider = "simulated" | "polar";

export type CreateSubscriptionInput = {
  accountId: string;
  /** Canonical or legacy plan id */
  plan: BillingPlan | string;
};

export type CreateSubscriptionResult = {
  plan: BillingPlan;
  purchasedMinutes: number | null;
  monthlyPriceUsd: number | null;
  provider: BillingProvider;
  status: "active";
};

/**
 * Create (or simulate) a subscription for a fixed plan.
 * Authoritative minutes + price come from the plan catalog server-side.
 */
export async function createSubscription(
  input: CreateSubscriptionInput,
): Promise<CreateSubscriptionResult> {
  return createSimulatedSubscription(input);
}

async function createSimulatedSubscription(
  input: CreateSubscriptionInput,
): Promise<CreateSubscriptionResult> {
  if (!input.accountId?.trim()) {
    throw new Error("accountId is required.");
  }

  const plan = canonicalizePlan(input.plan);
  if (!isSelfServePlan(plan)) {
    throw new Error(
      "Limitless is not available for self-serve checkout. Contact us.",
    );
  }

  const entry = getPlan(plan);
  return {
    plan,
    purchasedMinutes: entry.includedActiveAiMinutes,
    monthlyPriceUsd: entry.monthlyPriceUsd,
    provider: "simulated",
    status: "active",
  };
}
