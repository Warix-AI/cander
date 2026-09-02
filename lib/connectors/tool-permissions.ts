/**
 * Server helpers for persisting connector tool permissions on connections.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { mergeToolPermissions } from "./tool-catalog.ts";
import { connectionNotFoundError } from "./authz.ts";
import type { ConnectorConnection } from "./types.ts";
import { connectionRowToPublic, type ConnectorConnectionRow } from "./mapper.ts";

export {
  mergeToolPermissions,
  patchAccessTier,
  sanitizeToolPermissionsPatch,
} from "./tool-catalog.ts";

function permissionsPersistenceError(err: unknown): { status: number; error: string } {
  const message = err instanceof Error ? err.message : "Could not update tool permissions.";
  if (/tool_permissions|column.*does not exist|PGRST204/i.test(message)) {
    return {
      status: 503,
      error:
        "Tool permissions are not available on this database yet. Apply migration 042_connector_tool_permissions.sql.",
    };
  }
  return { status: 500, error: message };
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

  try {
    const admin = createSupabaseAdminClient();
    const { data: updated, error: updateError } = await admin
      .from("connector_connections")
      .update({
        tool_permissions: merged,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.connectionId)
      .eq("owner_id", input.ownerId)
      .eq("workspace_id", input.workspaceId)
      .is("deleted_at", null)
      .select("*")
      .maybeSingle();
    if (updateError) {
      const mapped = permissionsPersistenceError(updateError);
      return { ok: false, ...mapped };
    }
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
  } catch (err) {
    const mapped = permissionsPersistenceError(err);
    return { ok: false, ...mapped };
  }
}
