/**
 * Server helpers for persisting connector tool permissions on connections.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { mergeToolPermissions } from "./tool-catalog.ts";
import { connectionNotFoundError } from "./authz.ts";
import type { ConnectorConnection } from "./types.ts";
import { connectionRowToPublic, asConnectionRow, CONNECTOR_CONNECTION_PUBLIC_COLUMNS, type ConnectorConnectionRow } from "./mapper.ts";

export {
  mergeToolPermissions,
  patchAccessTier,
  sanitizeToolPermissionsPatch,
} from "./tool-catalog.ts";

export function extractConnectorErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (
    err &&
    typeof err === "object" &&
    "message" in err &&
    typeof (err as { message: unknown }).message === "string"
  ) {
    return (err as { message: string }).message;
  }
  return "Could not update tool permissions.";
}

function permissionsPersistenceError(err: unknown): { status: number; error: string } {
  const message = extractConnectorErrorMessage(err);
  if (/tool_permissions|column.*does not exist|PGRST204/i.test(message)) {
    return {
      status: 503,
      error:
        "Tool permissions are not available on this database yet. Apply migrations 042_connector_tool_permissions.sql and 043_connector_tool_permissions_rpc.sql.",
    };
  }
  if (/function.*does not exist|42883/i.test(message)) {
    return {
      status: 503,
      error:
        "Tool permissions RPC is not available yet. Apply migration 043_connector_tool_permissions_rpc.sql.",
    };
  }
  if (/connection not found/i.test(message)) {
    return { status: 404, error: "Connection not found." };
  }
  if (/not authenticated|workspace access denied/i.test(message)) {
    return { status: 403, error: message };
  }
  return { status: 500, error: message };
}

function isMissingRpcError(err: unknown): boolean {
  const message = extractConnectorErrorMessage(err);
  return /function.*does not exist|42883/i.test(message);
}

async function persistToolPermissionsDirect(input: {
  client: SupabaseClient;
  connectionId: string;
  ownerId: string;
  workspaceId: string;
  merged: Record<string, boolean>;
}): Promise<
  | { ok: true; connection: ConnectorConnection }
  | { ok: false; status: number; error: string }
> {
  const { data: updated, error: updateError } = await input.client
    .from("connector_connections")
    .update({
      tool_permissions: input.merged,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.connectionId)
    .eq("owner_id", input.ownerId)
    .eq("workspace_id", input.workspaceId)
    .is("deleted_at", null)
    .select(CONNECTOR_CONNECTION_PUBLIC_COLUMNS)
    .maybeSingle();
  if (updateError) {
    const mapped = permissionsPersistenceError(updateError);
    return { ok: false, ...mapped };
  }
  if (!updated) {
    return { ok: false, ...connectionNotFoundError() };
  }

  const publicRow = connectionRowToPublic(asConnectionRow(updated));
  return {
    ok: true,
    connection: {
      ...publicRow,
      toolPermissions: input.merged,
    },
  };
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
    .select("id, connector_id, owner_id, workspace_id, tool_permissions")
    .eq("id", input.connectionId)
    .eq("owner_id", input.ownerId)
    .eq("workspace_id", input.workspaceId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) {
    const mapped = permissionsPersistenceError(error);
    return { ok: false, ...mapped };
  }
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

  const { data: updated, error: rpcError } = await input.client.rpc(
    "update_connector_tool_permissions",
    {
      p_connection_id: input.connectionId,
      p_workspace_id: input.workspaceId,
      p_permissions: merged,
    },
  );

  if (!rpcError && updated) {
    const publicRow = connectionRowToPublic(updated as ConnectorConnectionRow);
    return {
      ok: true,
      connection: {
        ...publicRow,
        toolPermissions: merged,
      },
    };
  }

  if (rpcError && !isMissingRpcError(rpcError)) {
    const mapped = permissionsPersistenceError(rpcError);
    return { ok: false, ...mapped };
  }

  return persistToolPermissionsDirect({
    client: input.client,
    connectionId: input.connectionId,
    ownerId: input.ownerId,
    workspaceId: input.workspaceId,
    merged,
  });
}
