/**
 * GET /api/admin/subscriptions — Cander-known subscription state + provider label.
 */

import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/admin/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { resolveBillingProviderDisplay } from "@/lib/billing-provider/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requirePlatformAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);
  const offset = Math.max(Number(url.searchParams.get("offset") ?? 0), 0);

  const admin = createSupabaseAdminClient();
  let query = admin
    .from("profiles")
    .select(
      "id, email, name, plan, subscription_status, subscription_period_end, stripe_customer_id, stripe_subscription_id, updated_at",
      { count: "exact" },
    )
    .neq("subscription_status", "none")
    .order("updated_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) query = query.eq("subscription_status", status);

  const { data, error, count } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const subscriptions = (data ?? []).map((row) => ({
    ...row,
    provider: resolveBillingProviderDisplay(row),
    note: "subscription_period_end is Stripe period; usage periods are calendar months.",
  }));

  return NextResponse.json({
    ok: true,
    subscriptions,
    total: count ?? 0,
    billingProviderPanel: "Billing provider not connected (Polar).",
  });
}
