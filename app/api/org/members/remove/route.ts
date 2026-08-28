import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";
import { isSupabaseConfigured } from "@/lib/data-backend";
import { adjustSeatQuantity } from "@/lib/stripe/subscription";
import { isStripeConfigured } from "@/lib/stripe/config";
import type { BillingPlan } from "@/lib/types";
import { assertOrgManager } from "@/lib/supabase/org-auth";

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

  let body: { orgId?: string; memberId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  if (!body.orgId || !body.memberId) {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const authz = await assertOrgManager(admin, body.orgId, user.id);
  if (!authz.ok) {
    return NextResponse.json({ error: authz.error }, { status: authz.status });
  }

  const { data: org } = await admin
    .from("organizations")
    .select("stripe_subscription_id")
    .eq("id", body.orgId)
    .maybeSingle();

  if (!org) {
    return NextResponse.json({ error: "Organization not found." }, { status: 404 });
  }

  const { data: member } = await admin
    .from("org_members")
    .select("id, role, plan, seat_status, profile_id")
    .eq("id", body.memberId)
    .eq("org_id", body.orgId)
    .maybeSingle();

  if (!member) {
    return NextResponse.json({ error: "Member not found." }, { status: 404 });
  }

  if (member.role === "Owner") {
    return NextResponse.json(
      { error: "Cannot remove the organization owner." },
      { status: 400 },
    );
  }

  const seatPlan = member.plan === "max" ? "max" : "pro";

  if (
    org.stripe_subscription_id &&
    member.seat_status === "active" &&
    isStripeConfigured()
  ) {
    try {
      await adjustSeatQuantity({
        subscriptionId: org.stripe_subscription_id,
        plan: seatPlan as Extract<BillingPlan, "pro" | "max">,
        delta: -1,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Seat update failed.";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  await admin
    .from("org_invites")
    .update({ status: "revoked", updated_at: new Date().toISOString() })
    .eq("org_member_id", member.id)
    .eq("status", "pending");

  const { error: deleteError } = await admin
    .from("org_members")
    .delete()
    .eq("id", member.id);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
