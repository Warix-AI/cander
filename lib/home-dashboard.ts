import type { BillingPlan } from "./types";
import type { UsageFeatureCategory, UsageStatusFeature } from "./usage/types";

export type HomeUsageCardId = "chat" | "images" | "build";

export type HomeUsageTone = {
  bar: string;
  track: string;
};

export const HOME_USAGE_TONES: Record<HomeUsageCardId, HomeUsageTone> = {
  chat: {
    bar: "bg-[oklch(0.58_0.18_255)]",
    track: "bg-[oklch(0.58_0.18_255/0.14)]",
  },
  images: {
    bar: "bg-[oklch(0.58_0.18_310)]",
    track: "bg-[oklch(0.58_0.18_310/0.14)]",
  },
  build: {
    bar: "bg-[oklch(0.58_0.16_155)]",
    track: "bg-[oklch(0.58_0.16_155/0.14)]",
  },
};

export type HomeUsageCardModel = {
  id: HomeUsageCardId;
  title: string;
  feature: UsageFeatureCategory;
  hourPercent: number;
  monthPercent: number;
  monthDetail: string;
  enabled: boolean;
  status?: UsageStatusFeature["status"];
};

export type HomePromo = {
  eyebrow: string;
  title: string;
  body: string;
  cta: string;
};

export type HomeUpdate = {
  id: string;
  when: string;
  title: string;
  body: string;
};

export type HomeRecommended = {
  id: string;
  title: string;
  body: string;
  space: "work" | "build" | "research" | "new_chat";
};

export function homePromoForPlan(plan: BillingPlan): HomePromo {
  if (plan === "free") {
    return {
      eyebrow: "Pro",
      title: "More capacity when you need it",
      body: "Voice, advanced memory, knowledge bases, and extra workspaces — same app, more power.",
      cta: "View plans",
    };
  }
  if (plan === "pro") {
    return {
      eyebrow: "Max",
      title: "Share workspaces with your team",
      body: "Invites, roles, shared knowledge, and maximum AI capacity for growing orgs.",
      cta: "Compare plans",
    };
  }
  return {
    eyebrow: "Studio",
    title: "Creative production is on the way",
    body: "Images, video, audio, and presentations — a dedicated Studio space, tied to chat.",
    cta: "Learn more",
  };
}

export const HOME_UPDATES: HomeUpdate[] = [
  {
    id: "studio-soon",
    when: "Coming soon",
    title: "Studio space",
    body: "A dedicated space for images, video, and audio — with chat and a right panel like Build.",
  },
  {
    id: "home-dash",
    when: "Today",
    title: "Home dashboard",
    body: "Usage at a glance, recommendations, and a quick view of what's in progress.",
  },
  {
    id: "explore",
    when: "This week",
    title: "Explore is back",
    body: "Research, browse, and sources live under Explore — separate from Studio.",
  },
  {
    id: "usage-v2",
    when: "Aug 2026",
    title: "Usage limits v2",
    body: "Plan-aware allowances for chat, builds, and image generation with clearer status.",
  },
];

export const HOME_RECOMMENDED: HomeRecommended[] = [
  {
    id: "work-inbox",
    title: "Catch up in Work",
    body: "Surface inbox, calendar, and customer threads in one place.",
    space: "work",
  },
  {
    id: "build-ship",
    title: "Ship something in Build",
    body: "Scaffold an app, preview it live, and iterate beside chat.",
    space: "build",
  },
  {
    id: "explore-research",
    title: "Start an Explore brief",
    body: "Collect sources, notes, and reports for your next decision.",
    space: "research",
  },
  {
    id: "new-chat",
    title: "Ask across spaces",
    body: "Open a new chat and route work into Work, Build, or Explore.",
    space: "new_chat",
  },
];

function seededPercent(seed: number, min: number, span: number) {
  const n = Math.abs(Math.sin(seed * 12.9898) * 43758.5453);
  return Math.round(min + (n - Math.floor(n)) * span);
}

export function demoHourPercent(feature: UsageFeatureCategory, now = Date.now()) {
  const hourKey = Math.floor(now / 3_600_000);
  const salt = feature.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return seededPercent(hourKey + salt, 8, 72);
}

export function demoMonthPercent(feature: UsageFeatureCategory, workspaceId: string) {
  const salt =
    workspaceId.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0) +
    feature.length * 17;
  return seededPercent(salt, 12, 58);
}

function monthDetailFromFeature(
  row: UsageStatusFeature | undefined,
  demoPercent: number,
  plan: BillingPlan,
): { percent: number; detail: string } {
  if (row?.enabled === false) {
    return { percent: 0, detail: "Not on your plan" };
  }
  if (row?.percentUsed != null) {
    const limit = row.monthlyLimit;
    if (limit == null) {
      const used = row.unitsUsed ?? 0;
      return {
        percent: Math.min(100, demoPercent),
        detail: used > 0 ? `${used.toLocaleString()} this month` : "Unlimited",
      };
    }
    const used = row.unitsUsed ?? 0;
    return {
      percent: row.percentUsed,
      detail: `${used.toLocaleString()} / ${limit.toLocaleString()}`,
    };
  }
  if (plan !== "free") {
    return { percent: demoPercent, detail: "Unlimited" };
  }
  return { percent: demoPercent, detail: `${Math.round(demoPercent * 1.5)}% of allowance` };
}

export function buildHomeUsageCards(opts: {
  plan: BillingPlan;
  workspaceId: string;
  features: UsageStatusFeature[] | undefined;
}): HomeUsageCardModel[] {
  const find = (feature: UsageFeatureCategory) =>
    opts.features?.find((row) => row.feature === feature);

  const cards: {
    id: HomeUsageCardId;
    title: string;
    feature: UsageFeatureCategory;
  }[] = [
    { id: "chat", title: "Chat usage", feature: "ai_chat" },
    { id: "images", title: "Image usage", feature: "image_generation" },
    { id: "build", title: "Build usage", feature: "sandbox_build" },
  ];

  return cards.map(({ id, title, feature }) => {
    const row = find(feature);
    const demoMonth = demoMonthPercent(feature, opts.workspaceId);
    const month = monthDetailFromFeature(row, demoMonth, opts.plan);
    const enabled = row?.enabled !== false;
    return {
      id,
      title,
      feature,
      hourPercent: demoHourPercent(feature),
      monthPercent: month.percent,
      monthDetail: month.detail,
      enabled,
      status: row?.status,
    };
  });
}
