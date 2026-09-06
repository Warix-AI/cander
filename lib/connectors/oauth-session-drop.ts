/**
 * Server-only: park Composio session_uri values when verify runs without a
 * Cander session (external Safari), then let the signed-in app claim them.
 */

import { createHash, randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

const DROP_TTL_MS = 15 * 60 * 1000;

export function hashSessionUri(sessionUri: string): string {
  return createHash("sha256").update(sessionUri).digest("hex");
}

export async function parkOAuthSessionDrop(
  admin: SupabaseClient,
  sessionUri: string,
): Promise<void> {
  const hash = hashSessionUri(sessionUri);
  const row = {
    id: `osd_${randomBytes(12).toString("hex")}`,
    session_uri: sessionUri,
    session_uri_hash: hash,
    created_at: new Date().toISOString(),
  };
  const { error } = await admin.from("connector_oauth_session_drops").upsert(
    row,
    { onConflict: "session_uri_hash", ignoreDuplicates: true },
  );
  if (error) {
    // Table may not be migrated yet — non-fatal for the redirect UX.
    console.warn("[oauth-session-drop] park failed", error.message);
  }
}

export async function listOpenOAuthSessionDrops(
  admin: SupabaseClient,
): Promise<Array<{ id: string; session_uri: string }>> {
  const since = new Date(Date.now() - DROP_TTL_MS).toISOString();
  const { data, error } = await admin
    .from("connector_oauth_session_drops")
    .select("id, session_uri")
    .is("claimed_at", null)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) {
    console.warn("[oauth-session-drop] list failed", error.message);
    return [];
  }
  return (data ?? []) as Array<{ id: string; session_uri: string }>;
}

export async function markOAuthSessionDropClaimed(
  admin: SupabaseClient,
  dropId: string,
  claimedBy: string,
): Promise<void> {
  await admin
    .from("connector_oauth_session_drops")
    .update({
      claimed_at: new Date().toISOString(),
      claimed_by: claimedBy,
    })
    .eq("id", dropId)
    .is("claimed_at", null);
}
