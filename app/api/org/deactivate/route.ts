import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";
import { isSupabaseConfigured } from "@/lib/data-backend";
import { assertOrgManager } from "@/lib/supabase/org-auth";

export async function POST(request: Request) {
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

  let body: { orgId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const admin = createSupabaseAdminClient();
  let orgId = body.orgId?.trim() || "";
  let ownedWorkspaceIds: string[] = [];
  if (!orgId) {
    const { data: selfMember } = await admin
      .from("org_members")
      .select("org_id")
      .eq("profile_id", user.id)
      .eq("role", "Owner")
      .limit(1)
      .maybeSingle();
    orgId = selfMember?.org_id ? String(selfMember.org_id) : "";
  }
  if (!orgId) {
    const { data: ownedOrganization } = await admin
      .from("organizations")
      .select("id")
      .eq("billing_owner_id", user.id)
      .limit(1)
      .maybeSingle();
    orgId = ownedOrganization?.id ? String(ownedOrganization.id) : "";
  }
  if (!orgId) {
    const { data: ownedMemberships } = await admin
      .from("workspace_members")
      .select("workspace_id")
      .eq("profile_id", user.id)
      .eq("role", "Owner");
    const candidateWorkspaceIds = (ownedMemberships ?? []).map((row) => String(row.workspace_id));
    if (candidateWorkspaceIds.length) {
      const { data: ownedWorkspaces } = await admin
        .from("workspaces")
        .select("id, org_id, kind")
        .in("id", candidateWorkspaceIds);
      ownedWorkspaceIds = (ownedWorkspaces ?? [])
        .filter((workspace) => workspace.org_id || workspace.kind === "business")
        .map((workspace) => String(workspace.id));
      orgId = (ownedWorkspaces ?? []).find((workspace) => workspace.org_id)?.org_id
        ? String((ownedWorkspaces ?? []).find((workspace) => workspace.org_id)?.org_id)
        : "";
    }
  }
  if (orgId) {
    const authz = await assertOrgManager(admin, orgId, user.id);
    const { data: ownerMember } = await admin
      .from("org_members")
      .select("role")
      .eq("org_id", orgId)
      .eq("profile_id", user.id)
      .maybeSingle();
    if (!authz.ok || ownerMember?.role !== "Owner") {
      return NextResponse.json(
        { error: authz.ok ? "Only the organization owner can deactivate it." : authz.error },
        { status: authz.ok ? 403 : authz.status },
      );
    }

    const { data: members, error: membersError } = await admin
      .from("org_members")
      .select("id, profile_id")
      .eq("org_id", orgId);
    if (membersError) return NextResponse.json({ error: membersError.message }, { status: 500 });
    if ((members ?? []).some((member) => member.profile_id && member.profile_id !== user.id)) {
      return NextResponse.json(
        { error: "Remove all other organization users before deactivating." },
        { status: 409 },
      );
    }
  }

  if (orgId || ownedWorkspaceIds.length) {
    let workspaceQuery = admin
      .from("workspaces")
      .update({ org_id: null, kind: "personal", personal: true });
    workspaceQuery = orgId
      ? workspaceQuery.eq("org_id", orgId)
      : workspaceQuery.in("id", ownedWorkspaceIds);
    const { error: workspaceError } = await workspaceQuery;
    if (workspaceError) return NextResponse.json({ error: workspaceError.message }, { status: 500 });
  }

  if (orgId) {
    // Keep the organization and membership so the owner can reactivate it later.
    const { error: memberError } = await admin
      .from("org_members")
      .update({ kind: "personal" })
      .eq("org_id", orgId)
      .eq("profile_id", user.id);
    if (memberError) return NextResponse.json({ error: memberError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, orgId: orgId || null, recovered: !orgId });
}
