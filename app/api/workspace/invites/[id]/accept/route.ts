import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";
import { isSupabaseConfigured } from "@/lib/data-backend";
import { NAV_SPACES } from "@/lib/spaces";

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

  const { data: invite, error: inviteError } = await admin
    .from("workspace_invites")
    .select("*")
    .eq("id", id)
    .eq("status", "pending")
    .maybeSingle();

  if (inviteError || !invite) {
    return NextResponse.json({ error: "Invite not found." }, { status: 404 });
  }

  const emailMatch = invite.invitee_email.toLowerCase() === authed.email;
  const profileMatch = invite.invitee_profile_id === authed.user.id;
  if (!emailMatch && !profileMatch) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { data: workspace } = await admin
    .from("workspaces")
    .select("spaces")
    .eq("id", invite.workspace_id)
    .maybeSingle();

  const spaces = Array.isArray(workspace?.spaces) && workspace.spaces.length
    ? workspace.spaces
    : [...NAV_SPACES];

  const { error: memberError } = await admin.from("workspace_members").insert({
    workspace_id: invite.workspace_id,
    profile_id: authed.user.id,
    role: "Member",
    spaces,
  });

  if (memberError && memberError.code !== "23505") {
    return NextResponse.json({ error: memberError.message }, { status: 500 });
  }

  if (invite.org_id) {
    const { data: orgMember } = await admin
      .from("org_members")
      .select("id, workspace_ids")
      .eq("org_id", invite.org_id)
      .eq("profile_id", authed.user.id)
      .maybeSingle();

    if (orgMember) {
      const workspaceIds = Array.from(
        new Set([...(orgMember.workspace_ids ?? []), invite.workspace_id]),
      );
      await admin
        .from("org_members")
        .update({ workspace_ids: workspaceIds })
        .eq("id", orgMember.id);
    }
  }

  await admin
    .from("workspace_invites")
    .update({
      status: "accepted",
      invitee_profile_id: authed.user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  return NextResponse.json({ ok: true, workspaceId: invite.workspace_id });
}
