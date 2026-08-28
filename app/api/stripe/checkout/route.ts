import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";
import { isSupabaseConfigured } from "@/lib/data-backend";
import {
  createOnboardingCheckoutSession,
  syncProfileFromCheckoutSession,
} from "@/lib/stripe/subscription";
import { isStripeConfigured } from "@/lib/stripe/config";
import type { BillingPlan } from "@/lib/types";

async function authedProfile(request: Request) {
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
  const { data: profile } = await admin
    .from("profiles")
    .select("id, email, name, stripe_customer_id, onboarding_checkpoint")
    .eq("id", user.id)
    .maybeSingle();

  return { user, profile };
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase not configured." }, { status: 503 });
  }

  const authed = await authedProfile(request);
  if (!authed?.user || !authed.profile) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: {
    plan?: BillingPlan;
    checkpoint?: Record<string, unknown>;
    returnTo?: "settings" | "onboarding";
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  if (body.plan !== "pro" && body.plan !== "max") {
    return NextResponse.json({ error: "Invalid plan." }, { status: 400 });
  }

  if (!isStripeConfigured()) {
    // Local/demo unlock — never allow the browser client to write plan columns.
    await createSupabaseAdminClient()
      .from("profiles")
      .update({
        plan: body.plan,
        subscription_status: "active",
        ...(body.checkpoint ? { onboarding_checkpoint: body.checkpoint } : {}),
      })
      .eq("id", authed.user.id);
    return NextResponse.json({ bypass: true });
  }

  const origin = new URL(request.url).origin;
  const returnTo = body.returnTo === "settings" ? "settings" : "onboarding";
  const successUrl =
    returnTo === "settings"
      ? `${origin}/?settings=plans&checkout=success&session_id={CHECKOUT_SESSION_ID}`
      : undefined;
  const cancelUrl =
    returnTo === "settings"
      ? `${origin}/pricing?checkout=canceled`
      : undefined;

  if (body.checkpoint) {
    await createSupabaseAdminClient()
      .from("profiles")
      .update({ onboarding_checkpoint: body.checkpoint })
      .eq("id", authed.user.id);
  }

  try {
    const result = await createOnboardingCheckoutSession({
      profileId: authed.user.id,
      email: authed.profile.email,
      name: authed.profile.name,
      plan: body.plan,
      origin,
      customerId: authed.profile.stripe_customer_id,
      successUrl,
      cancelUrl,
    });

    await createSupabaseAdminClient()
      .from("profiles")
      .update({ stripe_customer_id: result.customerId })
      .eq("id", authed.user.id);

    return NextResponse.json({ url: result.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Checkout failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ bypass: true, paid: true });
  }

  const authed = await authedProfile(request);
  if (!authed?.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("session_id");
  if (!sessionId) {
    return NextResponse.json({ error: "Missing session_id." }, { status: 400 });
  }

  try {
    const synced = await syncProfileFromCheckoutSession(sessionId);
    if (!synced) {
      return NextResponse.json({ paid: false });
    }

    if (synced.profileId !== authed.user.id) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const admin = createSupabaseAdminClient();
    await admin
      .from("profiles")
      .update({
        plan: synced.plan,
        stripe_customer_id: synced.customerId,
        stripe_subscription_id: synced.subscriptionId,
        subscription_status: synced.subscriptionStatus,
        subscription_period_end: synced.periodEnd,
        cancel_at_period_end: synced.cancelAtPeriodEnd,
      })
      .eq("id", synced.profileId);

    const { data: profile } = await admin
      .from("profiles")
      .select("onboarding_checkpoint, plan")
      .eq("id", synced.profileId)
      .maybeSingle();

    return NextResponse.json({
      paid: true,
      plan: synced.plan,
      checkpoint: profile?.onboarding_checkpoint ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not verify payment.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
