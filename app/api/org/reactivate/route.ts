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

  let body: { orgId?: string; name?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  let orgId = body.orgId?.trim() || "";
  if (!orgId) {
    const { data: selfMember } = await admin
      .from("org_members")
      .select("org_id")
      .eq("profile_id", user.id)
      .eq("role", "Owner")
      .maybeSingle();
    orgId = selfMember?.org_id ? String(selfMember.org_id) : "";
  }
  if (!orgId) return NextResponse.json({ error: "Organization id is required." }, { status: 400 });

  const authz = await assertOrgManager(admin, orgId, user.id);
  const { data: ownerMember } = await admin
    .from("org_members")
    .select("role, workspace_ids")
    .eq("org_id", orgId)
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!authz.ok || ownerMember?.role !== "Owner") {
    return NextResponse.json(
      { error: authz.ok ? "Only the organization owner can activate it." : authz.error },
      { status: authz.ok ? 403 : authz.status },
    );
  }

  const name = body.name?.trim();
  if (name) {
    const { error: nameError } = await admin
      .from("organizations")
      .update({ name })
      .eq("id", orgId);
    if (nameError) return NextResponse.json({ error: nameError.message }, { status: 500 });
  }

  const workspaceIds = Array.isArray(ownerMember.workspace_ids)
    ? ownerMember.workspace_ids.map(String)
    : [];
  if (workspaceIds.length) {
    const { error: workspaceError } = await admin
      .from("workspaces")
      .update({ org_id: orgId, kind: "business", personal: false })
      .in("id", workspaceIds);
    if (workspaceError) return NextResponse.json({ error: workspaceError.message }, { status: 500 });
  }

  const { error: memberError } = await admin
    .from("org_members")
    .update({ kind: "org" })
    .eq("org_id", orgId)
    .eq("profile_id", user.id);
  if (memberError) return NextResponse.json({ error: memberError.message }, { status: 500 });

  return NextResponse.json({ ok: true, orgId });
}
