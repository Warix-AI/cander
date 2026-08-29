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
  /** Domain bucket for progressive tool unlock. */
  domain?:
    | "core"
    | "clarification"
    | "navigation"
    | "projects"
    | "search"
    | "scheduling"
    | "comms"
    | "cloud_work"
    | "review";
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

/** Normalize aliases then validate; strip unknown keys instead of failing. */
export function normalizeToolArguments(
  toolName: string,
  args: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const input = { ...(args ?? {}) };

  // Common model inventions — drop, never ask the user for these.
  delete input.workspace_id;
  delete input.workspaceId;
  delete input.user_id;
  delete input.userId;

  if (toolName === "project.create") {
    if (input.name != null && input.title == null) input.title = input.name;
    if (input.description != null && input.summary == null) {
      input.summary = input.description;
    }
    delete input.name;
    delete input.description;
    if (typeof input.space === "string") {
      const s = input.space.toLowerCase();
      if (s === "explore") input.space = "research";
    }
  }

  if (toolName === "nav.open" && typeof input.target === "string") {
    const t = input.target.toLowerCase();
    if (t === "explore") input.target = "research";
    if (t === "home") input.target = "new_chat";
  }

  return input;
}

/** Validate tool arguments against the registered JSON-schema-like shape. */
export function validateToolArguments(
  tool: AiToolDefinition,
  args: Record<string, unknown> | undefined,
): { ok: true; args: Record<string, unknown> } | { ok: false; error: string } {
  const normalized = normalizeToolArguments(tool.name, args);
  const allowed = new Set(Object.keys(tool.parameters.properties));
  const input: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(normalized)) {
    if (allowed.has(key)) input[key] = value;
    // Unknown keys stripped — do not fail the call.
  }

  const required = tool.parameters.required ?? [];
  for (const key of required) {
    if (input[key] === undefined || input[key] === null || input[key] === "") {
      return { ok: false, error: `Missing required argument: ${key}` };
    }
  }
  for (const [key, value] of Object.entries(input)) {
    const schema = tool.parameters.properties[key];
    if (!schema) continue;
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => isType(value, t))) {
      return {
        ok: false,
        error: `Invalid type for ${key}: expected ${types.join("|")}`,
      };
    }
    if (schema.enum && !schema.enum.includes(String(value))) {
      // Soft-map explore→research already done; otherwise fail.
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
  domain: "navigation",
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
  domain: "navigation",
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
  domain: "navigation",
  enabled: true,
  parameters: { type: "object", properties: {} },
});

registerAiTool({
  name: "project.create",
  description:
    "Create a new project after title and space (build or research/Explore) are known. Prefer ui.ask_clarification if space is missing.",
  permission: { requireWorkspaceMember: true },
  domain: "projects",
  enabled: true,
  parameters: {
    type: "object",
    required: ["title", "space"],
    properties: {
      title: { type: "string" },
      space: {
        type: "string",
        enum: ["build", "research", "work"],
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
  domain: "projects",
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
  domain: "search",
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
  domain: "clarification",
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
  domain: "clarification",
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

registerAiTool({
  name: "create_work_task",
  description:
    "Queue complex coding, research, or multi-step work for backend execution. Use only when local tools cannot finish the job. Do not invent other cloud tools.",
  permission: {
    requireWorkspaceMember: true,
    capability: "cloud_work",
  },
  domain: "cloud_work",
  enabled: true,
  parameters: {
    type: "object",
    required: ["title", "goal", "kind"],
    properties: {
      title: { type: "string" },
      goal: { type: "string" },
      kind: {
        type: "string",
        enum: ["coding", "research", "multi_step"],
      },
      summary: { type: "string" },
    },
  },
});

registerAiTool({
  name: "check_work_task",
  description:
    "Check progress on a queued or running work task. Returns a short user-facing status note.",
  permission: {
    requireWorkspaceMember: true,
    capability: "cloud_work",
  },
  domain: "cloud_work",
  enabled: true,
  parameters: {
    type: "object",
    properties: {
      workTaskId: { type: "string" },
    },
  },
});

registerAiTool({
  name: "request_publish_approval",
  description:
    "Ask the user to explicitly publish the current project draft. Never publish without user action.",
  permission: {
    requireWorkspaceMember: true,
    capability: "release",
    requiresConfirmation: true,
  },
  domain: "cloud_work",
  enabled: true,
  parameters: {
    type: "object",
    properties: {
      projectId: { type: "string" },
      message: { type: "string" },
    },
  },
});
