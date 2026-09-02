/**
 * Connector tool catalog — derives from CanderTool registry for connector UI/permissions.
 * Backward-compatible with existing tool-permissions and authz callers.
 */

import {
  listCanderTools,
  listCanderToolsForConnector,
  getCanderTool,
} from "../ai/tools/cander-registry.ts";
import type { ToolRisk } from "../ai/tools/types.ts";

export type ConnectorToolAccess = "read" | "write";

export type ConnectorToolDefinition = {
  id: string;
  connectorId: string;
  label: string;
  description: string;
  access: ConnectorToolAccess;
  defaultEnabled: boolean;
  risk?: ToolRisk;
  confirmationPolicy?: "never" | "when_ambiguous" | "always";
};

function riskToAccess(risk: ToolRisk): ConnectorToolAccess {
  return risk === "read" ? "read" : "write";
}

function toConnectorDef(tool: {
  id: string;
  connectorId?: string;
  label: string;
  description: string;
  risk: ToolRisk;
  confirmationPolicy: "never" | "when_ambiguous" | "always";
  defaultEnabled: boolean;
}): ConnectorToolDefinition | null {
  if (!tool.connectorId) return null;
  return {
    id: tool.id,
    connectorId: tool.connectorId,
    label: tool.label,
    description: tool.description,
    access: riskToAccess(tool.risk),
    defaultEnabled: tool.defaultEnabled,
    risk: tool.risk,
    confirmationPolicy: tool.confirmationPolicy,
  };
}

export const CONNECTOR_TOOL_CATALOG: ConnectorToolDefinition[] = listCanderTools()
  .map(toConnectorDef)
  .filter((t): t is ConnectorToolDefinition => t != null);

export function toolsForConnector(connectorId: string): ConnectorToolDefinition[] {
  return listCanderToolsForConnector(connectorId)
    .map(toConnectorDef)
    .filter((t): t is ConnectorToolDefinition => t != null);
}

export function toolDefinition(toolId: string): ConnectorToolDefinition | null {
  const tool = getCanderTool(toolId);
  return tool ? toConnectorDef(tool) : null;
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
