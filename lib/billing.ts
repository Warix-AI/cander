import { account } from "./data";
import {
  capabilitiesFor,
  canAccessDevelopment as planCanAccessDevelopment,
  hasConnectorPolicies as planHasConnectorPolicies,
  hasModelChoice as planHasModelChoice,
  hasVoice as planHasVoice,
  hasWorkSpace as planHasWorkSpace,
  hasWorkspaceKnowledge as planHasWorkspaceKnowledge,
  hasWorkspaces as planHasWorkspaces,
  hostingAllowed as planHostingAllowed,
  isTeamPlan as planIsTeamPlan,
  platformNavAllowed as planPlatformNavAllowed,
  workspaceCap as planWorkspaceCap,
} from "./plan-entitlements";
import type { BillingPlan, HostingMode, Member, PlatformNav } from "./types";

export type BillingCycle = "month" | "year";
export type CompareValue = boolean | string;

export const ALL_PLANS: BillingPlan[] = ["free", "pro", "max", "ultra"];

export const courierSeat: Record<BillingPlan, number> = {
  free: 0,
  pro: 20,
  max: 50,
  ultra: 300,
};

export const courierPlans: {
  id: BillingPlan;
  name: string;
  price: number;
  audience: string;
  blurb: string;
  cta: string;
  popular?: boolean;
  includes?: string;
  points: string[];
}[] = [
  {
    id: "free",
    name: "Free",
    price: 0,
    audience: "Get started",
    blurb: "Get started with Courier.",
    cta: "Start free",
    points: [
      "Chat",
      "Build",
      "Studio",
      "Research",
      "Personal",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: 20,
    audience: "Everyday use",
    blurb: "Full Courier for individuals.",
    cta: "Choose Pro",
    popular: true,
    includes: "Everything in Free, plus",
    points: [
      "Voice",
      "Workspaces",
      "Knowledge bases",
      "APIs and keys",
      "Local",
      "On-device",
    ],
  },
  {
    id: "max",
    name: "Max",
    price: 50,
    audience: "Teams & power users",
    blurb: "Courier for professionals and teams.",
    cta: "Choose Max",
    includes: "Everything in Pro, plus",
    points: [
      "Work",
      "Shared workspaces",
      "Invite members",
      "Roles and permissions",
      "Shared dev resources",
      "Org admin and audit",
    ],
  },
  {
    id: "ultra",
    name: "Ultra",
    price: 300,
    audience: "Production AI",
    blurb: "Build and run production AI with Courier.",
    cta: "Choose Ultra",
    includes: "Everything in Max, plus",
    points: [
      "Production APIs and keys",
      "Production hosting",
      "Infrastructure management",
      "Full models, logs, and usage",
      "Shared infrastructure for the team",
    ],
  },
];

/** Paid plans shown in-app. Free is marketing-site only. */
export const appPlans = courierPlans.filter((plan) => plan.id !== "free");

const allPlans = (values: Record<BillingPlan, CompareValue>) => values;

export const comparisonGroups: {
  id: string;
  label: string;
  rows: { label: string; hint?: string; values: Record<BillingPlan, CompareValue> }[];
}[] = [
  {
    id: "chat",
    label: "Chat & Voice",
    rows: [
      {
        label: "Chat",
        values: allPlans({ free: true, pro: true, max: true, ultra: true }),
      },
      {
        label: "Voice",
        values: allPlans({ free: false, pro: true, max: true, ultra: true }),
      },
    ],
  },
  {
    id: "spaces",
    label: "Spaces",
    rows: [
      {
        label: "Build",
        values: allPlans({ free: true, pro: true, max: true, ultra: true }),
      },
      {
        label: "Studio",
        values: allPlans({ free: true, pro: true, max: true, ultra: true }),
      },
      {
        label: "Research",
        values: allPlans({ free: true, pro: true, max: true, ultra: true }),
      },
      {
        label: "Personal",
        values: allPlans({ free: true, pro: true, max: true, ultra: true }),
      },
      {
        label: "Work",
        values: allPlans({ free: false, pro: false, max: true, ultra: true }),
      },
    ],
  },
  {
    id: "courier",
    label: "Courier",
    rows: [
      {
        label: "Connectors",
        values: allPlans({ free: true, pro: true, max: true, ultra: true }),
      },
      {
        label: "Workspaces",
        values: allPlans({ free: false, pro: true, max: true, ultra: true }),
      },
      {
        label: "Knowledge bases",
        values: allPlans({ free: false, pro: true, max: true, ultra: true }),
      },
      {
        label: "Shared workspaces",
        values: allPlans({ free: false, pro: false, max: true, ultra: true }),
      },
      {
        label: "Invite members",
        values: allPlans({ free: false, pro: false, max: true, ultra: true }),
      },
      {
        label: "Roles",
        values: allPlans({ free: false, pro: false, max: true, ultra: true }),
      },
      {
        label: "Permissions",
        values: allPlans({ free: false, pro: false, max: true, ultra: true }),
      },
      {
        label: "Shared spaces",
        values: allPlans({ free: false, pro: false, max: true, ultra: true }),
      },
      {
        label: "Connector policies",
        values: allPlans({ free: false, pro: false, max: true, ultra: true }),
      },
      {
        label: "Org admin",
        values: allPlans({ free: false, pro: false, max: true, ultra: true }),
      },
      {
        label: "Audit",
        values: allPlans({ free: false, pro: false, max: true, ultra: true }),
      },
    ],
  },
  {
    id: "platform",
    label: "Development",
    rows: [
      {
        label: "Development view",
        values: allPlans({ free: false, pro: true, max: true, ultra: true }),
      },
      {
        label: "APIs",
        values: allPlans({ free: false, pro: true, max: true, ultra: true }),
      },
      {
        label: "Keys",
        values: allPlans({ free: false, pro: true, max: true, ultra: true }),
      },
      {
        label: "Local hosting",
        values: allPlans({ free: false, pro: true, max: true, ultra: true }),
      },
      {
        label: "On-device hosting",
        values: allPlans({ free: false, pro: true, max: true, ultra: true }),
      },
      {
        label: "Models",
        values: allPlans({ free: false, pro: false, max: true, ultra: true }),
      },
      {
        label: "Team deploys",
        values: allPlans({ free: false, pro: false, max: true, ultra: true }),
      },
      {
        label: "Use shared resources",
        values: allPlans({ free: false, pro: false, max: true, ultra: true }),
      },
      {
        label: "Logs",
        values: allPlans({ free: false, pro: false, max: true, ultra: true }),
      },
      {
        label: "Usage",
        values: allPlans({ free: false, pro: false, max: true, ultra: true }),
      },
      {
        label: "Docs",
        values: allPlans({ free: false, pro: false, max: true, ultra: true }),
      },
      {
        label: "Test deploys",
        values: allPlans({ free: false, pro: false, max: false, ultra: true }),
      },
      {
        label: "Production models",
        values: allPlans({ free: false, pro: false, max: false, ultra: true }),
      },
      {
        label: "Production APIs",
        values: allPlans({ free: false, pro: false, max: false, ultra: true }),
      },
      {
        label: "Production keys",
        values: allPlans({ free: false, pro: false, max: false, ultra: true }),
      },
      {
        label: "Production deploys",
        values: allPlans({ free: false, pro: false, max: false, ultra: true }),
      },
      {
        label: "Production serving",
        values: allPlans({ free: false, pro: false, max: false, ultra: true }),
      },
      {
        label: "Infrastructure management",
        values: allPlans({ free: false, pro: false, max: false, ultra: true }),
      },
      {
        label: "Full logs",
        values: allPlans({ free: false, pro: false, max: false, ultra: true }),
      },
      {
        label: "Full usage",
        values: allPlans({ free: false, pro: false, max: false, ultra: true }),
      },
    ],
  },
  {
    id: "hosting",
    label: "Hosting & usage",
    rows: [
      {
        label: "Cloud",
        values: allPlans({ free: true, pro: true, max: true, ultra: true }),
      },
      {
        label: "Local",
        values: allPlans({ free: false, pro: true, max: true, ultra: true }),
      },
      {
        label: "On-device",
        values: allPlans({ free: false, pro: true, max: true, ultra: true }),
      },
    ],
  },
];

export const pricingFaqs: { q: string; a: string }[] = [
  {
    q: "Is hosting a plan?",
    a: "No. Cloud, Local, and On-device are compute locations — where inference runs — not plans. Cloud is on every plan. Permission to use Local or On-device starts on Pro. Production serving is an Ultra capability, on whatever hardware can run it.",
  },
  {
    q: "Who gets Work?",
    a: "Work is Max and Ultra — for teams and power users. Voice starts on Pro. Free includes Chat, Build, Studio, Research, and Personal.",
  },
  {
    q: "What’s development on each plan?",
    a: "Development starts on Pro — APIs, keys, and local or on-device hosting, on one shared model. Max adds the model catalog, team deploys, docs, and logs. Ultra unlocks test and production deploys, production APIs, and infrastructure management. Free has no Development.",
  },
  {
    q: "When can we share workspaces?",
    a: "Workspaces and knowledge bases start on Pro. Shared workspaces start on Max.",
  },
  {
    q: "What’s Ultra?",
    a: "Ultra is a full plan at $300 per user per month — not an add-on. Ultra members can manage production infrastructure and authorize teammates to use shared models and deployments.",
  },
  {
    q: "Need something custom?",
    a: "Enterprise is request-only — SSO, residency, SLAs, and anything that isn’t on a public plan. Email enterprise@thinkrecursion.ai.",
  },
];

export const hostingModes: {
  id: HostingMode;
  label: string;
  title: string;
  body: string;
  why: string;
  traits: string[];
  action: string;
}[] = [
  {
    id: "cloud",
    label: "Cloud",
    title: "Cloud Hosting",
    body: "Recursion AI operates the models. You call them; we run the metal.",
    why: "Included metered compute on every plan — subject to fair-use limits and overages.",
    traits: [
      "Hosted regions, we operate the runtime",
      "Same OpenAI-compatible surface",
      "No servers to license or patch",
    ],
    action: "Use Cloud Hosting",
  },
  {
    id: "local",
    label: "Local",
    title: "Local Hosting",
    body: "Your network, your machines. Other devices on the LAN can tie in.",
    why: "Unlimited AI on your hardware — inference is only limited by what the machine can run.",
    traits: [
      "Servers on this network",
      "Team devices share the same runtime",
      "Tokens stay on the LAN",
    ],
    action: "Configure Local Hosting",
  },
  {
    id: "on-device",
    label: "On-Device",
    title: "On-Device Hosting",
    body: "Inference runs on each person’s machine. Private, offline-capable.",
    why: "Unlimited AI on the device — private, offline-capable, bounded only by hardware.",
    traits: [
      "Runs per device",
      "Nothing leaves the machine",
      "Works without a network hop",
    ],
    action: "Configure On-Device",
  },
];

export function money(n: number) {
  return `$${n.toLocaleString()}`;
}

export function hostingLabel(mode: HostingMode) {
  return hostingModes.find((item) => item.id === mode)?.title ?? "Hosting";
}

export function licensedHint(mode: HostingMode, users: number) {
  if (mode === "cloud") return "1 region · hosted by Recursion AI";
  if (mode === "local") return "2 licensed servers · office LAN";
  return `${users} devices`;
}

export function planLabel(plan: BillingPlan) {
  return courierPlans.find((item) => item.id === plan)?.name ?? "Pro";
}

export function hasWorkSpace(plan: BillingPlan) {
  return planHasWorkSpace(plan);
}

export function isTeamPlan(plan: BillingPlan) {
  return planIsTeamPlan(plan);
}

export function hasWorkspaceKnowledge(plan: BillingPlan) {
  return planHasWorkspaceKnowledge(plan);
}

export function hasVoice(plan: BillingPlan) {
  return planHasVoice(plan);
}

export function hasLimitedPlatform(plan: BillingPlan) {
  return planCanAccessDevelopment(plan);
}

export function hostingAllowed(plan: BillingPlan, mode: HostingMode) {
  return planHostingAllowed(plan, mode);
}

export function platformNavAllowed(
  plan: BillingPlan,
  nav: PlatformNav,
  _ultra = false,
) {
  return planPlatformNavAllowed(plan, nav);
}

export function hasModelChoice(plan: BillingPlan) {
  return planHasModelChoice(plan);
}

export function hasWorkspaces(plan: BillingPlan) {
  return planHasWorkspaces(plan);
}

export function hasConnectorPolicies(plan: BillingPlan) {
  return planHasConnectorPolicies(plan);
}

export function workspaceCap(plan: BillingPlan) {
  return planWorkspaceCap(plan);
}

export function cycleAmount(monthly: number, cycle: BillingCycle) {
  return cycle === "year" ? monthly * 12 : monthly;
}

export function cycleSuffix(cycle: BillingCycle) {
  return cycle === "year" ? "/year" : "/month";
}

export type SeatMix = Record<BillingPlan, number>;

export function orgSeatMix(members: Member[]): SeatMix {
  const mix: SeatMix = { free: 0, pro: 0, max: 0, ultra: 0 };
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
  mode: HostingMode,
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
      ultra: opts?.plan === "ultra" ? (opts?.users ?? 1) : 0,
    } satisfies SeatMix);
  if (opts?.plan && !opts?.seatMix) {
    mix.free = 0;
    mix.pro = 0;
    mix.max = 0;
    mix.ultra = 0;
    if (opts.plan === "pro") {
      mix.pro = opts.users ?? 1;
    } else if (opts.plan === "max") {
      mix.max = opts.users ?? 1;
    } else if (opts.plan === "ultra") {
      mix.ultra = opts.users ?? 1;
    } else if (opts.plan === "free") {
      mix.free = opts.users ?? 1;
    }
  }
  const users = Object.values(mix).reduce((sum, count) => sum + count, 0);
  const courier = ALL_PLANS.reduce(
    (sum, plan) => sum + mix[plan] * courierSeat[plan],
    0,
  );
  const primary =
    opts?.plan ??
    (mix.ultra ? "ultra" : mix.max ? "max" : mix.pro ? "pro" : "free");
  const seat = courierSeat[primary];
  return {
    users,
    seat,
    seatMix: mix,
    courier,
    total: courier,
    plan: primary,
    deployments: licensedHint(mode, users),
    apis: hostedApis,
  };
}

export const hostedApis = [
  "chat.completions",
  "embeddings",
  "images.generations",
];

export function productionTier(plan: BillingPlan) {
  return capabilitiesFor(plan).productionServing;
}
