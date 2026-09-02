/**
 * Connector tool execution — delegates to generalized executor.
 * Preserves legacy ExecuteConnectorToolInput shape for existing routes.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  executeConnectorTool as executeGeneric,
  type ExecuteConnectorToolResult as GenericResult,
} from "./executor.ts";

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
  confirmed?: boolean;
};

export type ExecuteConnectorToolResult =
  | { ok: true; output: string }
  | { ok: false; status: number; error: string };

export async function executeConnectorTool(
  input: ExecuteConnectorToolInput,
): Promise<ExecuteConnectorToolResult> {
  const result: GenericResult = await executeGeneric(input);
  if (result.ok) {
    return { ok: true, output: result.output };
  }
  return { ok: false, status: result.status, error: result.error };
}

export { executeGeneric as executeConnectorToolDetailed };
