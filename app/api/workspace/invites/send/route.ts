import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";
import { isSupabaseConfigured } from "@/lib/data-backend";
import { assertOrgManager } from "@/lib/supabase/org-auth";

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
  return user;
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase not configured." }, { status: 503 });
  }

  const user = await authedUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: {
    workspaceId?: string;
    email?: string;
    orgId?: string | null;
    memberId?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  if (!body.workspaceId || !body.email?.includes("@")) {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const email = body.email.trim().toLowerCase();
  const admin = createSupabaseAdminClient();

  const { data: workspaceMember } = await admin
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", body.workspaceId)
    .eq("profile_id", user.id)
    .maybeSingle();

  const isWorkspaceManager =
    workspaceMember?.role === "Owner" || workspaceMember?.role === "Admin";

  // Org managers are not global workspace managers — require membership here,
  // and when orgId is set require the workspace to belong to that org.
  if (!isWorkspaceManager) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  if (body.orgId) {
    const authz = await assertOrgManager(admin, body.orgId, user.id);
    if (!authz.ok) {
      return NextResponse.json({ error: authz.error }, { status: authz.status });
    }
    const { data: workspace } = await admin
      .from("workspaces")
      .select("org_id")
      .eq("id", body.workspaceId)
      .maybeSingle();
    if (!workspace || workspace.org_id !== body.orgId) {
      return NextResponse.json(
        { error: "Workspace is not in this organization." },
        { status: 403 },
      );
    }
  }

  const { data: inviteeProfile } = await admin
    .from("profiles")
    .select("id")
    .ilike("email", email)
    .maybeSingle();

  if (inviteeProfile?.id) {
    const { data: existingMember } = await admin
      .from("workspace_members")
      .select("profile_id")
      .eq("workspace_id", body.workspaceId)
      .eq("profile_id", inviteeProfile.id)
      .maybeSingle();
    if (existingMember) {
      return NextResponse.json({ error: "Already a workspace member." }, { status: 400 });
    }
  }

  await admin
    .from("workspace_invites")
    .update({ status: "revoked", updated_at: new Date().toISOString() })
    .eq("workspace_id", body.workspaceId)
    .eq("invitee_email", email)
    .eq("status", "pending");

  const { data: row, error } = await admin
    .from("workspace_invites")
    .insert({
      workspace_id: body.workspaceId,
      invitee_profile_id: inviteeProfile?.id ?? null,
      invitee_email: email,
      invited_by: user.id,
      org_id: body.orgId ?? null,
      status: "pending",
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, inviteId: row.id });
}
