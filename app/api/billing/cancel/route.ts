import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";
import { isSupabaseConfigured } from "@/lib/data-backend";
import {
  cancelSubscriptionAtPeriodEnd,
  getSubscriptionBillingState,
} from "@/lib/stripe/subscription";
import { isStripeConfigured } from "@/lib/stripe/config";

async function authedUser(request: Request) {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : null;
  if (!token) return null;

  const userClient = createClient(supabaseUrl(), supabaseAnonKey(), {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) return null;

  const admin = createSupabaseAdminClient();

  // Prefer full billing columns; fall back if migrations 010/011 are not applied yet.
  let profile: Record<string, unknown> | null = null;
  const full = await admin
    .from("profiles")
    .select(
      "plan, subscription_status, stripe_subscription_id, subscription_period_end, cancel_at_period_end",
    )
    .eq("id", user.id)
    .maybeSingle();
  if (!full.error) {
    profile = full.data;
  } else {
    const basic = await admin
      .from("profiles")
      .select("plan")
      .eq("id", user.id)
      .maybeSingle();
    profile = basic.data
      ? {
          ...basic.data,
          subscription_status: "none",
          stripe_subscription_id: null,
          subscription_period_end: null,
          cancel_at_period_end: false,
        }
      : null;
  }

  let org: Record<string, unknown> | null = null;
  const orgFull = await admin
    .from("organizations")
    .select(
      "id, stripe_subscription_id, subscription_period_end, cancel_at_period_end",
    )
    .eq("billing_owner_id", user.id)
    .maybeSingle();
  if (!orgFull.error) {
    org = orgFull.data;
  }

  return { user, profile, org };
}

export async function GET(request: Request) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: "Supabase not configured." }, { status: 503 });
    }

    const authed = await authedUser(request);
    if (!authed?.user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const subscriptionId =
      (authed.org?.stripe_subscription_id as string | null | undefined) ??
      (authed.profile?.stripe_subscription_id as string | null | undefined) ??
      null;

    let periodEnd =
      (authed.org?.subscription_period_end as string | null | undefined) ??
      (authed.profile?.subscription_period_end as string | null | undefined) ??
      null;
    let cancelAtPeriodEnd = Boolean(
      authed.org?.cancel_at_period_end ??
        authed.profile?.cancel_at_period_end ??
        false,
    );

    if (subscriptionId && isStripeConfigured()) {
      try {
        const state = await getSubscriptionBillingState(subscriptionId);
        periodEnd = state.periodEnd;
        cancelAtPeriodEnd = state.cancelAtPeriodEnd;

        const admin = createSupabaseAdminClient();
        await admin
          .from("profiles")
          .update({
            subscription_period_end: state.periodEnd,
            cancel_at_period_end: state.cancelAtPeriodEnd,
            subscription_status: state.status,
          })
          .eq("id", authed.user.id);

        if (authed.org?.id) {
          await admin
            .from("organizations")
            .update({
              subscription_period_end: state.periodEnd,
              cancel_at_period_end: state.cancelAtPeriodEnd,
            })
            .eq("id", String(authed.org.id));
        }
      } catch {
        // Fall back to stored profile values.
      }
    }

    return NextResponse.json({
      plan: (authed.profile?.plan as string | undefined) ?? "free",
      subscriptionStatus:
        (authed.profile?.subscription_status as string | undefined) ?? "none",
      periodEnd,
      cancelAtPeriodEnd,
      hasSubscription: Boolean(subscriptionId),
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not load billing.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: "Supabase not configured." }, { status: 503 });
    }
    if (!isStripeConfigured()) {
      return NextResponse.json({ bypass: true });
    }

    const authed = await authedUser(request);
    if (!authed?.user || !authed.profile) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { data: managedMember } = await createSupabaseAdminClient()
      .from("org_members")
      .select("role, kind")
      .eq("profile_id", authed.user.id)
      .eq("kind", "org")
      .maybeSingle();

    if (managedMember && managedMember.role !== "Owner") {
      return NextResponse.json(
        { error: "Managed organization members cannot cancel billing." },
        { status: 403 },
      );
    }

    const subscriptionId =
      (authed.org?.stripe_subscription_id as string | null | undefined) ??
      (authed.profile.stripe_subscription_id as string | null | undefined) ??
      null;

    if (!subscriptionId) {
      return NextResponse.json({ error: "No active subscription." }, { status: 400 });
    }

    const state = await cancelSubscriptionAtPeriodEnd(subscriptionId);
    const admin = createSupabaseAdminClient();

    await admin
      .from("profiles")
      .update({
        cancel_at_period_end: state.cancelAtPeriodEnd,
        subscription_period_end: state.periodEnd,
        subscription_status: state.status,
      })
      .eq("id", authed.user.id);

    if (authed.org?.id) {
      await admin
        .from("organizations")
        .update({
          cancel_at_period_end: state.cancelAtPeriodEnd,
          subscription_period_end: state.periodEnd,
        })
        .eq("id", String(authed.org.id));
    }

    return NextResponse.json({
      ok: true,
      periodEnd: state.periodEnd,
      cancelAtPeriodEnd: state.cancelAtPeriodEnd,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not cancel plan.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
