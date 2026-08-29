/**
 * Internal tool registry with typed validation.
 * Executors run via app-actions / clarification store on the client.
 */

export type AiToolPermission = {
  requireWorkspaceMember: boolean;
  capability?: string;
  /** Require explicit user confirmation before execute. */
  requiresConfirmation?: boolean;
};

export type AiToolDefinition = {
  name: string;
  description: string;
  permission: AiToolPermission;
  parameters: {
    type: "object";
    required?: string[];
    properties: Record<
      string,
      {
        type: string | string[];
        description?: string;
        enum?: string[];
        items?: { type: string };
      }
    >;
  };
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

function isType(value: unknown, type: string): boolean {
  if (type === "string") return typeof value === "string";
  if (type === "number") return typeof value === "number" && !Number.isNaN(value);
  if (type === "boolean") return typeof value === "boolean";
  if (type === "object") {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }
  if (type === "array") return Array.isArray(value);
  return true;
}

/** Validate tool arguments against the registered JSON-schema-like shape. */
export function validateToolArguments(
  tool: AiToolDefinition,
  args: Record<string, unknown> | undefined,
): { ok: true; args: Record<string, unknown> } | { ok: false; error: string } {
  const input = args ?? {};
  const required = tool.parameters.required ?? [];
  for (const key of required) {
    if (input[key] === undefined || input[key] === null || input[key] === "") {
      return { ok: false, error: `Missing required argument: ${key}` };
    }
  }
  for (const [key, value] of Object.entries(input)) {
    const schema = tool.parameters.properties[key];
    if (!schema) {
      return { ok: false, error: `Unknown argument: ${key}` };
    }
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => isType(value, t))) {
      return {
        ok: false,
        error: `Invalid type for ${key}: expected ${types.join("|")}`,
      };
    }
    if (schema.enum && !schema.enum.includes(String(value))) {
      return {
        ok: false,
        error: `Invalid value for ${key}: must be one of ${schema.enum.join(", ")}`,
      };
    }
  }
  return { ok: true, args: input };
}

registerAiTool({
  name: "nav.open",
  description: "Navigate to a Cander space, settings, Recents, Connectors, or New Chat.",
  permission: { requireWorkspaceMember: true },
  enabled: true,
  parameters: {
    type: "object",
    required: ["target"],
    properties: {
      target: {
        type: "string",
        enum: [
          "new_chat",
          "work",
          "build",
          "research",
          "recents",
          "connectors",
          "settings",
        ],
        description: "Where to navigate",
      },
      settingsTab: {
        type: "string",
        description: "Optional settings tab when target is settings",
      },
    },
  },
});

registerAiTool({
  name: "panel.open",
  description: "Open the side panel, optionally focused on a project.",
  permission: { requireWorkspaceMember: true },
  enabled: true,
  parameters: {
    type: "object",
    properties: {
      projectId: { type: "string" },
      mode: { type: "string" },
    },
  },
});

registerAiTool({
  name: "panel.close",
  description: "Close the side panel.",
  permission: { requireWorkspaceMember: true },
  enabled: true,
  parameters: { type: "object", properties: {} },
});

registerAiTool({
  name: "project.create",
  description:
    "Create a new project. Ask for missing title/type/platform via ui.ask_clarification first.",
  permission: { requireWorkspaceMember: true },
  enabled: true,
  parameters: {
    type: "object",
    required: ["title"],
    properties: {
      title: { type: "string" },
      space: {
        type: "string",
        enum: ["build", "research", "work", "chat"],
      },
      kind: { type: "string" },
      summary: { type: "string" },
    },
  },
});

registerAiTool({
  name: "project.open",
  description: "Open an existing project by id.",
  permission: { requireWorkspaceMember: true },
  enabled: true,
  parameters: {
    type: "object",
    required: ["projectId"],
    properties: { projectId: { type: "string" } },
  },
});

registerAiTool({
  name: "workspace.search",
  description: "Search projects the user can access in the current workspace.",
  permission: { requireWorkspaceMember: true },
  enabled: true,
  parameters: {
    type: "object",
    required: ["query"],
    properties: { query: { type: "string" } },
  },
});

registerAiTool({
  name: "ui.ask_clarification",
  description:
    "Show an inline clarification card above the chat composer to collect structured answers.",
  permission: { requireWorkspaceMember: true },
  enabled: true,
  parameters: {
    type: "object",
    required: ["title", "questions"],
    properties: {
      title: { type: "string" },
      description: { type: "string" },
      questions: { type: "array", items: { type: "object" } },
      resumeTool: { type: "string" },
      resumeArguments: { type: "object" },
    },
  },
});

registerAiTool({
  name: "ui.confirm",
  description:
    "Ask the user to confirm a sensitive or destructive action before proceeding.",
  permission: { requireWorkspaceMember: true, requiresConfirmation: true },
  enabled: true,
  parameters: {
    type: "object",
    required: ["title", "message"],
    properties: {
      title: { type: "string" },
      message: { type: "string" },
      confirmLabel: { type: "string" },
    },
  },
});
