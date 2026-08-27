import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  isStripeConfigured,
  mapStripeSubscriptionStatus,
  planFromSubscription,
  stripeClient,
} from "@/lib/stripe/config";
import {
  subscriptionCancelAtPeriodEnd,
  subscriptionPeriodEndIso,
} from "@/lib/stripe/period-end";

export async function POST(request: Request) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Missing webhook secret." }, { status: 503 });
  }

  const body = await request.text();
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature." }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripeClient().webhooks.constructEvent(body, signature, secret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid signature.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const profileId =
        session.metadata?.profile_id ?? session.client_reference_id ?? null;
      const plan = session.metadata?.plan;
      if (profileId && session.subscription) {
        const subscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription.id;
        const subscription = await stripeClient().subscriptions.retrieve(subscriptionId);
        const resolvedPlan =
          plan === "pro" || plan === "max" ? plan : planFromSubscription(subscription);
        const periodEnd = subscriptionPeriodEndIso(subscription);
        const cancelAtPeriodEnd = subscriptionCancelAtPeriodEnd(subscription);

        await admin
          .from("profiles")
          .update({
            plan: resolvedPlan ?? "free",
            stripe_customer_id:
              typeof session.customer === "string"
                ? session.customer
                : session.customer?.id,
            stripe_subscription_id: subscriptionId,
            subscription_status: mapStripeSubscriptionStatus(subscription.status),
            subscription_period_end: periodEnd,
            cancel_at_period_end: cancelAtPeriodEnd,
          })
          .eq("id", profileId);

        if (resolvedPlan === "max") {
          await admin
            .from("organizations")
            .update({
              stripe_subscription_id: subscriptionId,
              billing_owner_id: profileId,
              subscription_period_end: periodEnd,
              cancel_at_period_end: cancelAtPeriodEnd,
            })
            .eq("billing_owner_id", profileId);
        }
      }
    }

    if (
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      const subscription = event.data.object as Stripe.Subscription;
      const profileId = subscription.metadata?.profile_id;
      if (profileId) {
        const plan = planFromSubscription(subscription);
        const periodEnd = subscriptionPeriodEndIso(subscription);
        const cancelAtPeriodEnd = subscriptionCancelAtPeriodEnd(subscription);
        await admin
          .from("profiles")
          .update({
            plan: plan ?? "free",
            stripe_subscription_id: subscription.id,
            subscription_status: mapStripeSubscriptionStatus(subscription.status),
            subscription_period_end: periodEnd,
            cancel_at_period_end: cancelAtPeriodEnd,
          })
          .eq("id", profileId);

        await admin
          .from("organizations")
          .update({
            subscription_period_end: periodEnd,
            cancel_at_period_end: cancelAtPeriodEnd,
          })
          .eq("billing_owner_id", profileId);
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Webhook handler failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
