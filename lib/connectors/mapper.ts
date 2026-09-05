import { randomUUID } from "crypto";
import { resolveToolPermissions } from "./tool-catalog.ts";
import type {
  ConnectorCatalogItem,
  ConnectorConnection,
  ConnectorConnectionStatus,
} from "./types.ts";

export type ConnectorConnectionRow = {
  id: string;
  workspace_id: string;
  owner_id: string;
  connector_id: string;
  connection_mode: "personal" | "workspace_shared";
  status: ConnectorConnectionStatus;
  provider_connection_id: string | null;
  provider_name: string | null;
  failure_detail: string | null;
  connected_by: string;
  created_at: string;
  updated_at: string;
  connected_at: string | null;
  disconnected_at: string | null;
  last_sync_at: string | null;
  pending_expires_at: string | null;
  deleted_at: string | null;
  tool_permissions?: Record<string, boolean> | null;
};

export type ConnectorCatalogRow = {
  id: string;
  name: string;
  category: string;
  description: string;
  icon: string;
  scope: "public" | "personal";
  featured: boolean;
  actions: string[] | unknown;
  panel_type: "gmail" | "handshake" | "generic";
  display_order: number;
  enabled: boolean;
  coming_soon: boolean;
  provider_toolkit_id: string | null;
};

const SECRET_ROW_KEYS = [
  "token_ref",
  "provider_connection_id",
  "composio_user_id",
  "access_token",
  "refresh_token",
] as const;

/**
 * Columns safe for authenticated PostgREST SELECT after migration 050
 * (provider_connection_id / composio_user_id are service-role only).
 */
export const CONNECTOR_CONNECTION_PUBLIC_COLUMNS = [
  "id",
  "workspace_id",
  "owner_id",
  "connector_id",
  "connection_mode",
  "status",
  "provider_name",
  "failure_detail",
  "connected_by",
  "created_at",
  "updated_at",
  "connected_at",
  "disconnected_at",
  "last_sync_at",
  "pending_expires_at",
  "deleted_at",
  "tool_permissions",
].join(", ");

/** Public columns plus server-only secrets — use only with service role. */
export const CONNECTOR_CONNECTION_SERVER_COLUMNS = [
  CONNECTOR_CONNECTION_PUBLIC_COLUMNS,
  "provider_connection_id",
  "composio_user_id",
].join(", ");

/**
 * Supabase types dynamic `.select(string)` results as GenericStringError.
 * Cast after the query error check — column lists are intentional.
 */
export function asConnectionRow(data: unknown): ConnectorConnectionRow {
  return data as ConnectorConnectionRow;
}

export function asConnectionRows(data: unknown): ConnectorConnectionRow[] {
  return (Array.isArray(data) ? data : []) as ConnectorConnectionRow[];
}

/** Strip secret fields before any client-facing response. */
export function connectionRowToPublic(row: ConnectorConnectionRow): ConnectorConnection {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    connectorId: row.connector_id,
    status: row.status,
    connectionMode: row.connection_mode,
    failureDetail: row.failure_detail,
    toolPermissions: resolveToolPermissions(
      row.connector_id,
      row.tool_permissions ?? {},
    ),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    connectedAt: row.connected_at,
    disconnectedAt: row.disconnected_at,
    pendingExpiresAt: row.pending_expires_at,
  };
}

export function catalogRowToPublic(row: ConnectorCatalogRow): ConnectorCatalogItem {
  const actions = Array.isArray(row.actions)
    ? row.actions.filter((item): item is string => typeof item === "string")
    : [];
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    description: row.description,
    icon: row.icon,
    featured: row.featured,
    displayOrder: row.display_order,
    enabled: row.enabled,
    comingSoon: row.coming_soon,
    scope: row.scope,
    actions,
    panelType: row.panel_type,
  };
}

export function assertNoSecretKeys(payload: Record<string, unknown>) {
  for (const key of SECRET_ROW_KEYS) {
    if (key in payload && payload[key] != null) {
      throw new Error(`Secret field leaked in connector response: ${key}`);
    }
  }
}

export function isPendingExpired(row: ConnectorConnectionRow, now = Date.now()): boolean {
  if (row.status !== "pending" || !row.pending_expires_at) return false;
  return Date.parse(row.pending_expires_at) <= now;
}

export const PENDING_TTL_MS = 24 * 60 * 60 * 1000;

export function pendingExpiresAtIso(from = Date.now()): string {
  return new Date(from + PENDING_TTL_MS).toISOString();
}

export function newConnectionId(): string {
  return `conn_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

export function newAuditEventId(): string {
  return `ca_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
}
