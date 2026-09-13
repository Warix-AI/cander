import {
  hasKnowledgeBases,
  hasVoice,
  planComparisonRows,
  workspaceLimit,
} from "./plan-entitlements";
import {
  PLAN_CATALOG_LIST,
  formatPlanPrice,
  planDisplayName,
  type PlanCatalogEntry,
} from "@/lib/billing/plan-catalog";
import { BILLING_PLANS, ALL_BILLING_PLANS } from "./plans";
import type { BillingPlan, Member } from "./types";

export const ALL_PLANS = BILLING_PLANS;

/** Seat cost hints for org mix (display); Limitless is custom. */
export const courierSeat: Record<BillingPlan, number> = {
  minimal: 0,
  light: 15,
  moderate: 50,
  heavy: 125,
  limitless: 0,
};

/** Marketing / pricing cards from the canonical catalog (includes Limitless). */
export const courierPlans: {
  id: BillingPlan;
  name: string;
  price: number | null;
  audience: string;
  blurb: string;
  cta: string;
  popular?: boolean;
  includedActiveAiMinutes: number | null;
}[] = PLAN_CATALOG_LIST.map((p: PlanCatalogEntry) => ({
  id: p.id,
  name: p.name,
  price: p.monthlyPriceUsd,
  audience: p.name,
  blurb: p.blurb,
  cta: p.ctaLabel,
  popular: p.popular,
  includedActiveAiMinutes: p.includedActiveAiMinutes,
}));

/** Flat comparison matrix — every cell is boolean (✓ / × in UI). */
export const comparisonRows = planComparisonRows();

export const pricingFaqs: { q: string; a: string }[] = [
  {
    q: "Is every plan the same app?",
    a: "Yes. Minimal through Heavy (and Limitless) all use the same Cander application. Minimal has personal-use limits; every paid plan unlocks the full product — plans then differ mainly by included AI usage.",
  },
  {
    q: "What changes between plans?",
    a: "Minimal is feature-limited (1 account per app, no organizations or shared workspaces). Light, Moderate, and Heavy are full Cander — they differ by included AI usage. Limitless is custom scale.",
  },
  {
    q: "Can I use organizations on Light?",
    a: "Yes. Organizations, shared workspaces, and multiple accounts per app are included on every paid plan.",
  },
  {
    q: "How do I upgrade on iPhone?",
    a: "Settings → Plan shows your current plan. Tap View subscription to manage billing on the web in Safari.",
  },
  {
    q: "Need something custom?",
    a: "Limitless is request-only. Email enterprise@thinkrecursion.ai.",
  },
];

export function money(n: number) {
  return `$${n.toLocaleString()}`;
}

export function planLabel(plan: BillingPlan) {
  return planDisplayName(plan);
}

export function hasWorkspaceKnowledge(plan: BillingPlan) {
  return hasKnowledgeBases(plan);
}

export function workspaceCap(plan: BillingPlan) {
  return workspaceLimit(plan);
}

export { hasVoice, formatPlanPrice };

export type SeatMix = Record<BillingPlan, number>;

export function orgSeatMix(members: Member[]): SeatMix {
  const mix: SeatMix = {
    minimal: 0,
    light: 0,
    moderate: 0,
    heavy: 0,
    limitless: 0,
  };
  for (const member of members) {
    const plan = member.plan as BillingPlan | undefined;
    if (plan && plan in mix) mix[plan] += 1;
  }
  return mix;
}

export function formatSeatMix(mix: SeatMix): string {
  return ALL_BILLING_PLANS.filter((plan) => mix[plan] > 0)
    .map((plan) => `${mix[plan]} ${planLabel(plan)}`)
    .join(" · ");
}

export function seatCost(mix: SeatMix): number {
  return (Object.keys(mix) as BillingPlan[]).reduce(
    (sum, plan) => sum + mix[plan] * courierSeat[plan],
    0,
  );
}

export function demoSeatMix(): SeatMix {
  return {
    minimal: 0,
    light: 2,
    moderate: 1,
    heavy: 0,
    limitless: 0,
  };
}

export function orgInvitePlanOptions(): Array<"light" | "moderate"> {
  return ["light", "moderate"];
}
