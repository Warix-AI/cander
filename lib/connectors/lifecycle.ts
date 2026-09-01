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
  | { ok: true; connection: ConnectorConnection; reused: boolean }
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
      return {
        ok: true,
        connection: connectionRowToPublic(row),
        reused: true,
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
        return {
          ok: true,
          connection: connectionRowToPublic(raced as ConnectorConnectionRow),
          reused: true,
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

  return {
    ok: true,
    connection: connectionRowToPublic(inserted as ConnectorConnectionRow),
    reused: false,
  };
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

  const now = new Date().toISOString();
  const { data: updated, error: updateError } = await input.client
    .from("connector_connections")
    .update({
      status: "disconnected",
      disconnected_at: now,
      pending_expires_at: null,
    })
    .eq("id", input.connectionId)
    .eq("owner_id", input.ownerId)
    .select("*")
    .single();
  if (updateError) throw updateError;

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
    connection: connectionRowToPublic(updated as ConnectorConnectionRow),
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
