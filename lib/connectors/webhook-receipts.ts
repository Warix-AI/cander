/**
 * Idempotent webhook receipt storage — server-only.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export async function claimWebhookReceipt(
  admin: SupabaseClient,
  input: {
    provider: string;
    eventId: string;
    connectionId?: string | null;
  },
): Promise<{ ok: true; claimed: boolean } | { ok: false }> {
  const { error } = await admin.from("connector_webhook_receipts").insert({
    provider: input.provider,
    event_id: input.eventId,
    connection_id: input.connectionId ?? null,
  });
  if (!error) return { ok: true, claimed: true };
  if (error.code === "23505") return { ok: true, claimed: false };
  return { ok: false };
}
