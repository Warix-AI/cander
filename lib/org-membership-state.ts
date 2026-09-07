/**
 * Resolve active vs deferred/deactivated org membership for client stores.
 * Durable deactivation is org_members.kind = 'personal' in Supabase.
 * orgSetupDeferred is only for onboarding “skip org” when membership is still org/absent.
 */

import {
  getOrgSetupDeferredSnapshot,
  persistOrgSetupDeferred,
} from "@/lib/org-onboarding";
import type { Member } from "@/lib/types";

/**
 * Apply DB membership kind, then onboarding deferred only when the DB still
 * says the actor is in an org (kind === 'org'). Never let deferred revive an
 * org after kind has been set to personal.
 */
export function applyOrgMembershipClientState(
  member: Member,
  opts?: { clearDeferredWhenPersonal?: boolean },
): Member {
  const deferred = getOrgSetupDeferredSnapshot();

  // Deactivated (or personal) membership in DB is source of truth.
  if (member.kind === "personal") {
    if (opts?.clearDeferredWhenPersonal !== false && deferred) {
      persistOrgSetupDeferred(false);
    }
    return {
      ...member,
      kind: "personal",
      // Keep orgId so Activate can call /api/org/reactivate.
      orgSetupDeferred: false,
    };
  }

  // Active org in DB — honor onboarding skip flag if still set.
  if (deferred) {
    return {
      ...member,
      kind: "personal",
      orgSetupDeferred: true,
    };
  }

  return {
    ...member,
    orgSetupDeferred: false,
  };
}
