/**
 * Server-only connection reconciliation via security-definer RPC.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ConnectorConnection } from "./types.ts";
import { connectionRowToPublic, type ConnectorConnectionRow } from "./mapper.ts";

/**
 * @deprecated Pending activation must use complete_connector_oauth_callback via oauth-callback.ts
 */
export async function reconcileConnectionActive(
  _admin: SupabaseClient,
  _input: {
    connectionId: string;
    providerConnectionId: string;
    composioUserId: string;
  },
): Promise<ConnectorConnection> {
  throw new Error(
    "reconcileConnectionActive is disabled; use completeOAuthCallbackAtomic instead.",
  );
}

export async function reconcileConnectionDisconnected(
  admin: SupabaseClient,
  connectionId: string,
): Promise<ConnectorConnection> {
  const { data, error } = await admin.rpc("reconcile_connector_connection", {
    p_connection_id: connectionId,
    p_target_status: "disconnected",
    p_provider_connection_id: null,
    p_composio_user_id: null,
    p_failure_detail: null,
  });
  if (error) throw error;
  return connectionRowToPublic(data as ConnectorConnectionRow);
}

export async function reconcileConnectionFailed(
  admin: SupabaseClient,
  input: { connectionId: string; failureDetail: string },
): Promise<ConnectorConnection> {
  const { data, error } = await admin.rpc("reconcile_connector_connection", {
    p_connection_id: input.connectionId,
    p_target_status: "failed",
    p_provider_connection_id: null,
    p_composio_user_id: null,
    p_failure_detail: input.failureDetail,
  });
  if (error) throw error;
  return connectionRowToPublic(data as ConnectorConnectionRow);
}
