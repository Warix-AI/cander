/**
 * Generic connector executor — authorization, idempotency, adapter, provider.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getCanderTool, connectorIdFromToolId } from "../ai/tools/cander-registry.ts";
import type { ToolExecutionResult } from "../ai/tools/types.ts";
import { composioUserId } from "./composio-identity.ts";
import { executeComposioTool, isComposioConfigured, composioConfigurationStatus } from "./composio-http.ts";
import { getConnectorAdapter } from "./adapters/index.ts";
import {
  authorizeToolExecution,
  authorizeConnectorToolAction,
} from "./authorization.ts";
import { resolveConnectionForTool } from "./connections.ts";
import {
  buildIdempotencyKey,
  isWriteRisk,
  lookupIdempotentExecution,
  persistIdempotentExecution,
} from "../ai/state/idempotency.ts";
import {
  buildDeniedResult,
  buildErrorResult,
} from "./adapters/types.ts";
import {
  formatGmailToolOutput,
  GMAIL_COMPOSIO_SLUGS,
  mapGmailToolArguments,
  type GmailConnectorToolName,
} from "./composio-tools.ts";

export type ExecuteConnectorToolInput = {
  client: SupabaseClient;
  workspaceId: string;
  profileId: string;
  tool: string;
  arguments: Record<string, unknown>;
  connectionId?: string | null;
  toolCallId?: string | null;
  turnId?: string | null;
  chatId?: string | null;
  /**
   * Trusted server confirmation (agent loop). Untrusted HTTP routes must pass
   * false / omit — never forward a client `confirmed` boolean.
   */
  confirmed?: boolean;
};

export type ExecuteConnectorToolResult =
  | { ok: true; output: string; result: ToolExecutionResult }
  | {
      ok: false;
      status: number;
      error: string;
      denial?: ReturnType<typeof authorizeToolExecution> & { ok: false };
      result?: ToolExecutionResult;
    };

function isGmailTool(tool: string): tool is GmailConnectorToolName {
  return tool in GMAIL_COMPOSIO_SLUGS;
}

/**
 * Generalized executor used by the agent runtime.
 * Also preserves legacy string `output` for existing /api/connectors/tools/execute callers.
 */
export async function executeConnectorTool(
  input: ExecuteConnectorToolInput,
): Promise<ExecuteConnectorToolResult> {
  const toolDef = getCanderTool(input.tool);
  const connectorId =
    toolDef?.connectorId ?? connectorIdFromToolId(input.tool);
  if (!connectorId || !toolDef) {
    return { ok: false, status: 400, error: "Unsupported connector tool." };
  }

  const toolCallId =
    input.toolCallId?.trim() ||
    `call_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;

  if (!isComposioConfigured()) {
    const status = composioConfigurationStatus();
    return {
      ok: false,
      status: 503,
      error:
        `${connectorId} is connected in your workspace, but this server can’t call Composio yet. ` +
        `Missing: ${status.missing.join(", ") || "COMPOSIO_*"}. ` +
        `Add them to .env.local (see .env.example), restart the server, then ask again.`,
    };
  }

  const resolved = await resolveConnectionForTool({
    client: input.client,
    workspaceId: input.workspaceId,
    profileId: input.profileId,
    connectorId,
    connectionId: input.connectionId,
  });
  if (!resolved.ok) {
    return {
      ok: false,
      status: resolved.status,
      error: resolved.error,
      denial: {
        ok: false,
        reason:
          resolved.reason === "account_ambiguous"
            ? "account_ambiguous"
            : resolved.reason === "connector_disabled"
              ? "connector_disabled"
              : "not_connected",
        connectorId,
        skillId: input.tool,
        message: resolved.error,
        candidates: resolved.candidates,
      },
    };
  }

  const connection = resolved.connection;
  const authz = authorizeToolExecution(input.tool, {
    workspaceId: input.workspaceId,
    profileId: input.profileId,
    connection,
    confirmed: input.confirmed,
    arguments: input.arguments,
  });
  if (!authz.ok) {
    const status =
      authz.reason === "confirmation_required"
        ? 428
        : authz.reason === "not_connected"
          ? 404
          : 403;
    return {
      ok: false,
      status,
      error: authz.message,
      denial: authz,
      result: buildDeniedResult({
        toolId: input.tool,
        toolCallId,
        idempotencyKey: toolCallId,
        connectionId: connection.connectionId,
        code: authz.reason,
        message: authz.message,
      }),
    };
  }

  // Legacy authz parity for Gmail string paths
  const legacyAuthz = authorizeConnectorToolAction({
    workspaceId: input.workspaceId,
    profileId: input.profileId,
    connectorId,
    toolName: input.tool,
    toolPermissions: connection.toolPermissions,
    connectionId: connection.connectionId,
  });
  if (!legacyAuthz.ok) {
    return {
      ok: false,
      status: 403,
      error:
        toolDef.risk !== "read"
          ? "This action is disabled. Enable it in Connectors."
          : "This action is not allowed.",
    };
  }

  const adapter = getConnectorAdapter(connectorId);
  if (!adapter) {
    return {
      ok: false,
      status: 400,
      error: `No adapter registered for ${connectorId}.`,
    };
  }

  let providerArgs: Record<string, unknown>;
  try {
    providerArgs = adapter.mapArguments(input.tool, input.arguments);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid tool arguments.";
    return { ok: false, status: 400, error: message };
  }

  const idempotencyKey = buildIdempotencyKey({
    toolId: input.tool,
    connectionId: connection.connectionId,
    arguments: input.arguments,
    turnId: input.turnId,
    toolCallId,
  });

  if (isWriteRisk(toolDef.risk)) {
    const existing = await lookupIdempotentExecution({
      client: input.client,
      ownerId: input.profileId,
      idempotencyKey,
    });
    if (existing) {
      return {
        ok: true,
        output: JSON.stringify(existing.data ?? { outcome: "ok", cached: true }),
        result: existing,
      };
    }
  }

  const slug = adapter.providerSlug(input.tool);
  const composioUid = composioUserId(input.workspaceId, input.profileId);

  try {
    const raw = await executeComposioTool({
      toolSlug: slug,
      composioUserId: composioUid,
      connectedAccountId: connection.providerConnectionId,
      arguments: providerArgs,
    });

    const result = adapter.normalizeResult({
      toolId: input.tool,
      toolCallId,
      idempotencyKey,
      connectionId: connection.connectionId,
      raw,
    });

    if (isWriteRisk(toolDef.risk)) {
      await persistIdempotentExecution({
        client: input.client,
        ownerId: input.profileId,
        workspaceId: input.workspaceId,
        chatId: input.chatId,
        turnId: input.turnId,
        toolId: input.tool,
        connectionId: connection.connectionId,
        toolCallId,
        idempotencyKey,
        status: result.status,
        arguments: input.arguments,
        result,
      });
    }

    // Preserve Gmail string output format for legacy clients.
    const output =
      isGmailTool(input.tool)
        ? formatGmailToolOutput(input.tool, raw)
        : JSON.stringify(result.data ?? { outcome: result.status });

    return { ok: true, output, result };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Connector tool execution failed.";
    const result = buildErrorResult({
      toolId: input.tool,
      toolCallId,
      idempotencyKey,
      connectionId: connection.connectionId,
      code: "provider_error",
      message,
    });
    return { ok: false, status: 502, error: message, result };
  }
}

/** @deprecated Prefer executeConnectorTool — kept for mapGmailToolArguments tests. */
export { mapGmailToolArguments };
