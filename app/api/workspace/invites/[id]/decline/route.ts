import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";
import { isSupabaseConfigured } from "@/lib/data-backend";

async function authedUser(request: Request) {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : null;
  if (!token) return null;

  const userClient = createClient(supabaseUrl(), supabaseAnonKey(), {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) return null;

  const admin = createSupabaseAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("email")
    .eq("id", user.id)
    .maybeSingle();

  return { user, email: (profile?.email ?? user.email ?? "").toLowerCase() };
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase not configured." }, { status: 503 });
  }

  const authed = await authedUser(request);
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await context.params;
  const admin = createSupabaseAdminClient();

  const { data: invite } = await admin
    .from("workspace_invites")
    .select("*")
    .eq("id", id)
    .eq("status", "pending")
    .maybeSingle();

  if (!invite) {
    return NextResponse.json({ error: "Invite not found." }, { status: 404 });
  }

  const emailMatch = invite.invitee_email.toLowerCase() === authed.email;
  const profileMatch = invite.invitee_profile_id === authed.user.id;
  if (!emailMatch && !profileMatch) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  await admin
    .from("workspace_invites")
    .update({
      status: "declined",
      invitee_profile_id: authed.user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  return NextResponse.json({ ok: true });
}
