import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";
import { isSupabaseConfigured } from "@/lib/data-backend";
import { normalizePlan, isTeamPlan } from "@/lib/plans";
import { isStripeConfigured } from "@/lib/stripe/config";
import type { BillingPlan, WorkspaceKind } from "@/lib/types";

const NAV_SPACES = ["work", "build", "research"] as const;

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

    const plan = normalizePlan(body.plan);
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
    const stripeLive = isStripeConfigured();

    const admin = createSupabaseAdminClient();

    // Persist the plan the user chose. Until Stripe is wired, treat paid plans as
    // active so entitlements/workspaces unlock. With Stripe live, paid plans are
    // written by the checkout webhook after payment.
    const profilePatch: Record<string, unknown> = {
      name,
      short_name: shortName,
      role: "Owner",
      onboarding_completed_at: new Date().toISOString(),
    };
    if (plan === "free") {
      profilePatch.plan = "free";
      profilePatch.subscription_status = "none";
    } else if (!stripeLive) {
      profilePatch.plan = plan;
      profilePatch.subscription_status = "active";
    }

    const { error: profileError } = await admin
      .from("profiles")
      .update(profilePatch)
      .eq("id", user.id);

    if (profileError) {
      // Privilege revocation hits service_role too — surface clearly for grants fix.
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
      // Retry without billing / short_name columns if migrations are not applied.
      const { error: fallbackError } = await admin
        .from("profiles")
        .update({
          name,
          role: "Owner",
          onboarding_completed_at: new Date().toISOString(),
          ...(plan === "free" ? { plan: "free" } : {}),
        })
        .eq("id", user.id);
      if (fallbackError) {
        return NextResponse.json(
          { error: fallbackError.message },
          { status: 500 },
        );
      }
      // Fallback without billing columns — still persist plan name when possible.
      if (plan !== "free" && !stripeLive) {
        await admin.from("profiles").update({ plan }).eq("id", user.id);
      }
    }

    const { data: memberships, error: listError } = await admin
      .from("workspace_members")
      .select("workspace_id")
      .eq("profile_id", user.id);
    if (listError) {
      return NextResponse.json({ error: listError.message }, { status: 500 });
    }

    let ids = (memberships ?? []).map((row) => String(row.workspace_id));
    const wsId = `ws-${user.id.replace(/-/g, "")}`;

    if (!ids.length) {
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
      ids = [wsId];
    }

    for (const workspaceId of ids) {
      await admin
        .from("workspaces")
        .update({
          name: workspaceName,
          spaces: navSpaces,
          kind,
          personal: kind === "personal",
        })
        .eq("id", workspaceId);

      await admin
        .from("workspace_members")
        .update({
          role: "Owner",
          spaces: navSpaces,
        })
        .eq("workspace_id", workspaceId)
        .eq("profile_id", user.id);
    }

    return NextResponse.json({
      ok: true,
      workspaceIds: ids,
      plan,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not finish onboarding.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
