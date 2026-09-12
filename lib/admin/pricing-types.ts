/**
 * Client-safe pricing types + preview math (no server imports).
 */

import type { BillingPlan } from "@/lib/types";

export type PricingPlanRow = {
  planId: BillingPlan;
  displayName: string;
  baseMonthlyPriceUsd: number;
  includedMinutes: number;
  minimumMinutes: number | null;
  maximumMinutes: number | null;
  minutesStep: number;
  priceIncrementUsd: number;
  pricingMode: "fixed" | "adjustable";
  isPublic: boolean;
  isSelfServe: boolean;
  active: boolean;
  sortOrder: number;
  metadata: Record<string, unknown>;
};

/** Slider preview price for adjustable plans (display only — no provider). */
export function previewPriceForMinutes(
  plan: PricingPlanRow,
  minutes: number,
): number {
  if (plan.pricingMode === "fixed" || plan.priceIncrementUsd === 0) {
    return plan.baseMonthlyPriceUsd;
  }
  const base = plan.includedMinutes;
  const delta = Math.max(0, minutes - base);
  const steps = plan.minutesStep > 0 ? Math.ceil(delta / plan.minutesStep) : 0;
  return plan.baseMonthlyPriceUsd + steps * plan.priceIncrementUsd;
}
