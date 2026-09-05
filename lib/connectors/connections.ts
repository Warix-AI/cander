/**
 * Connection resolution — multi-account aware, server-only.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CONNECTOR_CONNECTION_SERVER_COLUMNS,
  asConnectionRows,
  type ConnectorConnectionRow,
} from "./mapper.ts";

export type ResolvedConnection = {
  connectionId: string;
  connectorId: string;
  providerConnectionId: string;
  toolPermissions: Record<string, boolean>;
  label: string;
  status: string;
};

export type ResolveConnectionsResult =
  | { ok: true; connections: ResolvedConnection[] }
  | { ok: false; status: number; error: string };

export type ResolveAccountResult =
  | { ok: true; connection: ResolvedConnection }
  | {
      ok: false;
      reason: "not_connected" | "account_ambiguous" | "connector_disabled";
      status: number;
      error: string;
      candidates?: Array<{ connectionId: string; label: string }>;
    };

function connectionLabel(row: ConnectorConnectionRow): string {
  const base =
    row.connector_id === "gmail"
      ? "Gmail"
      : row.connector_id === "slack"
        ? "Slack"
        : row.connector_id;
  return base;
}

/**
 * List the caller's active connections including provider refs.
 * Uses service role for provider_connection_id (auth clients cannot SELECT it),
 * always scoped to the verified workspace + profile from the request.
 */
export async function listActiveConnections(input: {
  client: SupabaseClient;
  workspaceId: string;
  profileId: string;
  connectorId?: string;
}): Promise<ResolveConnectionsResult> {
  void input.client; // ownership already established by caller JWT/membership
  const { createSupabaseAdminClient } = await import("../supabase/admin.ts");
  const admin = createSupabaseAdminClient();
  let query = admin
    .from("connector_connections")
    .select(CONNECTOR_CONNECTION_SERVER_COLUMNS)
    .eq("workspace_id", input.workspaceId)
    .eq("owner_id", input.profileId)
    .eq("status", "active")
    .is("deleted_at", null)
    .order("connected_at", { ascending: false });

  if (input.connectorId) {
    query = query.eq("connector_id", input.connectorId);
  }

  const { data, error } = await query;
  if (error) throw error;

  const connections: ResolvedConnection[] = [];
  for (const row of asConnectionRows(data)) {
    if (!row.provider_connection_id) continue;
    connections.push({
      connectionId: row.id,
      connectorId: row.connector_id,
      providerConnectionId: row.provider_connection_id,
      toolPermissions: row.tool_permissions ?? {},
      label: connectionLabel(row),
      status: row.status,
    });
  }
  return { ok: true, connections };
}

export async function isConnectorCatalogEnabled(input: {
  client: SupabaseClient;
  connectorId: string;
}): Promise<boolean> {
  const { data, error } = await input.client
    .from("connector_catalog")
    .select("enabled")
    .eq("id", input.connectorId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data?.enabled);
}

export async function resolveConnectionForTool(input: {
  client: SupabaseClient;
  workspaceId: string;
  profileId: string;
  connectorId: string;
  connectionId?: string | null;
}): Promise<ResolveAccountResult> {
  const catalogEnabled = await isConnectorCatalogEnabled({
    client: input.client,
    connectorId: input.connectorId,
  });
  if (!catalogEnabled) {
    return {
      ok: false,
      reason: "connector_disabled",
      status: 403,
      error: `${input.connectorId} connector is not enabled for this workspace.`,
    };
  }

  const listed = await listActiveConnections({
    client: input.client,
    workspaceId: input.workspaceId,
    profileId: input.profileId,
    connectorId: input.connectorId,
  });
  if (!listed.ok) return listed as never;

  const matches = listed.connections;
  if (!matches.length) {
    return {
      ok: false,
      reason: "not_connected",
      status: 404,
      error: `Connect ${input.connectorId} in Connectors before using this tool.`,
    };
  }

  if (input.connectionId) {
    const found = matches.find((c) => c.connectionId === input.connectionId);
    if (!found) {
      return {
        ok: false,
        reason: "not_connected",
        status: 404,
        error: "Connection not found or not active.",
      };
    }
    return { ok: true, connection: found };
  }

  if (matches.length === 1) {
    return { ok: true, connection: matches[0]! };
  }

  return {
    ok: false,
    reason: "account_ambiguous",
    status: 409,
    error: `Multiple ${input.connectorId} accounts connected. Choose one.`,
    candidates: matches.map((c) => ({
      connectionId: c.connectionId,
      label: c.label,
    })),
  };
}
