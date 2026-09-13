/**
 * Minutes-first pricing + plan classification.
 * Single source of truth for band boundaries and price math.
 * Edit PLAN_MINUTE_BANDS / PRICE_ANCHORS here — do not scatter range checks in UI.
 */

import type { BillingPlan } from "@/lib/types";

export type PlanMinuteBand = {
  id: BillingPlan;
  /** Inclusive lower bound (minutes). */
  min: number;
  /** Inclusive upper bound; null = unbounded (enterprise). */
  max: number | null;
};

/**
 * Contiguous classification bands. Gaps/overlaps must be fixed here only.
 * Provisional — easy to edit later.
 */
export const PLAN_MINUTE_BANDS: readonly PlanMinuteBand[] = [
  { id: "free", min: 0, max: 10 },
  { id: "pro", min: 11, max: 50 },
  { id: "max", min: 51, max: 150 },
  { id: "ultra", min: 151, max: 500 },
  { id: "enterprise", min: 501, max: null },
] as const;

/** Self-serve slider / purchase range (enterprise is not self-serve). */
export const SELF_SERVE_MIN_MINUTES = 0;
export const SELF_SERVE_MAX_MINUTES = 500;
export const SELF_SERVE_MINUTE_STEP = 10;

/** Price curve anchors (monthly USD). Linear between points. */
const PRICE_ANCHORS: readonly { minutes: number; priceUsd: number }[] = [
  { minutes: 0, priceUsd: 0 },
  { minutes: 10, priceUsd: 0 },
  { minutes: 50, priceUsd: 20 },
  { minutes: 150, priceUsd: 50 },
  { minutes: 500, priceUsd: 150 },
];

export function clampPurchasableMinutes(raw: number): number {
  const n = Number.isFinite(raw) ? Math.round(raw) : 0;
  const stepped =
    Math.round(n / SELF_SERVE_MINUTE_STEP) * SELF_SERVE_MINUTE_STEP;
  return Math.min(
    SELF_SERVE_MAX_MINUTES,
    Math.max(SELF_SERVE_MIN_MINUTES, stepped),
  );
}

/** Classification derived from purchased minutes — not a product SKU. */
export function planForMinutes(minutes: number): BillingPlan {
  const m = Math.max(0, Math.round(minutes));
  for (const band of PLAN_MINUTE_BANDS) {
    if (m < band.min) continue;
    if (band.max == null || m <= band.max) return band.id;
  }
  return "enterprise";
}

/** Monthly USD for a minute allowance (authoritative client + server math). */
export function priceForMinutes(minutes: number): number {
  const m = Math.max(0, minutes);
  if (m <= PRICE_ANCHORS[0]!.minutes) return PRICE_ANCHORS[0]!.priceUsd;

  for (let i = 0; i < PRICE_ANCHORS.length - 1; i++) {
    const a = PRICE_ANCHORS[i]!;
    const b = PRICE_ANCHORS[i + 1]!;
    if (m <= b.minutes) {
      const span = b.minutes - a.minutes;
      if (span <= 0) return b.priceUsd;
      const t = (m - a.minutes) / span;
      return roundCents(a.priceUsd + t * (b.priceUsd - a.priceUsd));
    }
  }
  return PRICE_ANCHORS[PRICE_ANCHORS.length - 1]!.priceUsd;
}

export function minutesArePurchasable(minutes: number): boolean {
  if (!Number.isFinite(minutes)) return false;
  const m = Math.round(minutes);
  if (m < SELF_SERVE_MIN_MINUTES || m > SELF_SERVE_MAX_MINUTES) return false;
  if (m % SELF_SERVE_MINUTE_STEP !== 0) return false;
  return planForMinutes(m) !== "enterprise";
}

function roundCents(n: number): number {
  return Math.round(n * 100) / 100;
}
