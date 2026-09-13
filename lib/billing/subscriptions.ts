/**
 * Subscription billing boundary.
 * Simulated now; Polar can replace the implementation without rewriting onboarding/usage.
 */

import type { BillingPlan } from "@/lib/types";
import {
  minutesArePurchasable,
  planForMinutes,
  priceForMinutes,
} from "@/lib/billing/minutes-pricing";

export type BillingProvider = "simulated" | "polar";

export type CreateSubscriptionInput = {
  accountId: string;
  selectedMinutes: number;
};

export type CreateSubscriptionResult = {
  purchasedMinutes: number;
  monthlyPriceUsd: number;
  plan: BillingPlan;
  provider: BillingProvider;
  status: "active";
};

/**
 * Create (or simulate) a subscription for purchased monthly AI minutes.
 * Authoritative price + plan are computed server-side from selectedMinutes.
 */
export async function createSubscription(
  input: CreateSubscriptionInput,
): Promise<CreateSubscriptionResult> {
  return createSimulatedSubscription(input);
}

async function createSimulatedSubscription(
  input: CreateSubscriptionInput,
): Promise<CreateSubscriptionResult> {
  const purchasedMinutes = Math.round(input.selectedMinutes);
  if (!minutesArePurchasable(purchasedMinutes)) {
    throw new Error(
      `Minutes ${purchasedMinutes} are not available for self-serve purchase.`,
    );
  }
  if (!input.accountId?.trim()) {
    throw new Error("accountId is required.");
  }

  const monthlyPriceUsd = priceForMinutes(purchasedMinutes);
  const plan = planForMinutes(purchasedMinutes);

  return {
    purchasedMinutes,
    monthlyPriceUsd,
    plan,
    provider: "simulated",
    status: "active",
  };
}
