/**
 * Connector tool executors — client-side bridge to /api/connectors/tools/execute.
 */

import { executeConnectorToolRequest } from "@/lib/api/connector-client";
import { getTurnWorkspaceId } from "@/lib/ai/runtime/turn-context";
import type { AiToolCallResult } from "@/lib/ai/runtime/tools";

export async function executeConnectorGmailTool(
  call: {
    name: string;
    args: Record<string, unknown>;
  },
  workspaceIdOverride?: string | null,
): Promise<AiToolCallResult | null> {
  if (call.name !== "gmail.search" && call.name !== "gmail.read") {
    return null;
  }

  const workspaceId =
    workspaceIdOverride?.trim() || getTurnWorkspaceId()?.trim() || null;
  if (!workspaceId) {
    return {
      name: call.name,
      ok: false,
      output: "No active workspace for Gmail tools.",
    };
  }

  try {
    const result = await executeConnectorToolRequest({
      workspaceId,
      tool: call.name,
      arguments: call.args,
    });
    return {
      name: call.name,
      ok: true,
      output: result.output,
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Gmail tool execution failed.";
    return {
      name: call.name,
      ok: false,
      output: message,
    };
  }
}
