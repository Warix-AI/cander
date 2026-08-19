import { account } from "./data";
import type { BillingPlan, HostingMode, PlatformNav } from "./types";

export type BillingCycle = "month" | "year";
export type CompareValue = boolean | string;

export const courierSeat: Record<BillingPlan, number> = {
  free: 0,
  plus: 20,
  pro: 50,
};

export const PLATFORM_ULTRA = 599;

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
    blurb: "Chat, Spaces, and Cloud.",
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
    id: "plus",
    name: "Plus",
    price: 20,
    audience: "Everyday use",
    blurb: "Full Courier for individuals. Limited Platform.",
    cta: "Choose Plus",
    popular: true,
    includes: "Everything in Free, plus",
    points: [
      "Voice",
      "Workspaces",
      "Knowledge bases",
      "Local",
      "On-device",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: 50,
    audience: "Teams & power users",
    blurb: "Work, shared workspaces, and the full toolkit for heavy hitters.",
    cta: "Choose Pro",
    includes: "Everything in Plus, plus",
    points: [
      "Work",
      "Shared workspaces",
      "Invite members",
      "Roles and permissions",
      "Org admin and audit",
    ],
  },
];

export const comparisonGroups: {
  id: string;
  label: string;
  rows: { label: string; hint?: string; values: Record<BillingPlan, CompareValue> }[];
}[] = [
  {
    id: "chat",
    label: "Chat & Voice",
    rows: [
      { label: "Chat", values: { free: true, plus: true, pro: true } },
      { label: "Voice", values: { free: false, plus: true, pro: true } },
    ],
  },
  {
    id: "spaces",
    label: "Spaces",
    rows: [
      { label: "Build", values: { free: true, plus: true, pro: true } },
      { label: "Studio", values: { free: true, plus: true, pro: true } },
      { label: "Research", values: { free: true, plus: true, pro: true } },
      { label: "Personal", values: { free: true, plus: true, pro: true } },
      { label: "Work", values: { free: false, plus: false, pro: true } },
    ],
  },
  {
    id: "courier",
    label: "Courier",
    rows: [
      { label: "Connectors", values: { free: true, plus: true, pro: true } },
      { label: "Workspaces", values: { free: false, plus: true, pro: true } },
      {
        label: "Knowledge bases",
        values: { free: false, plus: true, pro: true },
      },
      {
        label: "Shared workspaces",
        values: { free: false, plus: false, pro: true },
      },
      { label: "Invite members", values: { free: false, plus: false, pro: true } },
      { label: "Roles", values: { free: false, plus: false, pro: true } },
      { label: "Permissions", values: { free: false, plus: false, pro: true } },
      {
        label: "Shared spaces",
        values: { free: false, plus: false, pro: true },
      },
      {
        label: "Connector policies",
        values: { free: false, plus: false, pro: true },
      },
      { label: "Org admin", values: { free: false, plus: false, pro: true } },
      { label: "Audit", values: { free: false, plus: false, pro: true } },
    ],
  },
  {
    id: "platform",
    label: "Courier Platform",
    rows: [
      { label: "APIs", values: { free: false, plus: true, pro: true } },
      { label: "Keys", values: { free: false, plus: true, pro: true } },
      { label: "Deployments", values: { free: false, plus: true, pro: true } },
      { label: "Docs", values: { free: false, plus: true, pro: true } },
      { label: "Models", values: { free: false, plus: false, pro: true } },
      { label: "Logs", values: { free: false, plus: false, pro: true } },
      { label: "Usage", values: { free: false, plus: false, pro: true } },
    ],
  },
  {
    id: "hosting",
    label: "Hosting & usage",
    rows: [
      {
        label: "Cloud",
        values: { free: true, plus: true, pro: true },
      },
      {
        label: "Local",
        values: { free: false, plus: true, pro: true },
      },
      {
        label: "On-device",
        values: { free: false, plus: true, pro: true },
      },
    ],
  },
];

export const platformUltra = {
  name: "Ultra",
  price: PLATFORM_ULTRA,
  audience: "Add-on · per person",
  blurb:
    "Each Ultra is one licensed person with unlimited, full Courier Platform — Local or On-device. Production APIs, keys, models, apps, and runtime. Unassigned licenses do nothing.",
  points: [
    "Assigned to one person",
    "Unlimited Platform on Local or On-device",
    "Production APIs and keys",
    "Models, apps, deployments, and logs",
  ],
};

