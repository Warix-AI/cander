import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";
import { isSupabaseConfigured } from "@/lib/data-backend";
import { assertOrgManager } from "@/lib/supabase/org-auth";

/**
 * Deactivate organization for the billing owner.
 * Durable state is org_members.kind = 'personal' (organizations row is kept when present).
 * Also heals orphan rows where kind='org' but org_id is null (UI-active, no org to resolve).
 */
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

  const { data: selfMembers } = await admin
    .from("org_members")
    .select("id, org_id, kind, role, profile_id")
    .or(`profile_id.eq.${user.id},id.eq.${user.id}`)
    .order("updated_at", { ascending: false })
    .limit(10);

  const ownerRows = (selfMembers ?? []).filter((row) => row.role === "Owner");
  const ownerWithOrg =
    ownerRows.find((row) => row.org_id) ??
    (selfMembers ?? []).find((row) => row.org_id) ??
    null;
  const orphanActiveOwner =
    ownerRows.find((row) => !row.org_id && row.kind === "org") ?? null;

  if (!orgId && ownerWithOrg?.org_id) {
    orgId = String(ownerWithOrg.org_id);
  }

  if (!orgId) {
    const { data: ownedOrganization } = await admin
      .from("organizations")
      .select("id")
      .eq("billing_owner_id", user.id)
      .order("created_at", { ascending: false })
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
    const candidateWorkspaceIds = (ownedMemberships ?? []).map((row) =>
      String(row.workspace_id),
    );
    if (candidateWorkspaceIds.length) {
      const { data: ownedWorkspaces } = await admin
        .from("workspaces")
        .select("id, org_id, kind")
        .in("id", candidateWorkspaceIds);
      ownedWorkspaceIds = (ownedWorkspaces ?? [])
        .filter((workspace) => workspace.org_id || workspace.kind === "business")
        .map((workspace) => String(workspace.id));
      const linked = (ownedWorkspaces ?? []).find((workspace) => workspace.org_id);
      orgId = linked?.org_id ? String(linked.org_id) : "";
    }
  }

  // Orphan active membership: kind=org but no org_id (and no linked workspaces).
  // Heal by flipping kind to personal so the Organization UI stops treating it as active.
  if (!orgId && orphanActiveOwner) {
    const { error: healError } = await admin
      .from("org_members")
      .update({ kind: "personal" })
      .eq("id", orphanActiveOwner.id);
    if (healError) {
      return NextResponse.json({ error: healError.message }, { status: 500 });
    }

    // Also clear any other Owner rows for this profile that are org-without-org_id.
    await admin
      .from("org_members")
      .update({ kind: "personal" })
      .or(`profile_id.eq.${user.id},id.eq.${user.id}`)
      .eq("role", "Owner")
      .is("org_id", null)
      .eq("kind", "org");

    if (ownedWorkspaceIds.length) {
      await admin
        .from("workspaces")
        .update({ org_id: null, kind: "personal", personal: true })
        .in("id", ownedWorkspaceIds);
    }

    return NextResponse.json({
      ok: true,
      orgId: null,
      kind: "personal",
      healedOrphan: true,
    });
  }

  if (!orgId) {
    // Already personal / nothing to deactivate — treat as success so UI can clear.
    const anyOwner = ownerRows[0] ?? null;
    if (anyOwner && anyOwner.kind === "personal") {
      return NextResponse.json({
        ok: true,
        orgId: anyOwner.org_id ? String(anyOwner.org_id) : null,
        kind: "personal",
        alreadyInactive: true,
      });
    }
    return NextResponse.json(
      { error: "No organization found to deactivate." },
      { status: 404 },
    );
  }

  const authz = await assertOrgManager(admin, orgId, user.id);
  const { data: ownerMember } = await admin
    .from("org_members")
    .select("role, kind")
    .eq("org_id", orgId)
    .or(`profile_id.eq.${user.id},id.eq.${user.id}`)
    .maybeSingle();
  const isOwner =
    ownerMember?.role === "Owner" ||
    ownerRows.some((row) => row.org_id === orgId && row.role === "Owner");
  if (!authz.ok || !isOwner) {
    return NextResponse.json(
      {
        error: authz.ok
          ? "Only the organization owner can deactivate it."
          : authz.error,
      },
      { status: authz.ok ? 403 : authz.status },
    );
  }

  const { data: members, error: membersError } = await admin
    .from("org_members")
    .select("id, profile_id")
    .eq("org_id", orgId);
  if (membersError) {
    return NextResponse.json({ error: membersError.message }, { status: 500 });
  }
  if (
    (members ?? []).some(
      (member) =>
        member.profile_id &&
        member.profile_id !== user.id &&
        member.id !== user.id,
    )
  ) {
    return NextResponse.json(
      { error: "Remove all other organization users before deactivating." },
      { status: 409 },
    );
  }

  if (ownedWorkspaceIds.length) {
    const { error: byIdsError } = await admin
      .from("workspaces")
      .update({ org_id: null, kind: "personal", personal: true })
      .in("id", ownedWorkspaceIds);
    if (byIdsError) {
      return NextResponse.json({ error: byIdsError.message }, { status: 500 });
    }
  }
  const { error: workspaceError } = await admin
    .from("workspaces")
    .update({ org_id: null, kind: "personal", personal: true })
    .eq("org_id", orgId);
  if (workspaceError) {
    return NextResponse.json({ error: workspaceError.message }, { status: 500 });
  }

  const { error: memberError } = await admin
    .from("org_members")
    .update({ kind: "personal" })
    .or(`profile_id.eq.${user.id},id.eq.${user.id}`)
    .eq("role", "Owner");
  if (memberError) {
    return NextResponse.json({ error: memberError.message }, { status: 500 });
  }

  const { data: verifyRows } = await admin
    .from("org_members")
    .select("kind, org_id")
    .or(`profile_id.eq.${user.id},id.eq.${user.id}`)
    .eq("role", "Owner");
  const stillActive = (verifyRows ?? []).some((row) => row.kind === "org");
  if (stillActive || !(verifyRows ?? []).length) {
    return NextResponse.json(
      { error: "Could not persist organization deactivation." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    orgId,
    kind: "personal",
  });
}
