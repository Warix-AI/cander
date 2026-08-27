import {
  hasKnowledgeBases,
  hasVoice,
  planComparisonRows,
  workspaceLimit,
} from "./plan-entitlements";
import { BILLING_PLANS } from "./plans";
import type { BillingPlan, Member } from "./types";

export const ALL_PLANS: BillingPlan[] = BILLING_PLANS;

export const courierSeat: Record<BillingPlan, number> = {
  free: 0,
  pro: 20,
  max: 50,
};

export const courierPlans: {
  id: BillingPlan;
  name: string;
  price: number;
  audience: string;
  blurb: string;
  cta: string;
  popular?: boolean;
}[] = [
  {
    id: "free",
    name: "Free",
    price: 0,
    audience: "Cander",
    blurb: "The full app — Work, Build, Explore, and Connectors.",
    cta: "Start free",
  },
  {
    id: "pro",
    name: "Pro",
    price: 20,
    audience: "More powerful Cander",
    blurb: "Voice, memory, knowledge bases, and more workspaces.",
    cta: "Choose Pro",
    popular: true,
  },
  {
    id: "max",
    name: "Max",
    price: 50,
    audience: "Most powerful Cander",
    blurb: "Maximum AI capacity plus teams, sharing, and organization controls.",
    cta: "Choose Max",
  },
];

/** Flat comparison matrix — every cell is boolean (✓ / × in UI). */
export const comparisonRows = planComparisonRows();

export const pricingFaqs: { q: string; a: string }[] = [
  {
    q: "Is every plan the same app?",
    a: "Yes. Free, Pro, and Max all use the same Cander application — Work, Build, Explore, Connectors, and more. Plans increase power and collaboration, not separate products.",
  },
  {
    q: "What changes between plans?",
    a: "AI capacity, voice, memory, workspace count, and — on Max — shared workspaces, invites, roles, and organization controls.",
  },
  {
    q: "Can I use personal and business workspaces on any plan?",
    a: "Workspaces are on Pro and Max. Free uses the app without a workspace switcher. Max adds shared workspaces, invites, and organization controls.",
  },
  {
    q: "How do I upgrade on iPhone?",
    a: "Settings → Plan shows your current plan. Tap View subscription to manage billing on the web in Safari.",
  },
  {
    q: "Need something custom?",
    a: "Enterprise is request-only. Email enterprise@thinkrecursion.ai.",
  },
];

export function money(n: number) {
  return `$${n.toLocaleString()}`;
}

export function planLabel(plan: BillingPlan) {
  return courierPlans.find((item) => item.id === plan)?.name ?? "Pro";
}

export function hasWorkspaceKnowledge(plan: BillingPlan) {
  return hasKnowledgeBases(plan);
}

export function workspaceCap(plan: BillingPlan) {
  return workspaceLimit(plan);
}

export { hasVoice };

export type SeatMix = Record<BillingPlan, number>;

export function orgSeatMix(members: Member[]): SeatMix {
  const mix: SeatMix = { free: 0, pro: 0, max: 0 };
  for (const member of members) {
    if (member.kind !== "org" || member.seatStatus !== "active") continue;
    mix[member.plan] += 1;
  }
  return mix;
}

export function seatMixLabel(mix: SeatMix) {
  return ALL_PLANS.filter((plan) => mix[plan] > 0).map(
    (plan) => `${mix[plan]} ${planLabel(plan)}`,
  );
}

export function billingFor(
  opts?: {
    users?: number;
    plan?: BillingPlan;
    seatMix?: SeatMix;
  },
) {
  const mix =
    opts?.seatMix ??
    ({
      free: 0,
      pro: 0,
      max: opts?.plan === "max" ? (opts?.users ?? 1) : 0,
    } satisfies SeatMix);
  if (opts?.plan && !opts?.seatMix) {
    mix.free = 0;
    mix.pro = 0;
    mix.max = 0;
    if (opts.plan === "pro") mix.pro = opts.users ?? 1;
    else if (opts.plan === "max") mix.max = opts.users ?? 1;
    else if (opts.plan === "free") mix.free = opts.users ?? 1;
  }
  const users = Object.values(mix).reduce((sum, count) => sum + count, 0);
  const courier = ALL_PLANS.reduce(
    (sum, plan) => sum + mix[plan] * courierSeat[plan],
    0,
  );
  const primary =
    opts?.plan ?? (mix.max ? "max" : mix.pro ? "pro" : "free");
  return {
    users,
    seat: courierSeat[primary],
    seatMix: mix,
    courier,
    total: courier,
    plan: primary,
  };
}
