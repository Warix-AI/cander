import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";
import { isSupabaseConfigured } from "@/lib/data-backend";
import { normalizePlan, isTeamPlan } from "@/lib/plans";
import type { BillingPlan, WorkspaceKind } from "@/lib/types";

const NAV_SPACES = ["work", "build", "research", "studio"] as const;

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

    let plan = normalizePlan(
      existingProfile?.plan ?? body.plan,
    );
    let purchasedMinutes =
      existingProfile?.purchased_ai_minutes != null
        ? Number(existingProfile.purchased_ai_minutes)
        : null;

    if (
      body.selectedMinutes != null &&
      Number.isFinite(Number(body.selectedMinutes))
    ) {
      const { createSubscription } = await import("@/lib/billing/subscriptions");
      const sub = await createSubscription({
        accountId: user.id,
        selectedMinutes: Number(body.selectedMinutes),
      });
      plan = sub.plan;
      purchasedMinutes = sub.purchasedMinutes;
      await admin
        .from("profiles")
        .update({
          plan: sub.plan,
          purchased_ai_minutes: sub.purchasedMinutes,
          subscription_monthly_price_usd: sub.monthlyPriceUsd,
          subscription_status:
            sub.monthlyPriceUsd > 0 ? "active" : "none",
        })
        .eq("id", user.id);
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
    const navSpaces = [...NAV_SPACES];

    const profilePatch: Record<string, unknown> = {
      name,
      short_name: shortName,
      role: "Owner",
      onboarding_completed_at: new Date().toISOString(),
      plan,
    };
    if (purchasedMinutes != null && Number.isFinite(purchasedMinutes)) {
      profilePatch.purchased_ai_minutes = purchasedMinutes;
    }
    if (plan === "free") {
      profilePatch.subscription_status = "none";
    } else {
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

    // Only touch the personal bootstrap workspace — never rewrite shared
    // memberships or promote invitees to Owner across every workspace.
    const wsId = `ws-${user.id.replace(/-/g, "")}`;
    const { data: personalMembership } = await admin
      .from("workspace_members")
      .select("workspace_id")
      .eq("profile_id", user.id)
      .eq("workspace_id", wsId)
      .maybeSingle();

    if (!personalMembership) {
      const { error: createWsError } = await admin.from("workspaces").upsert({
        id: wsId,
        name: workspaceName,
        kind,
        personal: kind === "personal",
        spaces: navSpaces,
      });
      if (createWsError) {
        return NextResponse.json(
          { error: createWsError.message },
          { status: 500 },
        );
      }
      const { error: createMemError } = await admin
        .from("workspace_members")
        .upsert({
          workspace_id: wsId,
          profile_id: user.id,
          role: "Owner",
          spaces: navSpaces,
        });
      if (createMemError) {
        return NextResponse.json(
          { error: createMemError.message },
          { status: 500 },
        );
      }
    } else {
      await admin
        .from("workspaces")
        .update({
          name: workspaceName,
          spaces: navSpaces,
          kind,
          personal: kind === "personal",
        })
        .eq("id", wsId);

      await admin
        .from("workspace_members")
        .update({ spaces: navSpaces })
        .eq("workspace_id", wsId)
        .eq("profile_id", user.id);
    }

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
