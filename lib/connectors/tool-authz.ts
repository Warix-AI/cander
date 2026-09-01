/**
 * Future connector tool authorization seam — contract only (no AI wiring).
 */

export type ConnectorToolAction = "gmail.read" | "gmail.send";

const PILOT_ALLOWLIST: ConnectorToolAction[] = [];

export type ConnectorToolAuthzInput = {
  workspaceId: string;
  profileId: string;
  connectorId: string;
  action: ConnectorToolAction;
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
  if (!PILOT_ALLOWLIST.includes(input.action)) {
    return { ok: false, reason: "not_allowed" };
  }
  if (!input.connectionId) {
    return { ok: false, reason: "not_connected" };
  }
  return { ok: true };
}
