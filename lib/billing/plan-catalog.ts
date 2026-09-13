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
    includedActiveAiMinutes: 20,
    usageLevelLabel: "Light AI usage",
    selfServe: true,
    ctaLabel: "Start Free",
    blurb:
      "Personal use — unlimited apps, 1 account per app. No organizations or shared workspaces.",
    polarProductId: null,
    polarPriceId: null,
  },
  light: {
    id: "light",
    name: "Light",
    monthlyPriceUsd: 15,
    includedActiveAiMinutes: 30,
    usageLevelLabel: "Everyday AI usage",
    selfServe: true,
    ctaLabel: "Choose Light",
    blurb:
      "Full Cander — organizations, shared workspaces, and multiple accounts per app.",
    popular: true,
    polarProductId: null,
    polarPriceId: null,
  },
  moderate: {
    id: "moderate",
    name: "Moderate",
    monthlyPriceUsd: 50,
    includedActiveAiMinutes: 100,
    usageLevelLabel: "Higher AI usage",
    selfServe: true,
    ctaLabel: "Choose Moderate",
    blurb: "Full Cander with more included AI usage for regular work.",
    polarProductId: null,
    polarPriceId: null,
  },
  heavy: {
    id: "heavy",
    name: "Heavy",
    monthlyPriceUsd: 125,
    includedActiveAiMinutes: 250,
    usageLevelLabel: "Highest self-serve AI usage",
    selfServe: true,
    ctaLabel: "Choose Heavy",
    blurb: "Full Cander with the most included AI usage on self-serve.",
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
    blurb:
      "Custom pricing and AI usage for larger organizations.",
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
