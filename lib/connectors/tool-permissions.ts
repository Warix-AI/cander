/**
 * Server helpers for persisting connector tool permissions on connections.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  resolveToolPermissions,
  toolsForConnector,
  type ConnectorToolAccess,
  setAccessTier,
} from "./tool-catalog.ts";
import { connectionNotFoundError } from "./authz.ts";
import type { ConnectorConnection } from "./types.ts";
import { connectionRowToPublic, type ConnectorConnectionRow } from "./mapper.ts";

export function sanitizeToolPermissionsPatch(
  connectorId: string,
  patch: Record<string, unknown>,
): Record<string, boolean> {
  const allowed = new Set(toolsForConnector(connectorId).map((tool) => tool.id));
  const out: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (!allowed.has(key) || typeof value !== "boolean") continue;
    out[key] = value;
  }
  return out;
}

export function mergeToolPermissions(
  connectorId: string,
  current: Record<string, boolean> | null | undefined,
  patch: Record<string, boolean>,
): Record<string, boolean> {
  const base = resolveToolPermissions(connectorId, current);
  return { ...base, ...patch };
}

export function patchAccessTier(
  connectorId: string,
  access: ConnectorToolAccess,
  enabled: boolean,
  current: Record<string, boolean> | null | undefined,
): Record<string, boolean> {
  return setAccessTier(connectorId, access, enabled, current);
}

export async function updateConnectionToolPermissions(input: {
  client: SupabaseClient;
  connectionId: string;
  ownerId: string;
  workspaceId: string;
  permissions: Record<string, boolean>;
}): Promise<
  | { ok: true; connection: ConnectorConnection }
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

  const row = data as ConnectorConnectionRow & {
    tool_permissions?: Record<string, boolean> | null;
  };
  const merged = mergeToolPermissions(
    row.connector_id,
    row.tool_permissions ?? {},
    input.permissions,
  );

  const { data: updated, error: updateError } = await input.client
    .from("connector_connections")
    .update({
      tool_permissions: merged,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.connectionId)
    .eq("owner_id", input.ownerId)
    .select("*")
    .maybeSingle();
  if (updateError) throw updateError;
  if (!updated) {
    return { ok: false, ...connectionNotFoundError() };
  }

  const publicRow = connectionRowToPublic(updated as ConnectorConnectionRow);
  return {
    ok: true,
    connection: {
      ...publicRow,
      toolPermissions: merged,
    },
  };
}