export const pricingFaqs: { q: string; a: string }[] = [
  {
    q: "Is hosting a plan?",
    a: "No. Cloud, Local, and On-device are how inference runs. Cloud is on every plan. Local and On-device start on Plus. Courier Platform also starts on Plus.",
  },
  {
    q: "Who gets Work?",
    a: "Work is Pro — for teams and power users. Voice starts on Plus. Free includes Chat, Build, Studio, Research, and Personal.",
  },
  {
    q: "What’s Limited Platform?",
    a: "Plus includes APIs, Keys, Deployments, and Docs — one shared model, no picker. Logs and Usage are Pro, and Usage splits by account. Ultra on Plus or Pro unlocks Models, Logs, and Usage on the Platform. Free has none of that.",
  },
  {
    q: "When can we share workspaces?",
    a: "Workspaces and knowledge bases start on Plus. Shared workspaces start on Pro.",
  },
  {
    q: "What’s Ultra?",
    a: "Ultra is a Plus or Pro add-on — $599 per license per month. Each license must be assigned to one person. That person gets unlimited, full Courier Platform on Local or On-device. Unassigned licenses do nothing. Courier seats stay separate. Free cannot hold Ultra.",
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
    why: "Included metered compute on every plan. Fair-use overages if you need more.",
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
    why: "Effectively unlimited inference — your hardware provides the compute.",
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
    why: "Effectively unlimited inference on the end-user device.",
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
  return courierPlans.find((item) => item.id === plan)?.name ?? "Plus";
}

export function hasWorkSpace(plan: BillingPlan) {
  return plan === "pro";
}

export function isTeamPlan(plan: BillingPlan) {
  return plan === "pro";
}

export function hasWorkspaceKnowledge(plan: BillingPlan) {
  return plan !== "free";
}

export function hasVoice(plan: BillingPlan) {
  return plan !== "free";
}

export function hasLimitedPlatform(plan: BillingPlan) {
  return plan !== "free";
}

export function hostingAllowed(plan: BillingPlan, mode: HostingMode) {
  if (mode === "cloud") return true;
  return plan !== "free";
}

export function platformNavAllowed(
  plan: BillingPlan,
  nav: PlatformNav,
  ultra = false,
) {
  if (!hasLimitedPlatform(plan)) return false;
  if (nav === "models" || nav === "logs" || nav === "usage") {
    return plan === "pro" || ultra;
  }
  return true;
}

export function hasModelChoice(plan: BillingPlan) {
  return plan === "pro";
}

export function hasWorkspaces(plan: BillingPlan) {
  return plan !== "free";
}

export function hasConnectorPolicies(plan: BillingPlan) {
  return plan === "pro";
}

export function canHoldUltra(plan: BillingPlan) {
  return plan !== "free";
}

export function workspaceCap(plan: BillingPlan) {
  if (plan === "free") return 0;
  if (plan === "plus") return 3;
  return Infinity;
}

export function cycleAmount(monthly: number, cycle: BillingCycle) {
  return cycle === "year" ? monthly * 12 : monthly;
}

export function cycleSuffix(cycle: BillingCycle) {
  return cycle === "year" ? "/year" : "/month";
}

export function billingFor(
  mode: HostingMode,
  opts?: {
    users?: number;
    courierEnabled?: boolean;
    apiEnabled?: boolean;
    ultraLicenses?: number;
    ultraDevices?: number;
    plan?: BillingPlan;
  },
) {
  const users = opts?.users ?? account.seats;
  const courierEnabled = opts?.courierEnabled ?? true;
  const apiEnabled = opts?.apiEnabled ?? true;
  const ultraCount = Math.max(
    0,
    opts?.ultraLicenses ?? opts?.ultraDevices ?? 0,
  );
  const plan = opts?.plan ?? "pro";
  const seat = courierSeat[plan];
  const ultraSeat = PLATFORM_ULTRA;
  const courier = courierEnabled ? users * seat : 0;
  const devices = apiEnabled ? ultraCount : 0;
  const api = devices * ultraSeat;
  return {
    users,
    seat,
    ultraSeat,
    ultraDevices: devices,
    ultraLicenses: devices,
    license: ultraSeat,
    courier,
    api,
    total: courier + api,
    courierEnabled,
    apiEnabled,
    plan,
    deployments: licensedHint(mode, users),
    apis: hostedApis,
  };
}

export const hostedApis = [
  "chat.completions",
  "embeddings",
  "images.generations",
];
