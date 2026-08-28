import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";
import { isSupabaseConfigured } from "@/lib/data-backend";
import { inviteRowToInvite, type WorkspaceInviteRow } from "@/lib/workspace-membership";

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

  return { user, email: profile?.email ?? user.email ?? "" };
}

export async function GET(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ invites: [] });
  }

  const authed = await authedUser(request);
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("workspace_invites")
    .select("*")
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .or(
      `invitee_profile_id.eq.${authed.user.id},invitee_email.eq.${authed.email.toLowerCase()}`,
    );

  if (error) {
    if (/workspace_invites|42P01/i.test(error.message)) {
      return NextResponse.json({ invites: [] });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const workspaceIds = [...new Set((data ?? []).map((row) => row.workspace_id))];
  const workspaceNames = new Map<string, string>();
  if (workspaceIds.length) {
    const { data: workspaces } = await admin
      .from("workspaces")
      .select("id, name")
      .in("id", workspaceIds);
    for (const ws of workspaces ?? []) {
      workspaceNames.set(String(ws.id), String(ws.name));
    }
  }

  const inviterIds = [...new Set((data ?? []).map((row) => row.invited_by))];
  const inviterNames = new Map<string, string>();
  if (inviterIds.length) {
    const { data: inviters } = await admin
      .from("profiles")
      .select("id, name")
      .in("id", inviterIds);
    for (const profile of inviters ?? []) {
      inviterNames.set(String(profile.id), String(profile.name));
    }
  }

  const invites = ((data ?? []) as WorkspaceInviteRow[]).map((row) =>
    inviteRowToInvite({
      ...row,
      workspaces: { name: workspaceNames.get(row.workspace_id) ?? row.workspace_id },
      inviter: { name: inviterNames.get(row.invited_by) ?? "Someone" },
    }),
  );
  return NextResponse.json({ invites });
}
