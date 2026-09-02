/**
 * Connector tool catalog — defines available tools and read/write tiers per connector.
 */

export type ConnectorToolAccess = "read" | "write";

export type ConnectorToolDefinition = {
  id: string;
  connectorId: string;
  label: string;
  description: string;
  access: ConnectorToolAccess;
  defaultEnabled: boolean;
};

export const CONNECTOR_TOOL_CATALOG: ConnectorToolDefinition[] = [
  {
    id: "gmail.search",
    connectorId: "gmail",
    label: "Search mail",
    description: "Find emails by subject, sender, or keywords",
    access: "read",
    defaultEnabled: true,
  },
  {
    id: "gmail.read",
    connectorId: "gmail",
    label: "Read mail",
    description: "Open a specific email thread or message",
    access: "read",
    defaultEnabled: true,
  },
  {
    id: "gmail.send",
    connectorId: "gmail",
    label: "Send mail",
    description: "Send new emails on your behalf",
    access: "write",
    defaultEnabled: false,
  },
  {
    id: "gmail.draft",
    connectorId: "gmail",
    label: "Draft mail",
    description: "Create email drafts for you to review before sending",
    access: "write",
    defaultEnabled: false,
  },
  {
    id: "gmail.reply",
    connectorId: "gmail",
    label: "Reply in thread",
    description: "Reply to an existing email thread on your behalf",
    access: "write",
    defaultEnabled: false,
  },
];

export function toolsForConnector(connectorId: string): ConnectorToolDefinition[] {
  return CONNECTOR_TOOL_CATALOG.filter((tool) => tool.connectorId === connectorId);
}

export function toolDefinition(toolId: string): ConnectorToolDefinition | null {
  return CONNECTOR_TOOL_CATALOG.find((tool) => tool.id === toolId) ?? null;
}

export function defaultToolPermissions(connectorId: string): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const tool of toolsForConnector(connectorId)) {
    out[tool.id] = tool.defaultEnabled;
  }
  return out;
}

export function resolveToolPermissions(
  connectorId: string,
  stored: Record<string, boolean> | null | undefined,
): Record<string, boolean> {
  const merged = defaultToolPermissions(connectorId);
  if (!stored || typeof stored !== "object") return merged;
  for (const tool of toolsForConnector(connectorId)) {
    if (typeof stored[tool.id] === "boolean") {
      merged[tool.id] = stored[tool.id]!;
    }
  }
  return merged;
}

export function enabledToolIds(
  connectorId: string,
  stored: Record<string, boolean> | null | undefined,
): string[] {
  const resolved = resolveToolPermissions(connectorId, stored);
  return Object.entries(resolved)
    .filter(([, enabled]) => enabled)
    .map(([id]) => id);
}

export function accessTierEnabled(
  connectorId: string,
  access: ConnectorToolAccess,
  stored: Record<string, boolean> | null | undefined,
): boolean {
  const resolved = resolveToolPermissions(connectorId, stored);
  return toolsForConnector(connectorId)
    .filter((tool) => tool.access === access)
    .some((tool) => resolved[tool.id]);
}

export function setAccessTier(
  connectorId: string,
  access: ConnectorToolAccess,
  enabled: boolean,
  stored: Record<string, boolean> | null | undefined,
): Record<string, boolean> {
  const next = resolveToolPermissions(connectorId, stored);
  for (const tool of toolsForConnector(connectorId)) {
    if (tool.access === access) {
      next[tool.id] = enabled;
    }
  }
  return next;
}

export function sanitizeToolPermissionsPatch(
  connectorId: string,
  patch: Record<string, unknown>,
): Record<string, boolean> {
  const allowed = new Set(toolsForConnector(connectorId).map((tool) => tool.id));
  const out: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (!allowed.has(key) || typeof value !== "boolean") continue;
    out[key] = value;
  }
  return out;
}

export function mergeToolPermissions(
  connectorId: string,
  current: Record<string, boolean> | null | undefined,
  patch: Record<string, boolean>,
): Record<string, boolean> {
  const base = resolveToolPermissions(connectorId, current);
  return { ...base, ...patch };
}

export function patchAccessTier(
  connectorId: string,
  access: ConnectorToolAccess,
  enabled: boolean,
  current: Record<string, boolean> | null | undefined,
): Record<string, boolean> {
  return setAccessTier(connectorId, access, enabled, current);
}
