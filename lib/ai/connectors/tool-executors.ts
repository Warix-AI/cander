/**
 * Connector tool executors — client-side bridge to /api/connectors/tools/execute.
 */

import { executeConnectorToolRequest } from "@/lib/api/connector-client";
import { getTurnWorkspaceId } from "@/lib/ai/runtime/turn-context";
import type { AiToolCallResult } from "@/lib/ai/runtime/tools";
import { getCanderTool } from "@/lib/ai/tools/cander-registry";

export async function executeConnectorToolClient(
  call: {
    name: string;
    args: Record<string, unknown>;
    connectionId?: string;
  },
  workspaceIdOverride?: string | null,
): Promise<AiToolCallResult | null> {
  const tool = getCanderTool(call.name);
  if (!tool?.connectorId) return null;

  const workspaceId =
    workspaceIdOverride?.trim() || getTurnWorkspaceId()?.trim() || null;
  if (!workspaceId) {
    return {
      name: call.name,
      ok: false,
      output: "No active workspace for connector tools.",
    };
  }

  try {
    const result = await executeConnectorToolRequest({
      workspaceId,
      tool: call.name,
      arguments: call.args,
      connectionId: call.connectionId,
    });
    return {
      name: call.name,
      ok: true,
      output: result.output,
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Connector tool execution failed.";
    return {
      name: call.name,
      ok: false,
      output: message,
    };
  }
}

/** @deprecated Use executeConnectorToolClient */
export async function executeConnectorGmailTool(
  call: {
    name: string;
    args: Record<string, unknown>;
  },
  workspaceIdOverride?: string | null,
): Promise<AiToolCallResult | null> {
  return executeConnectorToolClient(call, workspaceIdOverride);
}
