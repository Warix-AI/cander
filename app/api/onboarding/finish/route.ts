import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";
import { isSupabaseConfigured } from "@/lib/data-backend";
import { normalizePlan, isTeamPlan, isPaidPlan } from "@/lib/plans";
import { resolveOnboardingFinishPlan } from "@/lib/billing/resolve-onboarding-plan";
import { ensurePersonalWorkspace } from "@/lib/onboarding/ensure-personal-workspace";
import type { BillingPlan, WorkspaceKind } from "@/lib/types";

/**
 * Completes onboarding writes with the service role so missing client GRANTs
 * on profiles/workspaces cannot block Enter Cander.
 * Requires Authorization: Bearer <access_token>.
 */
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

  let body: {
    name?: string;
    shortName?: string;
    email?: string;
    plan?: BillingPlan;
    selectedMinutes?: number;
    workspaceName?: string;
    workspaceKind?: WorkspaceKind;
  };
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

    // Prefer purchased minutes already stored by /api/billing/subscribe.
    const admin = createSupabaseAdminClient();
    const { data: existingProfile } = await admin
      .from("profiles")
      .select("plan, purchased_ai_minutes, subscription_monthly_price_usd")
      .eq("id", user.id)
      .maybeSingle();

    const existingPlanRaw = existingProfile?.plan ?? null;
    const requestedPlan = body.plan ?? null;
    let plan = resolveOnboardingFinishPlan({
      existingPlan: existingPlanRaw,
      requestedPlan,
    });
    let purchasedMinutes =
      existingProfile?.purchased_ai_minutes != null
        ? Number(existingProfile.purchased_ai_minutes)
        : null;

    // Only run checkout simulation when applying a self-serve plan that does not
    // downgrade an existing paid account.
    const shouldApplySubscription =
      Boolean(requestedPlan) &&
      !(
        existingPlanRaw &&
        isPaidPlan(normalizePlan(existingPlanRaw)) &&
        requestedPlan != null &&
        !isPaidPlan(normalizePlan(requestedPlan))
      ) &&
      requestedPlan != null &&
      plan === normalizePlan(requestedPlan);

    if (shouldApplySubscription && requestedPlan) {
      const { createSubscription } = await import("@/lib/billing/subscriptions");
      try {
        const sub = await createSubscription({
          accountId: user.id,
          plan: requestedPlan,
        });
        plan = sub.plan;
        purchasedMinutes = sub.purchasedMinutes;
        const monthlyPrice = Number(sub.monthlyPriceUsd ?? 0);
        await admin
          .from("profiles")
          .update({
            plan: sub.plan,
            purchased_ai_minutes: sub.purchasedMinutes,
            subscription_monthly_price_usd: sub.monthlyPriceUsd,
            subscription_status: monthlyPrice > 0 ? "active" : "none",
          })
          .eq("id", user.id);
      } catch {
        // Limitless / invalid self-serve — keep resolved plan without checkout.
        plan = resolveOnboardingFinishPlan({
          existingPlan: existingPlanRaw,
          requestedPlan,
        });
      }
    }

    const teamPlan = isTeamPlan(plan);
    const kind: WorkspaceKind =
      body.workspaceKind ?? (teamPlan ? "business" : "personal");
    const name = (body.name ?? "").trim() || "User";
    const shortName =
      (body.shortName ?? "").trim() ||
      name.split(/\s+/)[0] ||
      "You";
    const workspaceName =
      body.workspaceName?.trim() ||
      (kind === "personal" ? "Personal" : "Workspace");

    const profilePatch: Record<string, unknown> = {
      name,
      short_name: shortName,
      role: "Owner",
      onboarding_completed_at: new Date().toISOString(),
    };
    // Only write plan when we intentionally resolved one — never blank paid tiers.
    profilePatch.plan = plan;
    if (purchasedMinutes != null && Number.isFinite(purchasedMinutes)) {
      profilePatch.purchased_ai_minutes = purchasedMinutes;
    }
    // Do not force subscription_status to "none" when preserving a paid plan.
    if (!isPaidPlan(plan)) {
      profilePatch.subscription_status = "none";
    } else if (
      !(
        existingPlanRaw &&
        isPaidPlan(normalizePlan(existingPlanRaw)) &&
        plan === normalizePlan(existingPlanRaw)
      )
    ) {
      profilePatch.subscription_status = "active";
    }

    const { error: profileError } = await admin
      .from("profiles")
      .update(profilePatch)
      .eq("id", user.id);

    if (profileError) {
      if (/permission denied|42501/i.test(profileError.message)) {
        return NextResponse.json(
          {
            error: profileError.message,
            code: "42501",
            hint: "Run scripts/fix-supabase-grants.sql in the Supabase SQL editor.",
          },
          { status: 500 },
        );
      }
      const { error: fallbackError } = await admin
        .from("profiles")
        .update({
          name,
          role: "Owner",
          onboarding_completed_at: new Date().toISOString(),
          plan,
        })
        .eq("id", user.id);
      if (fallbackError) {
        return NextResponse.json(
          { error: fallbackError.message },
          { status: 500 },
        );
      }
    }

    try {
      const { ensureAccountUsagePeriod } = await import(
        "@/lib/usage/account-period"
      );
      await ensureAccountUsagePeriod({ profileId: user.id, plan });
    } catch (periodErr) {
      console.warn("[cander] usage period init failed", periodErr);
    }

    const { workspaceId: wsId } = await ensurePersonalWorkspace({
      admin,
      userId: user.id,
      workspaceName,
      kind,
    });

    return NextResponse.json({
      ok: true,
      workspaceIds: [wsId],
      plan,
      purchasedMinutes,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not finish onboarding.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
