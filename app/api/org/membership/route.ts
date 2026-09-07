import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";
import { isSupabaseConfigured } from "@/lib/data-backend";

/**
 * Authoritative org membership for the signed-in user (service role).
 * Used to reconcile client roster so a stale localStorage kind=org cannot
 * keep showing an active organization after deactivation.
 */
export async function GET(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase not configured." }, { status: 503 });
  }

  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : null;
  if (!token) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const userClient = createClient(supabaseUrl(), supabaseAnonKey(), {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const admin = createSupabaseAdminClient();
  const { data: rows, error } = await admin
    .from("org_members")
    .select("id, org_id, profile_id, role, kind, seat_status, name, email")
    .eq("profile_id", user.id)
    .order("updated_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const membership = (rows ?? [])[0] ?? null;
  let orgName: string | null = null;
  if (membership?.org_id) {
    const { data: org } = await admin
      .from("organizations")
      .select("name")
      .eq("id", membership.org_id)
      .maybeSingle();
    orgName = org?.name ? String(org.name) : null;
  }

  return NextResponse.json({
    ok: true,
    membership: membership
      ? {
          id: membership.profile_id || membership.id,
          orgId: membership.org_id ? String(membership.org_id) : null,
          role: membership.role,
          kind: membership.kind === "org" ? "org" : "personal",
          seatStatus: membership.seat_status,
          name: membership.name,
          email: membership.email,
          orgName,
        }
      : null,
  });
}
