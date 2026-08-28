import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";
import { isSupabaseConfigured } from "@/lib/data-backend";
import { sendOrgInviteEmail } from "@/lib/email/send-org-invite";
import type { OrgInviteDraft } from "@/lib/org-onboarding";
import { filterOrgWorkspaceIds } from "@/lib/security";
import { assertOrgManager } from "@/lib/supabase/org-auth";

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

  const userClient = createClient(supabaseUrl(), supabaseAnonKey(), {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: {
    orgId?: string;
    workspaceIds?: string[];
    invites?: OrgInviteDraft[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  if (!body.orgId || !Array.isArray(body.invites)) {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const authz = await assertOrgManager(admin, body.orgId, user.id);
  if (!authz.ok) {
    return NextResponse.json({ error: authz.error }, { status: authz.status });
  }

  const { data: org } = await admin
    .from("organizations")
    .select("name")
    .eq("id", body.orgId)
    .maybeSingle();

  if (!org) {
    return NextResponse.json({ error: "Organization not found." }, { status: 404 });
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("name")
    .eq("id", user.id)
    .maybeSingle();

  const { data: orgWorkspaces } = await admin
    .from("workspaces")
    .select("id")
    .eq("org_id", body.orgId);
  const workspaceIds = filterOrgWorkspaceIds(
    body.workspaceIds,
    (orgWorkspaces ?? []).map((row) => String(row.id)),
  );

  const origin = new URL(request.url).origin;
  const results: { email: string; inviteUrl: string; sent: boolean }[] = [];

  for (const invite of body.invites) {
    const email = invite.email.trim().toLowerCase();
    if (!email.includes("@")) continue;

    const memberId = `invite-${email.replace(/[^a-z0-9]/gi, "")}`;
    await admin.from("org_members").upsert({
      id: memberId,
      org_id: body.orgId,
      email,
      name: [invite.firstName, invite.lastName].filter(Boolean).join(" ") || email,
      short_name: invite.firstName.trim() || email.split("@")[0],
      initials: (invite.firstName || email).slice(0, 2).toUpperCase(),
      role: "Member",
      plan: invite.plan,
      seat_status: "pending",
      kind: "org",
      workspace_ids: workspaceIds,
    });

    const { data: row, error } = await admin
      .from("org_invites")
      .insert({
        org_id: body.orgId,
        org_member_id: memberId,
        invited_by: user.id,
        email,
        first_name: invite.firstName.trim(),
        last_name: invite.lastName.trim(),
        plan: invite.plan,
        workspace_ids: workspaceIds,
      })
      .select("token")
      .single();

    if (error || !row?.token) continue;

    const inviteUrl = `${origin}/invite/${row.token}`;
    const sent = await sendOrgInviteEmail({
      to: email,
      orgName: org.name,
      inviteUrl,
      inviterName: profile?.name,
      plan: invite.plan,
    });

    results.push({ email, inviteUrl, sent: sent.sent });
  }

  return NextResponse.json({ ok: true, results });
}
