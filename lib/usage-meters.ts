import type { BillingPlan } from "@/lib/types";
import type { UsageFeatureCategory, UsageStatusFeature } from "@/lib/usage/types";

export type UsageMeterId = "chat" | "images" | "build";

export type UsageMeterTone = {
  bar: string;
  track: string;
};

export const USAGE_METER_TONES: Record<UsageMeterId, UsageMeterTone> = {
  chat: {
    bar: "bg-[oklch(0.62_0.17_255)] dark:bg-[oklch(0.72_0.14_255)]",
    track:
      "bg-[oklch(0.58_0.18_255/0.16)] dark:bg-[oklch(0.78_0.08_255/0.22)]",
  },
  images: {
    bar: "bg-[oklch(0.62_0.17_310)] dark:bg-[oklch(0.74_0.14_310)]",
    track:
      "bg-[oklch(0.58_0.18_310/0.16)] dark:bg-[oklch(0.78_0.08_310/0.22)]",
  },
  build: {
    bar: "bg-[oklch(0.62_0.15_155)] dark:bg-[oklch(0.74_0.13_155)]",
    track:
      "bg-[oklch(0.58_0.16_155/0.16)] dark:bg-[oklch(0.78_0.07_155/0.22)]",
  },
};

export type UsageMeterModel = {
  id: UsageMeterId;
  title: string;
  feature: UsageFeatureCategory;
  percent: number;
  detail: string;
  enabled: boolean;
  status?: UsageStatusFeature["status"];
};

function seededPercent(seed: number, min: number, span: number) {
  const n = Math.abs(Math.sin(seed * 12.9898) * 43758.5453);
  return Math.round(min + (n - Math.floor(n)) * span);
}

function demoMonthPercent(feature: UsageFeatureCategory, workspaceId: string) {
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
        percent: Math.min(100, row.percentUsed),
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
  return {
    percent: demoPercent,
    detail: `${Math.round(demoPercent)}% of allowance`,
  };
}

/** Chat / image / build meters for the Usage popup. */
export function buildUsageMeters(opts: {
  plan: BillingPlan;
  workspaceId: string;
  features: UsageStatusFeature[] | undefined;
}): UsageMeterModel[] {
  const find = (feature: UsageFeatureCategory) =>
    opts.features?.find((row) => row.feature === feature);

  const cards: {
    id: UsageMeterId;
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
    return {
      id,
      title,
      feature,
      percent: Math.max(0, Math.min(100, month.percent)),
      detail: row?.message ?? month.detail,
      enabled: row?.enabled !== false,
      status: row?.status,
    };
  });
}
