/**
 * Tool/MCP seam for AIRuntime.
 *
 * Architecture (future agent loop):
 *   User → AIRuntime → model may request tool → executeAuthorizedTool → model → reply
 *
 * Do not rebuild MCP here — adapt existing registries.
 * Tools stay disabled until real executors exist; LOCAL must not silently send
 * tool payloads to cloud unless the tool itself requires a network call.
 */

import {
  getAiTool,
  listAiTools,
  resolveAuthorizedToolNames,
  type AiToolDefinition,
} from "@/lib/ai/tools/registry";

export type AiToolCallRequest = {
  name: string;
  arguments?: Record<string, unknown>;
};

export type AiToolCallResult = {
  name: string;
  ok: boolean;
  /** Small authorized payload — never dump secrets. */
  output: string;
};

/** Tools the runtime may expose to a model (enabled only). */
export function listRuntimeTools(): AiToolDefinition[] {
  return listAiTools().filter((tool) => tool.enabled);
}

/**
 * Execute a tool only if registered + enabled.
 * Placeholder until MCP/connectors wire real handlers.
 */
export async function executeAuthorizedTool(
  call: AiToolCallRequest,
): Promise<AiToolCallResult> {
  const resolved = resolveAuthorizedToolNames([call.name]);
  const tool = resolved[0] ?? getAiTool(call.name);
  if (!tool || !tool.enabled) {
    return {
      name: call.name,
      ok: false,
      output: `Tool unavailable: ${call.name}`,
    };
  }
  // No live executors yet — keep the seam honest.
  return {
    name: tool.name,
    ok: false,
    output: `Tool “${tool.name}” is registered but not implemented yet.`,
  };
}

export { resolveAuthorizedToolNames };
