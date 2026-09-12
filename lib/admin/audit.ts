/**
 * Append-only platform admin audit writer. Call inside mutation handlers.
 * Server-only.
 */

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type AdminAuditInput = {
  actorId: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
  metadata?: Record<string, unknown>;
};

export async function writeAdminAudit(input: AdminAuditInput): Promise<void> {
  try {
    const admin = createSupabaseAdminClient();
    await admin.from("admin_audit_log").insert({
      actor_id: input.actorId,
      action: input.action,
      target_type: input.targetType,
      target_id: input.targetId ?? null,
      before: input.before ?? null,
      after: input.after ?? null,
      reason: input.reason ?? null,
      metadata: input.metadata ?? {},
    });
  } catch (err) {
    console.error("[admin-audit] failed to write", err);
  }
}
