import type Stripe from "stripe";

/** Stripe SDK v22+ types may omit legacy period fields — read at runtime. */
export function subscriptionPeriodEndIso(
  subscription: Stripe.Subscription | Stripe.Response<Stripe.Subscription>,
): string {
  const end = (subscription as { current_period_end?: number }).current_period_end;
  if (typeof end === "number" && end > 0) {
    return new Date(end * 1000).toISOString();
  }
  const itemEnd = subscription.items?.data[0] as
    | { current_period_end?: number }
    | undefined;
  if (typeof itemEnd?.current_period_end === "number") {
    return new Date(itemEnd.current_period_end * 1000).toISOString();
  }
  return new Date().toISOString();
}

export function subscriptionCancelAtPeriodEnd(
  subscription: Stripe.Subscription | Stripe.Response<Stripe.Subscription>,
): boolean {
  return Boolean(
    (subscription as { cancel_at_period_end?: boolean }).cancel_at_period_end,
  );
}
