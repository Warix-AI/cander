/**
 * POST /api/billing/subscribe
 * Simulated subscription for purchased monthly AI minutes (Polar later).
 * Requires Authorization: Bearer <access_token>.
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSubscription } from "@/lib/billing/subscriptions";
import { isSupabaseConfigured } from "@/lib/data-backend";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";
import { ensureAccountUsagePeriod } from "@/lib/usage/account-period";

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

  let body: { selectedMinutes?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  try {
    const userClient = createClient(supabaseUrl(), supabaseAnonKey(), {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const selectedMinutes = Number(body.selectedMinutes);
    const result = await createSubscription({
      accountId: user.id,
      selectedMinutes,
    });

    const admin = createSupabaseAdminClient();
    const profilePatch: Record<string, unknown> = {
      plan: result.plan,
      purchased_ai_minutes: result.purchasedMinutes,
      subscription_monthly_price_usd: result.monthlyPriceUsd,
      subscription_status:
        result.monthlyPriceUsd > 0 ? "active" : "none",
    };

    const { error: profileError } = await admin
      .from("profiles")
      .update(profilePatch)
      .eq("id", user.id);

    if (profileError) {
      // Migration may not be applied yet — still try plan + status.
      const { error: fallbackError } = await admin
        .from("profiles")
        .update({
          plan: result.plan,
          subscription_status:
            result.monthlyPriceUsd > 0 ? "active" : "none",
        })
        .eq("id", user.id);
      if (fallbackError) {
        return NextResponse.json(
          { error: fallbackError.message },
          { status: 500 },
        );
      }
    }

    await ensureAccountUsagePeriod({
      profileId: user.id,
      plan: result.plan,
    });

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not create subscription.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
