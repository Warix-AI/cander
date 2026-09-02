/**
 * Connector tool authorization — checks catalog, connection, and owner permissions.
 */

import { resolveToolPermissions, toolDefinition } from "./tool-catalog.ts";

export type ConnectorToolAuthzInput = {
  workspaceId: string;
  profileId: string;
  connectorId: string;
  toolName: string;
  toolPermissions?: Record<string, boolean> | null;
  connectionId?: string;
};

export type ConnectorToolAuthzResult =
  | { ok: true }
  | { ok: false; reason: "not_allowed" | "not_connected" | "connector_disabled" };

export function authorizeConnectorToolAction(
  input: ConnectorToolAuthzInput,
): ConnectorToolAuthzResult {
  if (input.connectorId !== "gmail") {
    return { ok: false, reason: "connector_disabled" };
  }

  const definition = toolDefinition(input.toolName);
  if (!definition || definition.connectorId !== input.connectorId) {
    return { ok: false, reason: "not_allowed" };
  }

  if (!input.connectionId) {
    return { ok: false, reason: "not_connected" };
  }

  const permissions = resolveToolPermissions(
    input.connectorId,
    input.toolPermissions,
  );
  if (!permissions[input.toolName]) {
    return { ok: false, reason: "not_allowed" };
  }

  return { ok: true };
}
