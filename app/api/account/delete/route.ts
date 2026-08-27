import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";
import { isSupabaseConfigured } from "@/lib/data-backend";

/**
 * Deletes the authenticated Auth user (and cascaded profile rows).
 * Requires Authorization: Bearer <access_token> and SUPABASE_SERVICE_ROLE_KEY.
 */
export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Supabase is not configured." },
      { status: 503 },
    );
  }

  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : null;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
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

    const admin = createSupabaseAdminClient();
    const { data: orgMember } = await admin
      .from("org_members")
      .select("kind, role, org_id")
      .eq("profile_id", user.id)
      .maybeSingle();

    const { data: profile } = await admin
      .from("profiles")
      .select(
        "plan, subscription_status, stripe_subscription_id, subscription_period_end, cancel_at_period_end",
      )
      .eq("id", user.id)
      .maybeSingle();

    if (orgMember?.kind === "org" && orgMember.role !== "Owner") {
      return NextResponse.json(
        {
          error:
            "Managed organization members cannot delete their account. Contact your admin.",
        },
        { status: 403 },
      );
    }

    const activePaid =
      (profile?.plan === "pro" || profile?.plan === "max") &&
      (profile?.subscription_status === "active" ||
        profile?.subscription_status === "trialing");

    if (activePaid) {
      if (!profile?.cancel_at_period_end) {
        return NextResponse.json(
          {
            error:
              "Cancel your plan first. Billing runs through the end of your current period.",
          },
          { status: 403 },
        );
      }
      if (
        profile.subscription_period_end &&
        new Date(profile.subscription_period_end).getTime() > Date.now()
      ) {
        return NextResponse.json(
          {
            error: `Your plan stays active until ${new Date(profile.subscription_period_end).toLocaleDateString()}. You can delete your account after that date.`,
          },
          { status: 403 },
        );
      }
    }

    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteError) {
      return NextResponse.json(
        { error: deleteError.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not delete account.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
