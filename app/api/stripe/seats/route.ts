import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";
import { isSupabaseConfigured } from "@/lib/data-backend";
import { adjustSeatQuantity } from "@/lib/stripe/subscription";
import { isStripeConfigured } from "@/lib/stripe/config";
import type { BillingPlan } from "@/lib/types";

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

  let body: { orgId?: string; plan?: BillingPlan; action?: "add" | "remove" };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  if (!body.orgId || (body.plan !== "pro" && body.plan !== "max")) {
    return NextResponse.json({ error: "Invalid org or plan." }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data: org } = await admin
    .from("organizations")
    .select("stripe_subscription_id, billing_owner_id")
    .eq("id", body.orgId)
    .maybeSingle();

  if (!org?.stripe_subscription_id) {
    if (!isStripeConfigured()) {
      return NextResponse.json({ ok: true, skipped: true });
    }
    return NextResponse.json({ error: "Org has no subscription." }, { status: 400 });
  }

  if (org.billing_owner_id !== user.id) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  try {
    await adjustSeatQuantity({
      subscriptionId: org.stripe_subscription_id,
      plan: body.plan,
      delta: body.action === "remove" ? -1 : 1,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Seat update failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
