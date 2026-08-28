import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";
import { isSupabaseConfigured } from "@/lib/data-backend";
import { isStripeConfigured } from "@/lib/stripe/config";

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase not configured." }, { status: 503 });
  }

  const { token } = await context.params;
  const authHeader = request.headers.get("Authorization");
  const accessToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : null;
  if (!accessToken) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const userClient = createClient(supabaseUrl(), supabaseAnonKey(), {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const { data: orgId, error: acceptError } = await admin.rpc("accept_org_invite", {
    p_token: token,
    p_profile_id: user.id,
  });

  if (acceptError) {
    return NextResponse.json({ error: acceptError.message }, { status: 400 });
  }

  await admin
    .from("profiles")
    .update({ onboarding_completed_at: new Date().toISOString() })
    .eq("id", user.id)
    .is("onboarding_completed_at", null);

  const { data: org } = await admin
    .from("organizations")
    .select("id, stripe_subscription_id, billing_owner_id")
    .eq("id", orgId)
    .maybeSingle();

  const { data: invite } = await admin
    .from("org_invites")
    .select("plan")
    .eq("token", token)
    .maybeSingle();

  if (
    isStripeConfigured() &&
    org?.stripe_subscription_id &&
    invite?.plan &&
    (invite.plan === "pro" || invite.plan === "max")
  ) {
    const { adjustSeatQuantity } = await import("@/lib/stripe/subscription");
    try {
      await adjustSeatQuantity({
        subscriptionId: org.stripe_subscription_id,
        plan: invite.plan,
        delta: 1,
      });
    } catch {
      // Seat active in app; owner can reconcile billing in portal
    }
  }

  return NextResponse.json({ ok: true, orgId });
}
