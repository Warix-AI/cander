/**
 * Server-only OAuth state for Composio callback identity verification.
 */

import { randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { composioUserId } from "./composio-identity.ts";

export type ConnectorOAuthStateRow = {
  id: string;
  connection_id: string;
  workspace_id: string;
  owner_id: string;
  connector_id: string;
  composio_user_id: string;
  link_session_ref: string | null;
  expires_at: string;
  consumed_at: string | null;
  lifecycle_status?: "pending" | "processing" | "consumed" | "failed";
  processing_started_at?: string | null;
  processing_expires_at?: string | null;
  verified_provider_connection_id?: string | null;
  failure_detail?: string | null;
  created_at: string;
};

const OAUTH_TTL_MS = 15 * 60 * 1000;

export function newOAuthStateId(): string {
  return `oauth_${randomBytes(16).toString("hex")}`;
}

export function oauthExpiresAtIso(): string {
  return new Date(Date.now() + OAUTH_TTL_MS).toISOString();
}

export function isOAuthStateExpired(row: { expires_at: string }): boolean {
  return new Date(row.expires_at).getTime() <= Date.now();
}

export async function createOAuthState(
  admin: SupabaseClient,
  input: {
    connectionId: string;
    workspaceId: string;
    ownerId: string;
    connectorId: string;
    linkSessionRef?: string | null;
  },
): Promise<ConnectorOAuthStateRow> {
  const id = newOAuthStateId();
  const row = {
    id,
    connection_id: input.connectionId,
    workspace_id: input.workspaceId,
    owner_id: input.ownerId,
    connector_id: input.connectorId,
    composio_user_id: composioUserId(input.workspaceId, input.ownerId),
    link_session_ref: input.linkSessionRef ?? null,
    expires_at: oauthExpiresAtIso(),
    lifecycle_status: "pending" as const,
  };
  const { data, error } = await admin
    .from("connector_oauth_states")
    .insert(row)
    .select("*")
    .single();
  if (error) throw error;
  return data as ConnectorOAuthStateRow;
}

/** Find the latest valid OAuth state for callback pre-checks (does not claim). */
export async function findValidPendingOAuthStateForOwner(
  admin: SupabaseClient,
  ownerId: string,
): Promise<
  | { ok: true; state: ConnectorOAuthStateRow }
  | { ok: false; reason: "not_found" | "expired" }
> {
  const { data: rows, error } = await admin
    .from("connector_oauth_states")
    .select("*")
    .is("consumed_at", null)
    .eq("owner_id", ownerId)
    .in("lifecycle_status", ["pending", "processing"])
    .order("created_at", { ascending: false })
    .limit(5);
  if (error) throw error;

  const match = ((rows ?? []) as ConnectorOAuthStateRow[]).find(
    (row) => !isOAuthStateExpired(row),
  );
  if (!match) {
    const any = (rows ?? []) as ConnectorOAuthStateRow[];
    if (any.some((row) => isOAuthStateExpired(row))) {
      return { ok: false, reason: "expired" };
    }
    return { ok: false, reason: "not_found" };
  }
  return { ok: true, state: match };
}

/** Atomically consume a validated OAuth state row. */
export async function consumeOAuthStateById(
  admin: SupabaseClient,
  stateId: string,
): Promise<
  | { ok: true; state: ConnectorOAuthStateRow }
  | { ok: false; reason: "consumed" | "not_found" }
> {
  const now = new Date().toISOString();
  const { data: updated, error: updateError } = await admin
    .from("connector_oauth_states")
    .update({ consumed_at: now })
    .eq("id", stateId)
    .is("consumed_at", null)
    .select("*")
    .maybeSingle();
  if (updateError) throw updateError;
  if (!updated) return { ok: false, reason: "consumed" };
  return { ok: true, state: updated as ConnectorOAuthStateRow };
}

/** @deprecated Use findValidPendingOAuthStateForOwner + consumeOAuthStateById */
export async function consumePendingOAuthStateForOwner(
  admin: SupabaseClient,
  ownerId: string,
): Promise<
  | { ok: true; state: ConnectorOAuthStateRow }
  | { ok: false; reason: "not_found" | "expired" | "consumed" }
> {
  const found = await findValidPendingOAuthStateForOwner(admin, ownerId);
  if (!found.ok) {
    return { ok: false, reason: found.reason };
  }
  const consumed = await consumeOAuthStateById(admin, found.state.id);
  if (!consumed.ok) return { ok: false, reason: consumed.reason };
  return consumed;
}

export async function bindLinkSessionRef(
  admin: SupabaseClient,
  stateId: string,
  linkSessionRef: string,
): Promise<void> {
  const { error } = await admin
    .from("connector_oauth_states")
    .update({ link_session_ref: linkSessionRef })
    .eq("id", stateId)
    .is("consumed_at", null);
  if (error) throw error;
}
