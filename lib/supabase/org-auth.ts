import type { SupabaseClient } from "@supabase/supabase-js";

type OrgAuthResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

/** Billing owner or org Owner/Admin may manage invites and roster. */
export async function assertOrgManager(
  admin: SupabaseClient,
  orgId: string,
  userId: string,
): Promise<OrgAuthResult> {
  const { data: org } = await admin
    .from("organizations")
    .select("billing_owner_id")
    .eq("id", orgId)
    .maybeSingle();

  if (!org) {
    return { ok: false, status: 404, error: "Organization not found." };
  }

  if (org.billing_owner_id === userId) {
    return { ok: true };
  }

  const { data: actorMember } = await admin
    .from("org_members")
    .select("role")
    .eq("org_id", orgId)
    .eq("profile_id", userId)
    .maybeSingle();

  if (actorMember?.role === "Owner" || actorMember?.role === "Admin") {
    return { ok: true };
  }

  return { ok: false, status: 403, error: "Forbidden." };
}
