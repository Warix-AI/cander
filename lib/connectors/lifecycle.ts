/**
 * Connector connection lifecycle — server-only, user-scoped Supabase client + RLS.
 * Do not import from client components.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ConnectorConnection } from "./types.ts";
import { recordConnectorAuditEvent } from "./audit.ts";
import {
  connectionNotFoundError,
  conflictError,
} from "./authz.ts";
import { composioUserId } from "./composio-identity.ts";
import { composioConfigurationStatus } from "./composio-http.ts";
import { createOAuthState } from "./oauth-state.ts";
import { isOauthConnectorId } from "./oauth-connectors.ts";
import { getConnectorProvider } from "./provider/index.ts";
import { reconcileConnectionDisconnected, reconcileConnectionFailed } from "./reconcile.ts";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { resolveInitiateExisting } from "./lifecycle-logic.ts";
import {
  catalogRowToPublic,
  connectionRowToPublic,
  isPendingExpired,
  newConnectionId,
  pendingExpiresAtIso,
  type ConnectorCatalogRow,
  type ConnectorConnectionRow,
} from "./mapper.ts";

export async function listConnectorCatalog(
  client: SupabaseClient,
): Promise<ReturnType<typeof catalogRowToPublic>[]> {
  const { data, error } = await client
    .from("connector_catalog")
    .select("*")
    .eq("enabled", true)
    .order("display_order", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as ConnectorCatalogRow[]).map(catalogRowToPublic);
}

export async function listUserConnections(input: {
  client: SupabaseClient;
  workspaceId: string;
  ownerId: string;
}): Promise<ConnectorConnection[]> {
  await expireStalePendingConnections(input);
  const { data, error } = await input.client
    .from("connector_connections")
    .select("*")
    .eq("workspace_id", input.workspaceId)
    .eq("owner_id", input.ownerId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as ConnectorConnectionRow[]).map(connectionRowToPublic);
}

export async function getUserConnection(input: {
  client: SupabaseClient;
  connectionId: string;
  ownerId: string;
}): Promise<
  | { ok: true; connection: ConnectorConnection }
  | { ok: false; status: number; error: string }
> {
  const { data, error } = await input.client
    .from("connector_connections")
    .select("*")
    .eq("id", input.connectionId)
    .eq("owner_id", input.ownerId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    return { ok: false, ...connectionNotFoundError() };
  }
  return {
    ok: true,
    connection: connectionRowToPublic(data as ConnectorConnectionRow),
  };
}

export async function initiateConnection(input: {
  client: SupabaseClient;
  workspaceId: string;
  ownerId: string;
  connectorId: string;
}): Promise<
  | { ok: true; connection: ConnectorConnection; reused: boolean; authorizationUrl?: string }
  | { ok: false; status: number; error: string }
> {
  await expireStalePendingConnections({
    client: input.client,
    workspaceId: input.workspaceId,
    ownerId: input.ownerId,
  });

  const { data: catalog, error: catalogError } = await input.client
    .from("connector_catalog")
    .select("id, enabled")
    .eq("id", input.connectorId)
    .maybeSingle();
  if (catalogError) throw catalogError;
  if (!catalog?.enabled) {
    return { ok: false, status: 404, error: "Connector not found." };
  }
  if (!isOauthConnectorId(input.connectorId)) {
    return { ok: false, status: 404, error: "Connector not found." };
  }
  const { data: existing, error: existingError } = await input.client
    .from("connector_connections")
    .select("*")
    .eq("workspace_id", input.workspaceId)
    .eq("owner_id", input.ownerId)
    .eq("connector_id", input.connectorId)
    .eq("connection_mode", "personal")
    .in("status", ["pending", "active"])
    .is("deleted_at", null)
    .maybeSingle();
  if (existingError) throw existingError;

  if (existing) {
    const row = existing as ConnectorConnectionRow;
    const decision = resolveInitiateExisting(row);
    if (decision.action === "reuse") {
      const auth = await beginProviderAuthorization({
        connectionId: row.id,
        workspaceId: input.workspaceId,
        ownerId: input.ownerId,
        connectorId: input.connectorId,
      });
      if (!auth.ok) {
        return { ok: false, status: 502, error: auth.error };
      }
      return {
        ok: true,
        connection: connectionRowToPublic(row),
        reused: true,
        authorizationUrl: auth.authorizationUrl,
      };
    }
    if (decision.action === "conflict") {
      return { ok: false, ...conflictError() };
    }
  }

  const id = newConnectionId();
  const now = new Date().toISOString();
  const row = {
    id,
    workspace_id: input.workspaceId,
    owner_id: input.ownerId,
    connector_id: input.connectorId,
    connection_mode: "personal" as const,
    status: "pending" as const,
    connected_by: input.ownerId,
    pending_expires_at: pendingExpiresAtIso(),
    created_at: now,
    updated_at: now,
  };

  const { data: inserted, error: insertError } = await input.client
    .from("connector_connections")
    .insert(row)
    .select("*")
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      const { data: raced } = await input.client
        .from("connector_connections")
        .select("*")
        .eq("workspace_id", input.workspaceId)
        .eq("owner_id", input.ownerId)
        .eq("connector_id", input.connectorId)
        .eq("connection_mode", "personal")
        .in("status", ["pending", "active"])
        .is("deleted_at", null)
        .maybeSingle();
      if (raced) {
        const auth = await beginProviderAuthorization({
          connectionId: raced.id,
          workspaceId: input.workspaceId,
          ownerId: input.ownerId,
          connectorId: input.connectorId,
        });
        if (!auth.ok) {
          return { ok: false, status: 502, error: auth.error };
        }
        return {
          ok: true,
          connection: connectionRowToPublic(raced as ConnectorConnectionRow),
          reused: true,
          authorizationUrl: auth.authorizationUrl,
        };
      }
      return { ok: false, ...conflictError() };
    }
    throw insertError;
  }

  await recordConnectorAuditEvent(input.client, {
    workspaceId: input.workspaceId,
    actorId: input.ownerId,
    connectionId: id,
    connectorId: input.connectorId,
    eventType: "connection_initiated",
    detail: { reason_code: "initiated", connector_id: input.connectorId, connection_id: id, workspace_id: input.workspaceId },
  });

  const auth = await beginProviderAuthorization({
    connectionId: id,
    workspaceId: input.workspaceId,
    ownerId: input.ownerId,
    connectorId: input.connectorId,
  });
  if (!auth.ok) {
    return { ok: false, status: 502, error: auth.error };
  }

  return {
    ok: true,
    connection: connectionRowToPublic(inserted as ConnectorConnectionRow),
    reused: false,
    authorizationUrl: auth.authorizationUrl,
  };
}

async function beginProviderAuthorization(input: {
  connectionId: string;
  workspaceId: string;
  ownerId: string;
  connectorId: string;
}): Promise<
  | { ok: true; authorizationUrl: string }
  | { ok: false; error: string }
> {
  const provider = getConnectorProvider();
  if (provider.name === "noop") {
    const config = composioConfigurationStatus();
    const present =
      config.present.length > 0
        ? ` Server sees: ${config.present.join(", ")}.`
        : " Server sees no COMPOSIO_* variables.";
    const emptyHint = process.env.COMPOSIO_API_KEY === ""
      ? " COMPOSIO_API_KEY is set but empty."
      : "";
    return {
      ok: false,
      error: config.missing.length
        ? `Composio is not configured on the server. Missing: ${config.missing.join(", ")}.${emptyHint}${present} Set COMPOSIO_API_KEY (or COMPOSIO_KEY) on the cander Vercel project for Production, then redeploy.`
        : `Composio is not configured on the server. Redeploy after setting env vars.${present}`,
    };
  }

  const begin = await provider.beginAuthorization({
    connectorId: input.connectorId,
    workspaceId: input.workspaceId,
    ownerId: input.ownerId,
  });
  if (!begin.ok || !begin.authorizationUrl) {
    return {
      ok: false,
      error: begin.error ?? "Could not start authorization with Composio.",
    };
  }

  const admin = createSupabaseAdminClient();
  await createOAuthState(admin, {
    connectionId: input.connectionId,
    workspaceId: input.workspaceId,
    ownerId: input.ownerId,
    connectorId: input.connectorId,
    linkSessionRef: begin.linkSessionRef ?? null,
  });
  await admin
    .from("connector_connections")
    .update({
      composio_user_id: composioUserId(input.workspaceId, input.ownerId),
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.connectionId)
    .eq("owner_id", input.ownerId);

  return { ok: true, authorizationUrl: begin.authorizationUrl };
}

export async function verifyOAuthCallback(input: {
  ownerId: string;
  sessionUri: string;
}): Promise<
  | { ok: true; connection: ConnectorConnection; workspaceId: string }
  | { ok: false; status: number; error: string }
> {
  const admin = createSupabaseAdminClient();
  const {
    claimOAuthStateForCallback,
    recordOAuthVerification,
    completeOAuthCallbackAtomic,
    failOAuthState,
  } = await import("./oauth-callback.ts");
  const { recoverOAuthStateForOwner } = await import("./oauth-recovery.ts");

  const claim = await claimOAuthStateForCallback(admin, input.ownerId);
  if (!claim.ok) {
    if (claim.reason === "processing") {
      const recovered = await recoverOAuthStateForOwner(admin, input.ownerId);
      if (recovered) {
        return {
          ok: true,
          connection: recovered,
          workspaceId: recovered.workspaceId,
        };
      }
      const oauthWorkspace = await findOAuthWorkspaceForOwner(admin, input.ownerId);
      const active = await findActiveConnectionForOwnerOAuth(
        admin,
        input.ownerId,
        oauthWorkspace ?? undefined,
      );
      if (active) {
        return {
          ok: true,
          connection: active.connection,
          workspaceId: active.workspaceId,
        };
      }
      return {
        ok: false,
        status: 409,
        error: "Connection request is already being processed.",
      };
    }
    const status = claim.reason === "not_found" ? 404 : 410;
    return { ok: false, status, error: "Connection request is no longer valid." };
  }

  const state = claim.state;
  if (claim.alreadyActive) {
    const { data: connectionRow, error: connectionError } = await admin
      .from("connector_connections")
      .select("*")
      .eq("id", state.connection_id)
      .eq("owner_id", input.ownerId)
      .eq("workspace_id", state.workspace_id)
      .is("deleted_at", null)
      .maybeSingle();
    if (connectionError) throw connectionError;
    if (!connectionRow || connectionRow.status !== "active") {
      return { ok: false, status: 409, error: "Connection request is no longer valid." };
    }
    return {
      ok: true,
      connection: connectionRowToPublic(connectionRow as ConnectorConnectionRow),
      workspaceId: state.workspace_id,
    };
  }

  const { data: connectionRow, error: connectionError } = await admin
    .from("connector_connections")
    .select("*")
    .eq("id", state.connection_id)
    .eq("owner_id", input.ownerId)
    .eq("workspace_id", state.workspace_id)
    .eq("connector_id", state.connector_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (connectionError) throw connectionError;
  if (!connectionRow) {
    return { ok: false, status: 404, error: "Connection request is no longer valid." };
  }
  const row = connectionRow as ConnectorConnectionRow;
  if (row.status !== "pending") {
    return { ok: false, status: 409, error: "Connection request is no longer valid." };
  }

  const provider = getConnectorProvider();
  const verified = await provider.completeCallbackVerification({
    sessionUri: input.sessionUri,
    composioUserId: state.composio_user_id,
    expectedLinkSessionRef: state.link_session_ref,
  });
  if (!verified.ok || !verified.providerConnectionId) {
    await failOAuthState(admin, {
      oauthStateId: state.id,
      ownerId: input.ownerId,
      failureDetail: verified.failureDetail ?? "Authorization could not be verified.",
    });
    return { ok: false, status: 400, error: "Connection could not be verified." };
  }

  await recordOAuthVerification(admin, {
    oauthStateId: state.id,
    ownerId: input.ownerId,
    providerConnectionId: verified.providerConnectionId,
  });

  const connection = await completeOAuthCallbackAtomic(admin, {
    oauthStateId: state.id,
    ownerId: input.ownerId,
    providerConnectionId: verified.providerConnectionId,
    composioUserId: state.composio_user_id,
  });

  return {
    ok: true,
    connection,
    workspaceId: state.workspace_id,
  };
}

async function findOAuthWorkspaceForOwner(
  admin: SupabaseClient,
  ownerId: string,
): Promise<string | null> {
  const { data, error } = await admin
    .from("connector_oauth_states")
    .select("workspace_id")
    .eq("owner_id", ownerId)
    .in("status", ["pending", "processing"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  const workspaceId =
    data && typeof data.workspace_id === "string" ? data.workspace_id.trim() : "";
  return workspaceId || null;
}

async function findActiveConnectionForOwnerOAuth(
  admin: SupabaseClient,
  ownerId: string,
  workspaceId?: string,
): Promise<{ connection: ConnectorConnection; workspaceId: string } | null> {
  let query = admin
    .from("connector_connections")
    .select("*")
    .eq("owner_id", ownerId)
    .eq("status", "active")
    .is("deleted_at", null);
  if (workspaceId) {
    query = query.eq("workspace_id", workspaceId);
  }
  const { data, error } = await query
    .order("connected_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const connection = connectionRowToPublic(data as ConnectorConnectionRow);
  return { connection, workspaceId: connection.workspaceId };
}

export async function disconnectConnection(input: {
  client: SupabaseClient;
  connectionId: string;
  ownerId: string;
  workspaceId: string;
}): Promise<
  | { ok: true; connection: ConnectorConnection; alreadyDisconnected: boolean }
  | { ok: false; status: number; error: string }
> {
  const { data, error } = await input.client
    .from("connector_connections")
    .select("*")
    .eq("id", input.connectionId)
    .eq("owner_id", input.ownerId)
    .eq("workspace_id", input.workspaceId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    return { ok: false, ...connectionNotFoundError() };
  }

  const row = data as ConnectorConnectionRow;
  if (row.status === "disconnected") {
    return {
      ok: true,
      connection: connectionRowToPublic(row),
      alreadyDisconnected: true,
    };
  }

  const providerRef = row.provider_connection_id?.trim();
  if (providerRef) {
    const provider = getConnectorProvider();
    if (provider.name !== "noop") {
      const revoked = await provider.disconnect({ providerConnectionId: providerRef });
      if (!revoked.ok) {
        return {
          ok: false,
          status: 502,
          error: "Could not disconnect from provider. Try again shortly.",
        };
      }
    }
  }

  const admin = createSupabaseAdminClient();
  const updated = await reconcileConnectionDisconnected(admin, input.connectionId);

  await recordConnectorAuditEvent(input.client, {
    workspaceId: input.workspaceId,
    actorId: input.ownerId,
    connectionId: input.connectionId,
    connectorId: row.connector_id,
    eventType: "connection_disconnected",
    detail: {
      reason_code: "disconnected",
      connector_id: row.connector_id,
      connection_id: input.connectionId,
      workspace_id: input.workspaceId,
    },
  });

  return {
    ok: true,
    connection: updated,
    alreadyDisconnected: false,
  };
}

async function expireStalePendingConnections(input: {
  client: SupabaseClient;
  workspaceId: string;
  ownerId: string;
}) {
  const { data, error } = await input.client
    .from("connector_connections")
    .select("*")
    .eq("workspace_id", input.workspaceId)
    .eq("owner_id", input.ownerId)
    .eq("status", "pending")
    .is("deleted_at", null);
  if (error) throw error;

  const stale = ((data ?? []) as ConnectorConnectionRow[]).filter((row) =>
    isPendingExpired(row),
  );
  if (!stale.length) return;

  const ids = stale.map((row) => row.id);
  const { error: updateError } = await input.client
    .from("connector_connections")
    .update({
      status: "failed",
      failure_detail: "Connection request expired.",
      pending_expires_at: null,
    })
    .in("id", ids)
    .eq("owner_id", input.ownerId);
  if (updateError) throw updateError;

  for (const row of stale) {
    await recordConnectorAuditEvent(input.client, {
      workspaceId: input.workspaceId,
      actorId: input.ownerId,
      connectionId: row.id,
      connectorId: row.connector_id,
      eventType: "connection_failed",
      detail: {
        reason_code: "expired_pending",
        connector_id: row.connector_id,
        connection_id: row.id,
        workspace_id: input.workspaceId,
      },
    });
  }
}
