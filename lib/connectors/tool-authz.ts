/**
 * Connector tool authorization — re-exports generalized authz (backward compatible).
 */

export { authorizeConnectorToolAction } from "./authorization.ts";

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
