/**
 * OAuth callback RPC wrappers — server-only.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ConnectorConnection } from "./types.ts";
import { connectionRowToPublic, type ConnectorConnectionRow } from "./mapper.ts";
import type { OAuthLifecycleStatus } from "./oauth-callback-logic.ts";

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
  lifecycle_status: OAuthLifecycleStatus;
  processing_started_at: string | null;
  processing_expires_at: string | null;
  verified_provider_connection_id: string | null;
  failure_detail: string | null;
  created_at: string;
};

export const OAUTH_PROCESSING_LEASE_SECONDS = 120;

export async function claimOAuthStateForCallback(
  admin: SupabaseClient,
  ownerId: string,
): Promise<
  | { ok: true; state: ConnectorOAuthStateRow; alreadyActive: boolean }
  | { ok: false; reason: "not_found" | "processing" | "invalid" }
> {
  const { data, error } = await admin.rpc("claim_connector_oauth_state_for_callback", {
    p_owner_id: ownerId,
    p_lease_seconds: OAUTH_PROCESSING_LEASE_SECONDS,
  });
  if (error) {
    const message = error.message ?? "";
    if (message.includes("already processing")) {
      return { ok: false, reason: "processing" };
    }
    if (message.includes("not found")) {
      return { ok: false, reason: "not_found" };
    }
    return { ok: false, reason: "invalid" };
  }
  const state = data as ConnectorOAuthStateRow;
  const alreadyActive = state.lifecycle_status === "consumed";
  return { ok: true, state, alreadyActive };
}

export async function recordOAuthVerification(
  admin: SupabaseClient,
  input: {
    oauthStateId: string;
    ownerId: string;
    providerConnectionId: string;
  },
): Promise<ConnectorOAuthStateRow> {
  const { data, error } = await admin.rpc("record_connector_oauth_verification", {
    p_oauth_state_id: input.oauthStateId,
    p_owner_id: input.ownerId,
    p_provider_connection_id: input.providerConnectionId,
  });
  if (error) throw error;
  return data as ConnectorOAuthStateRow;
}

export async function completeOAuthCallbackAtomic(
  admin: SupabaseClient,
  input: {
    oauthStateId: string;
    ownerId: string;
    providerConnectionId: string;
    composioUserId: string;
  },
): Promise<ConnectorConnection> {
  const { data, error } = await admin.rpc("complete_connector_oauth_callback", {
    p_oauth_state_id: input.oauthStateId,
    p_owner_id: input.ownerId,
    p_provider_connection_id: input.providerConnectionId,
    p_composio_user_id: input.composioUserId,
  });
  if (error) throw error;
  return connectionRowToPublic(data as ConnectorConnectionRow);
}

export async function failOAuthState(
  admin: SupabaseClient,
  input: {
    oauthStateId: string;
    ownerId: string;
    failureDetail: string;
  },
): Promise<void> {
  const { error } = await admin.rpc("fail_connector_oauth_state", {
    p_oauth_state_id: input.oauthStateId,
    p_owner_id: input.ownerId,
    p_failure_detail: input.failureDetail,
  });
  if (error) throw error;
}

export async function listRecoverableOAuthStates(
  admin: SupabaseClient,
  limit = 20,
): Promise<ConnectorOAuthStateRow[]> {
  const { data, error } = await admin.rpc("list_recoverable_connector_oauth_states", {
    p_limit: limit,
  });
  if (error) throw error;
  return (data ?? []) as ConnectorOAuthStateRow[];
}

export async function releaseExpiredOAuthProcessing(
  admin: SupabaseClient,
  oauthStateId: string,
): Promise<ConnectorOAuthStateRow | null> {
  const { data, error } = await admin.rpc("release_expired_connector_oauth_processing", {
    p_oauth_state_id: oauthStateId,
  });
  if (error) return null;
  return data as ConnectorOAuthStateRow;
}
