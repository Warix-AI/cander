/**
 * Server-only recovery for interrupted OAuth callback processing.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getConnectorProvider } from "./provider/index.ts";
import {
  completeOAuthCallbackAtomic,
  failOAuthState,
  listRecoverableOAuthStates,
  releaseExpiredOAuthProcessing,
  type ConnectorOAuthStateRow,
} from "./oauth-callback.ts";
import { shouldRecoverOAuthState } from "./oauth-callback-logic.ts";
import type { ConnectorConnection } from "./types.ts";
import { connectionRowToPublic, type ConnectorConnectionRow } from "./mapper.ts";

export type OAuthRecoveryResult = {
  recovered: number;
  failed: number;
  skipped: number;
};

export async function recoverStaleOAuthStates(
  admin: SupabaseClient,
): Promise<OAuthRecoveryResult> {
  const states = await listRecoverableOAuthStates(admin);
  const result: OAuthRecoveryResult = { recovered: 0, failed: 0, skipped: 0 };

  for (const state of states) {
    const outcome = await recoverSingleOAuthState(admin, state);
    result[outcome] += 1;
  }
  return result;
}

async function recoverSingleOAuthState(
  admin: SupabaseClient,
  state: ConnectorOAuthStateRow,
): Promise<keyof OAuthRecoveryResult> {
  const snapshot = mapStateSnapshot(state);
  if (!shouldRecoverOAuthState({ state: snapshot })) {
    return "skipped";
  }

  const providerRef =
    state.verified_provider_connection_id ?? state.link_session_ref;
  if (!providerRef) {
    await releaseExpiredOAuthProcessing(admin, state.id);
    return "skipped";
  }

  const provider = getConnectorProvider();
  if (provider.name === "noop") {
    return "skipped";
  }

  const status = await provider.getStatus({ providerConnectionId: providerRef });
  if (!status.ok || status.status !== "active") {
    if (status.status === "failed" || status.status === "disconnected") {
      await failOAuthState(admin, {
        oauthStateId: state.id,
        ownerId: state.owner_id,
        failureDetail: "Provider did not confirm an active connection.",
      });
      return "failed";
    }
    await releaseExpiredOAuthProcessing(admin, state.id);
    return "skipped";
  }

  try {
    await completeOAuthCallbackAtomic(admin, {
      oauthStateId: state.id,
      ownerId: state.owner_id,
      providerConnectionId: providerRef,
      composioUserId: state.composio_user_id,
    });
    return "recovered";
  } catch {
    return "skipped";
  }
}

export async function recoverOAuthStateForOwner(
  admin: SupabaseClient,
  ownerId: string,
): Promise<ConnectorConnection | null> {
  const states = await listRecoverableOAuthStates(admin, 5);
  const owned = states.filter((s) => s.owner_id === ownerId);
  for (const state of owned) {
    const outcome = await recoverSingleOAuthState(admin, state);
    if (outcome === "recovered") {
      const { data } = await admin
        .from("connector_connections")
        .select("*")
        .eq("id", state.connection_id)
        .maybeSingle();
      if (data) return connectionRowToPublic(data as ConnectorConnectionRow);
    }
  }
  return null;
}

function mapStateSnapshot(state: ConnectorOAuthStateRow) {
  return {
    id: state.id,
    connectionId: state.connection_id,
    workspaceId: state.workspace_id,
    ownerId: state.owner_id,
    connectorId: state.connector_id,
    composioUserId: state.composio_user_id,
    linkSessionRef: state.link_session_ref,
    lifecycleStatus: state.lifecycle_status,
    expiresAt: state.expires_at,
    consumedAt: state.consumed_at,
    processingStartedAt: state.processing_started_at,
    processingExpiresAt: state.processing_expires_at,
    verifiedProviderConnectionId: state.verified_provider_connection_id,
  };
}
