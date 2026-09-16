/**
 * Canonical fixed-plan catalog — Active AI Minutes model.
 * Single presentation/source for onboarding, marketing, settings, and metering defaults.
 * Polar product IDs are intentionally unset until wired.
 */

import type { BillingPlan } from "@/lib/types";

export type PlanCatalogEntry = {
  id: BillingPlan;
  /** Customer-facing name */
  name: string;
  /** Monthly USD; null = custom (Limitless) */
  monthlyPriceUsd: number | null;
  /**
   * Included Active AI Minutes / month for metering.
   * Prefer `usageLevelLabel` in customer UI — do not lead with raw minutes.
   */
  includedActiveAiMinutes: number | null;
  /** Relative AI usage level for plan cards / comparison */
  usageLevelLabel: string;
  /** Self-serve checkout vs contact sales */
  selfServe: boolean;
  ctaLabel: string;
  blurb: string;
  popular?: boolean;
  /** Polar product/price placeholders — do not invent production IDs */
  polarProductId: string | null;
  polarPriceId: string | null;
};

/** Legacy plan keys that may still exist in DB / sessions. */
export type LegacyBillingPlan =
  | "free"
  | "pro"
  | "max"
  | "ultra"
  | "enterprise";

const LEGACY_TO_CANONICAL: Record<LegacyBillingPlan, BillingPlan> = {
  free: "minimal",
  pro: "light",
  max: "moderate",
  ultra: "heavy",
  enterprise: "limitless",
};

export const PLAN_CATALOG: Record<BillingPlan, PlanCatalogEntry> = {
  minimal: {
    id: "minimal",
    name: "Minimal",
    monthlyPriceUsd: 0,
    includedActiveAiMinutes: 25,
    usageLevelLabel: "25 active AI minutes/month",
    selfServe: true,
    ctaLabel: "Continue",
    blurb: "Unlimited Apps — one connected account per App.",
    polarProductId: null,
    polarPriceId: null,
  },
  light: {
    id: "light",
    name: "Light",
    monthlyPriceUsd: 30,
    includedActiveAiMinutes: 100,
    usageLevelLabel: "100 active AI minutes/month",
    selfServe: true,
    ctaLabel: "Continue",
    blurb: "Multiple accounts per App when you need them.",
    popular: true,
    polarProductId: null,
    polarPriceId: null,
  },
  moderate: {
    id: "moderate",
    name: "Moderate",
    monthlyPriceUsd: 75,
    includedActiveAiMinutes: 250,
    usageLevelLabel: "250 active AI minutes/month",
    selfServe: true,
    ctaLabel: "Continue",
    blurb: "More AI usage for regular work across your Apps.",
    polarProductId: null,
    polarPriceId: null,
  },
  heavy: {
    id: "heavy",
    name: "Heavy",
    monthlyPriceUsd: 150,
    includedActiveAiMinutes: 500,
    usageLevelLabel: "500 active AI minutes/month",
    selfServe: true,
    ctaLabel: "Continue",
    blurb: "Highest self-serve AI usage across your Apps.",
    polarProductId: null,
    polarPriceId: null,
  },
  limitless: {
    id: "limitless",
    name: "Limitless",
    monthlyPriceUsd: null,
    includedActiveAiMinutes: null,
    usageLevelLabel: "Custom AI usage",
    selfServe: false,
    ctaLabel: "Contact us",
    blurb: "Custom access for larger teams.",
    polarProductId: null,
    polarPriceId: null,
  },
};

/** Ordered for UI (marketing + onboarding). */
export const PLAN_CATALOG_LIST: PlanCatalogEntry[] = [
  PLAN_CATALOG.minimal,
  PLAN_CATALOG.light,
  PLAN_CATALOG.moderate,
  PLAN_CATALOG.heavy,
  PLAN_CATALOG.limitless,
];

export const SELF_SERVE_PLANS: BillingPlan[] = [
  "minimal",
  "light",
  "moderate",
  "heavy",
];

export function isLegacyBillingPlan(value: unknown): value is LegacyBillingPlan {
  return (
    value === "free" ||
    value === "pro" ||
    value === "max" ||
    value === "ultra" ||
    value === "enterprise"
  );
}

export function isCanonicalBillingPlan(value: unknown): value is BillingPlan {
  return (
    value === "minimal" ||
    value === "light" ||
    value === "moderate" ||
    value === "heavy" ||
    value === "limitless"
  );
}

/** Map any stored plan id (legacy or canonical) to the current BillingPlan. */
export function canonicalizePlan(value: unknown): BillingPlan {
  if (isCanonicalBillingPlan(value)) return value;
  if (isLegacyBillingPlan(value)) return LEGACY_TO_CANONICAL[value];
  return "minimal";
}

export function getPlan(plan: BillingPlan): PlanCatalogEntry {
  return PLAN_CATALOG[canonicalizePlan(plan)];
}

export function planDisplayName(plan: BillingPlan): string {
  return getPlan(plan).name;
}

export function includedActiveAiMinutesForPlan(
  plan: BillingPlan,
): number | null {
  return getPlan(plan).includedActiveAiMinutes;
}

export function monthlyPriceUsdForPlan(plan: BillingPlan): number | null {
  return getPlan(plan).monthlyPriceUsd;
}

export function isSelfServePlan(plan: BillingPlan): boolean {
  return getPlan(plan).selfServe;
}

export function formatPlanPrice(plan: BillingPlan): string {
  const price = monthlyPriceUsdForPlan(plan);
  if (price == null) return "Custom";
  if (price <= 0) return "Free";
  return `$${price}/month`;
}

/** Relative AI usage label for plan cards (not raw minutes). */
export function formatPlanUsageLevel(plan: BillingPlan): string {
  return getPlan(plan).usageLevelLabel;
}

/**
 * @deprecated Prefer formatPlanUsageLevel for customer UI.
 * Kept for admin / metering diagnostics.
 */
export function formatIncludedActiveAiMinutes(plan: BillingPlan): string {
  const mins = includedActiveAiMinutesForPlan(plan);
  if (mins == null) return "Custom AI usage";
  return formatPlanUsageLevel(plan);
}

export const LIMITLESS_CONTACT_EMAIL = "matt@warix.co";
export const LIMITLESS_CONTACT_HREF = `mailto:${LIMITLESS_CONTACT_EMAIL}`;
