import Stripe from "stripe";
import type { BillingPlan } from "@/lib/types";

export type SubscriptionStatus =
  | "none"
  | "trialing"
  | "active"
  | "past_due"
  | "canceled";

export type StripeSeatPlan = Extract<BillingPlan, "light" | "moderate">;

export function isStripeConfigured() {
  return Boolean(
    process.env.STRIPE_SECRET_KEY &&
      process.env.STRIPE_PRICE_PRO &&
      process.env.STRIPE_PRICE_MAX,
  );
}

export function stripeClient() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Missing STRIPE_SECRET_KEY");
  return new Stripe(key);
}

export function priceIdForPlan(plan: StripeSeatPlan) {
  const id =
    plan === "light"
      ? process.env.STRIPE_PRICE_PRO
      : process.env.STRIPE_PRICE_MAX;
  if (!id) throw new Error(`Missing Stripe price for ${plan}`);
  return id;
}

export function mapStripeSubscriptionStatus(
  status: Stripe.Subscription.Status,
): SubscriptionStatus {
  if (status === "trialing") return "trialing";
  if (status === "active") return "active";
  if (status === "past_due" || status === "unpaid") return "past_due";
  if (status === "canceled" || status === "incomplete_expired") return "canceled";
  return "none";
}

export function planFromSubscription(
  subscription: Stripe.Subscription,
): StripeSeatPlan | null {
  const proPrice = process.env.STRIPE_PRICE_PRO;
  const maxPrice = process.env.STRIPE_PRICE_MAX;
  for (const item of subscription.items.data) {
    const priceId = item.price.id;
    if (maxPrice && priceId === maxPrice && (item.quantity ?? 0) > 0) {
      return "moderate";
    }
    if (proPrice && priceId === proPrice && (item.quantity ?? 0) > 0) {
      return "light";
    }
  }
  return null;
}
