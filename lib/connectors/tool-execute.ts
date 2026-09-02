/**
 * Connector tool execution — server-only, owner-scoped Gmail tools.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { composioUserId } from "./composio-identity.ts";
import { executeComposioTool, isComposioConfigured } from "./composio-http.ts";
import {
  formatGmailToolOutput,
  GMAIL_COMPOSIO_SLUGS,
  mapGmailToolArguments,
  type GmailConnectorToolName,
} from "./composio-tools.ts";
import type { ConnectorConnectionRow } from "./mapper.ts";
import { authorizeConnectorToolAction } from "./tool-authz.ts";

export type ExecuteConnectorToolInput = {
  client: SupabaseClient;
  workspaceId: string;
  profileId: string;
  tool: GmailConnectorToolName;
  arguments: Record<string, unknown>;
};

export type ExecuteConnectorToolResult =
  | { ok: true; output: string }
  | { ok: false; status: number; error: string };

function isGmailConnectorTool(tool: string): tool is GmailConnectorToolName {
  return (
    tool === "gmail.search" ||
    tool === "gmail.read" ||
    tool === "gmail.send" ||
    tool === "gmail.draft" ||
    tool === "gmail.reply"
  );
}

async function resolveActiveGmailConnection(input: {
  client: SupabaseClient;
  workspaceId: string;
  profileId: string;
}): Promise<
  | {
      ok: true;
      connectionId: string;
      providerConnectionId: string;
      toolPermissions: Record<string, boolean>;
    }
  | { ok: false; status: number; error: string }
> {
  const { data: catalog, error: catalogError } = await input.client
    .from("connector_catalog")
    .select("enabled")
    .eq("id", "gmail")
    .maybeSingle();
  if (catalogError) throw catalogError;
  if (!catalog?.enabled) {
    return {
      ok: false,
      status: 403,
      error: "Gmail connector is not enabled for this workspace.",
    };
  }

  const { data, error } = await input.client
    .from("connector_connections")
    .select("id, provider_connection_id, status, connector_id, owner_id, tool_permissions")
    .eq("workspace_id", input.workspaceId)
    .eq("owner_id", input.profileId)
    .eq("connector_id", "gmail")
    .eq("status", "active")
    .is("deleted_at", null)
    .order("connected_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;

  const row = data as ConnectorConnectionRow | null;
  if (!row?.provider_connection_id) {
    return {
      ok: false,
      status: 404,
      error: "Connect Gmail in Connectors before asking about email.",
    };
  }

  return {
    ok: true,
    connectionId: row.id,
    providerConnectionId: row.provider_connection_id,
    toolPermissions: row.tool_permissions ?? {},
  };
}

export async function executeConnectorTool(
  input: ExecuteConnectorToolInput,
): Promise<ExecuteConnectorToolResult> {
  if (!isGmailConnectorTool(input.tool)) {
    return { ok: false, status: 400, error: "Unsupported connector tool." };
  }

  if (!isComposioConfigured()) {
    return {
      ok: false,
      status: 503,
      error: "Gmail connector is not configured on this server.",
    };
  }

  const connection = await resolveActiveGmailConnection({
    client: input.client,
    workspaceId: input.workspaceId,
    profileId: input.profileId,
  });
  if (!connection.ok) {
    return connection;
  }

  const authz = authorizeConnectorToolAction({
    workspaceId: input.workspaceId,
    profileId: input.profileId,
    connectorId: "gmail",
    toolName: input.tool,
    toolPermissions: connection.toolPermissions,
    connectionId: connection.connectionId,
  });
  if (!authz.ok) {
    if (authz.reason === "not_allowed") {
      const message =
        input.tool === "gmail.send" ||
        input.tool === "gmail.draft" ||
        input.tool === "gmail.reply"
          ? "Sending email is disabled. Enable write access for Gmail in Connectors."
          : "This Gmail action is not allowed.";
      return { ok: false, status: 403, error: message };
    }
    if (authz.reason === "not_connected") {
      return {
        ok: false,
        status: 404,
        error: "Connect Gmail in Connectors before asking about email.",
      };
    }
    return { ok: false, status: 403, error: "Gmail connector is disabled." };
  }

  let composioArgs: Record<string, unknown>;
  try {
    composioArgs = mapGmailToolArguments(input.tool, input.arguments);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid tool arguments.";
    return { ok: false, status: 400, error: message };
  }

  const composioUid = composioUserId(input.workspaceId, input.profileId);
  const slug = GMAIL_COMPOSIO_SLUGS[input.tool];

  try {
    const raw = await executeComposioTool({
      toolSlug: slug,
      composioUserId: composioUid,
      connectedAccountId: connection.providerConnectionId,
      arguments: composioArgs,
    });
    return {
      ok: true,
      output: formatGmailToolOutput(input.tool, raw),
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Gmail tool execution failed.";
    return { ok: false, status: 502, error: message };
  }
}
