import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";
import { isSupabaseConfigured } from "@/lib/data-backend";
import { isStripeConfigured } from "@/lib/stripe/config";
import { swapMemberSeatPlan } from "@/lib/stripe/subscription";

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase not configured." }, { status: 503 });
  }

  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : null;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const userClient = createClient(supabaseUrl(), supabaseAnonKey(), {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: { memberId?: string; orgId?: string; plan?: "pro" | "max" };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  if (
    !body.memberId ||
    !body.orgId ||
    (body.plan !== "pro" && body.plan !== "max")
  ) {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();

  const { data: actorMember } = await admin
    .from("org_members")
    .select("role, org_id")
    .eq("profile_id", user.id)
    .eq("org_id", body.orgId)
    .maybeSingle();

  const { data: org } = await admin
    .from("organizations")
    .select("stripe_subscription_id, billing_owner_id")
    .eq("id", body.orgId)
    .maybeSingle();

  const isBillingOwner = org?.billing_owner_id === user.id;
  const isOrgAdmin =
    actorMember?.role === "Owner" || actorMember?.role === "Admin";

  if (!isBillingOwner && !isOrgAdmin) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { data: target, error: targetError } = await admin
    .from("org_members")
    .select("id, plan, seat_status, profile_id, role")
    .eq("id", body.memberId)
    .eq("org_id", body.orgId)
    .maybeSingle();

  if (targetError || !target) {
    return NextResponse.json({ error: "Member not found." }, { status: 404 });
  }

  if (target.role === "Owner" && body.plan === "pro") {
    return NextResponse.json(
      { error: "Organization owners must stay on Max." },
      { status: 400 },
    );
  }

  const currentPlan = target.plan === "max" ? "max" : "pro";
  if (currentPlan === body.plan) {
    return NextResponse.json({ ok: true });
  }

  if (
    target.seat_status === "active" &&
    isStripeConfigured() &&
    org?.stripe_subscription_id
  ) {
    try {
      await swapMemberSeatPlan({
        subscriptionId: org.stripe_subscription_id,
        from: currentPlan,
        to: body.plan,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Billing update failed.";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  const { error: memberError } = await admin
    .from("org_members")
    .update({ plan: body.plan })
    .eq("id", body.memberId);

  if (memberError) {
    return NextResponse.json({ error: memberError.message }, { status: 500 });
  }

  if (target.profile_id) {
    await admin
      .from("profiles")
      .update({ plan: body.plan })
      .eq("id", target.profile_id);
  }

  return NextResponse.json({ ok: true, plan: body.plan });
}
