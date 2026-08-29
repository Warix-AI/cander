/**
 * Internal tool registry — placeholders only.
 * Real tool execution must be server-side, authorized, and audited.
 * Never accept arbitrary client-supplied tool names or parameters.
 */

export type AiToolPermission = {
  /** Workspace membership required before the tool may run. */
  requireWorkspaceMember: boolean;
  /** Extra capability gate (future entitlements). */
  capability?: string;
};

export type AiToolDefinition = {
  name: string;
  description: string;
  permission: AiToolPermission;
  /** JSON-schema-like placeholder for future args. */
  parameters?: Record<string, unknown>;
  enabled: boolean;
};

const tools = new Map<string, AiToolDefinition>();

export function registerAiTool(tool: AiToolDefinition) {
  if (!/^[a-z][a-z0-9_.-]*$/i.test(tool.name)) {
    throw new Error(`Invalid tool name: ${tool.name}`);
  }
  tools.set(tool.name, tool);
}

export function getAiTool(name: string): AiToolDefinition | null {
  return tools.get(name) ?? null;
}

export function listAiTools(): AiToolDefinition[] {
  return [...tools.values()];
}

/** Resolve only explicitly registered, enabled tools — never pass-through client names. */
export function resolveAuthorizedToolNames(
  requested: string[] | undefined,
): AiToolDefinition[] {
  if (!requested?.length) return [];
  const out: AiToolDefinition[] = [];
  for (const name of requested) {
    const tool = tools.get(name);
    if (!tool || !tool.enabled) {
      throw new Error(`Unknown or disabled tool: ${name}`);
    }
    out.push(tool);
  }
  return out;
}

// Placeholders for future work — disabled until implemented.
registerAiTool({
  name: "workspace.search",
  description: "Search workspace projects the user is authorized to see.",
  permission: { requireWorkspaceMember: true },
  enabled: false,
  parameters: { type: "object", properties: { query: { type: "string" } } },
});

registerAiTool({
  name: "project.summary",
  description: "Summarize a project the user can access.",
  permission: { requireWorkspaceMember: true },
  enabled: false,
  parameters: { type: "object", properties: { projectId: { type: "string" } } },
});
