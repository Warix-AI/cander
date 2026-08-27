import Stripe from "stripe";
import {
  isStripeConfigured,
  mapStripeSubscriptionStatus,
  planFromSubscription,
  priceIdForPlan,
  stripeClient,
} from "@/lib/stripe/config";
import {
  subscriptionCancelAtPeriodEnd,
  subscriptionPeriodEndIso,
} from "@/lib/stripe/period-end";
import type { BillingPlan } from "@/lib/types";

export async function ensureStripeCustomer(opts: {
  profileId: string;
  email: string;
  name?: string;
  existingCustomerId?: string | null;
}) {
  const stripe = stripeClient();
  if (opts.existingCustomerId) {
    return opts.existingCustomerId;
  }
  const customer = await stripe.customers.create({
    email: opts.email,
    name: opts.name?.trim() || undefined,
    metadata: { profile_id: opts.profileId },
  });
  return customer.id;
}

export async function createOnboardingCheckoutSession(opts: {
  profileId: string;
  email: string;
  name?: string;
  plan: Extract<BillingPlan, "pro" | "max">;
  origin: string;
  customerId?: string | null;
  successUrl?: string;
  cancelUrl?: string;
}) {
  const stripe = stripeClient();
  const customerId = await ensureStripeCustomer({
    profileId: opts.profileId,
    email: opts.email,
    name: opts.name,
    existingCustomerId: opts.customerId,
  });

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceIdForPlan(opts.plan), quantity: 1 }],
    success_url:
      opts.successUrl ??
      `${opts.origin}/onboarding/return?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: opts.cancelUrl ?? `${opts.origin}/?onboarding=checkout-canceled`,
    client_reference_id: opts.profileId,
    metadata: {
      profile_id: opts.profileId,
      plan: opts.plan,
      flow: "onboarding",
    },
    subscription_data: {
      metadata: {
        profile_id: opts.profileId,
        plan: opts.plan,
      },
    },
  });

  if (!session.url) throw new Error("Stripe did not return a checkout URL.");
  return { url: session.url, customerId, sessionId: session.id };
}

export async function syncProfileFromCheckoutSession(sessionId: string) {
  if (!isStripeConfigured()) return null;
  const stripe = stripeClient();
  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["subscription"],
  });
  if (session.payment_status !== "paid" && session.status !== "complete") {
    return null;
  }
  const profileId =
    session.metadata?.profile_id ?? session.client_reference_id ?? null;
  if (!profileId) return null;

  const subscription =
    typeof session.subscription === "string"
      ? await stripe.subscriptions.retrieve(session.subscription)
      : session.subscription;

  if (!subscription) return null;

  const plan =
    (session.metadata?.plan as Extract<BillingPlan, "pro" | "max"> | undefined) ??
    planFromSubscription(subscription);
  if (!plan) return null;

  return {
    profileId,
    plan,
    customerId:
      typeof session.customer === "string"
        ? session.customer
        : session.customer?.id ?? null,
    subscriptionId: subscription.id,
    subscriptionStatus: mapStripeSubscriptionStatus(subscription.status),
    periodEnd: subscriptionPeriodEndIso(subscription),
    cancelAtPeriodEnd: subscriptionCancelAtPeriodEnd(subscription),
  };
}

export async function adjustSeatQuantity(opts: {
  subscriptionId: string;
  plan: Extract<BillingPlan, "pro" | "max">;
  delta: 1 | -1;
}) {
  const stripe = stripeClient();
  const subscription = await stripe.subscriptions.retrieve(opts.subscriptionId);
  const priceId = priceIdForPlan(opts.plan);
  const existing = subscription.items.data.find(
    (item) => item.price.id === priceId,
  );

  if (opts.delta === 1) {
    if (existing) {
      await stripe.subscriptionItems.update(existing.id, {
        quantity: (existing.quantity ?? 0) + 1,
        proration_behavior: "create_prorations",
      });
      return;
    }
    await stripe.subscriptions.update(opts.subscriptionId, {
      items: [{ price: priceId, quantity: 1 }],
      proration_behavior: "create_prorations",
    });
    return;
  }

  if (!existing || (existing.quantity ?? 0) <= 0) return;
  const nextQty = (existing.quantity ?? 0) - 1;
  if (nextQty <= 0) {
    await stripe.subscriptionItems.del(existing.id, {
      proration_behavior: "create_prorations",
    });
    return;
  }
  await stripe.subscriptionItems.update(existing.id, {
    quantity: nextQty,
    proration_behavior: "create_prorations",
  });
}

export async function swapMemberSeatPlan(opts: {
  subscriptionId: string;
  from: Extract<BillingPlan, "pro" | "max">;
  to: Extract<BillingPlan, "pro" | "max">;
}) {
  if (opts.from === opts.to) return;
  await adjustSeatQuantity({
    subscriptionId: opts.subscriptionId,
    plan: opts.from,
    delta: -1,
  });
  await adjustSeatQuantity({
    subscriptionId: opts.subscriptionId,
    plan: opts.to,
    delta: 1,
  });
}

export async function createBillingPortalSession(opts: {
  customerId: string;
  origin: string;
}) {
  const stripe = stripeClient();
  const session = await stripe.billingPortal.sessions.create({
    customer: opts.customerId,
    return_url: `${opts.origin}/`,
  });
  return session.url;
}

export async function cancelSubscriptionAtPeriodEnd(subscriptionId: string) {
  const stripe = stripeClient();
  const subscription = await stripe.subscriptions.update(subscriptionId, {
    cancel_at_period_end: true,
  });
  return {
    cancelAtPeriodEnd: subscriptionCancelAtPeriodEnd(subscription),
    periodEnd: subscriptionPeriodEndIso(subscription),
    status: mapStripeSubscriptionStatus(subscription.status),
  };
}

export async function getSubscriptionBillingState(subscriptionId: string) {
  const stripe = stripeClient();
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  return {
    cancelAtPeriodEnd: subscriptionCancelAtPeriodEnd(subscription),
    periodEnd: subscriptionPeriodEndIso(subscription),
    status: mapStripeSubscriptionStatus(subscription.status),
  };
}
