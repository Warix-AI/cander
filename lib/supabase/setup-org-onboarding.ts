"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { persistOrgId, type OrgInviteDraft } from "@/lib/org-onboarding";

function inviteName(invite: OrgInviteDraft) {
  return [invite.firstName, invite.lastName]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ");
}

/** Persist org + pending invites to Supabase after signup workspace exists. */
export async function setupOrgOnSupabase(opts: {
  orgName: string;
  workspaceId: string;
  invites: OrgInviteDraft[];
}): Promise<string> {
  const supabase = createSupabaseBrowserClient();
  const payload = opts.invites
    .filter((invite) => invite.email.trim().includes("@"))
    .map((invite) => ({
      email: invite.email.trim().toLowerCase(),
      name: inviteName(invite),
      plan: invite.plan,
    }));

  const { data, error } = await supabase.rpc("setup_org_onboarding", {
    p_org_name: opts.orgName.trim(),
    p_workspace_id: opts.workspaceId,
    p_invites: payload,
  });

  if (error) throw error;
  if (!data) throw new Error("Organization setup did not return an id.");
  const orgId = String(data);

  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_subscription_id")
    .eq("id", (await supabase.auth.getUser()).data.user?.id ?? "")
    .maybeSingle();

  if (profile?.stripe_subscription_id) {
    await supabase
      .from("organizations")
      .update({
        stripe_subscription_id: profile.stripe_subscription_id,
        billing_owner_id: (await supabase.auth.getUser()).data.user?.id,
      })
      .eq("id", orgId);
  }

  persistOrgId(orgId);
  return orgId;
}