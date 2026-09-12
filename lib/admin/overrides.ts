/**
 * Account AI-minute overrides: history rows + profiles mirror for metering.
 * Open period snapshots are NOT rewritten unless explicitly requested later.
 * Server-only.
 */

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { BillingPlan } from "@/lib/types";
import { writeAdminAudit } from "@/lib/admin/audit";

export type AccountOverrideInput = {
  profileId: string;
  actorId: string;
  aiMinutesOverride?: number | null;
  aiMinutesPlan?: BillingPlan | null;
  reason?: string | null;
  expiresAt?: string | null;
  metadata?: Record<string, unknown>;
};

export async function applyAccountOverride(input: AccountOverrideInput) {
  const admin = createSupabaseAdminClient();

  const { data: before } = await admin
    .from("profiles")
    .select("id, plan, ai_minutes_override, ai_minutes_plan")
    .eq("id", input.profileId)
    .maybeSingle();

  if (!before) {
    throw new Error("Profile not found.");
  }

  // Deactivate prior active overrides for this profile.
  await admin
    .from("admin_account_overrides")
    .update({ active: false })
    .eq("profile_id", input.profileId)
    .eq("active", true);

  const overrideRow = {
    profile_id: input.profileId,
    actor_id: input.actorId,
    ai_minutes_override:
      input.aiMinutesOverride === undefined
        ? before.ai_minutes_override
        : input.aiMinutesOverride,
    ai_minutes_plan:
      input.aiMinutesPlan === undefined
        ? before.ai_minutes_plan
        : input.aiMinutesPlan,
    reason: input.reason ?? null,
    expires_at: input.expiresAt ?? null,
    active: true,
    metadata: input.metadata ?? {},
  };

  const { data: history, error: histErr } = await admin
    .from("admin_account_overrides")
    .insert(overrideRow)
    .select("*")
    .single();
  if (histErr) throw histErr;

  const profilePatch: Record<string, unknown> = {};
  if (input.aiMinutesOverride !== undefined) {
    profilePatch.ai_minutes_override = input.aiMinutesOverride;
  }
  if (input.aiMinutesPlan !== undefined) {
    profilePatch.ai_minutes_plan = input.aiMinutesPlan;
  }

  if (Object.keys(profilePatch).length) {
    const { error: profileErr } = await admin
      .from("profiles")
      .update(profilePatch)
      .eq("id", input.profileId);
    if (profileErr) throw profileErr;
  }

  const { data: after } = await admin
    .from("profiles")
    .select("id, plan, ai_minutes_override, ai_minutes_plan")
    .eq("id", input.profileId)
    .maybeSingle();

  await writeAdminAudit({
    actorId: input.actorId,
    action: "account_override.apply",
    targetType: "profile",
    targetId: input.profileId,
    before,
    after,
    reason: input.reason ?? null,
    metadata: { overrideId: history?.id },
  });

  return { history, profile: after };
}

export async function listAccountOverrides(profileId: string) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("admin_account_overrides")
    .select("*")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return data ?? [];
}
