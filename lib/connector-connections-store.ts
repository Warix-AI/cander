/**
 * In-memory server-hydrated connection cache — not localStorage authoritative.
 */

import type { ConnectorConnection } from "@/lib/connectors/types";
import { isUiConnectedStatus } from "@/lib/connectors/authz";
import type { ConnectorAccount } from "@/lib/types";

type Listener = () => void;

const listeners = new Set<Listener>();
let byWorkspace: Record<string, ConnectorConnection[]> = {};
let revision = 0;

function emit() {
  revision += 1;
  listeners.forEach((listener) => listener());
}

export function getConnectorConnectionsRevision() {
  return revision;
}

export function subscribeConnectorConnections(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getConnectorConnectionsSnapshot() {
  return byWorkspace;
}

export function getConnectorConnectionsServerSnapshot() {
  return byWorkspace;
}

export function replaceConnectorConnectionsForWorkspace(
  workspaceId: string,
  connections: ConnectorConnection[],
) {
  byWorkspace = { ...byWorkspace, [workspaceId]: connections };
  emit();
}

export function clearConnectorConnectionsCache() {
  byWorkspace = {};
  emit();
}

export function connectionsForConnectorLive(
  workspaceId: string,
  connectorId: string,
): ConnectorConnection[] {
  const list = byWorkspace[workspaceId] ?? [];
  return list.filter((row) => row.connectorId === connectorId);
}

/** Legacy-shaped active accounts for UI that expects ConnectorAccount[]. */
export function activeAccountsForConnector(
  workspaceId: string,
  connectorId: string,
): ConnectorAccount[] {
  return connectionsForConnectorLive(workspaceId, connectorId)
    .filter((row) => isUiConnectedStatus(row.status))
    .map((row) => ({
      id: row.id,
      label: row.connectorId,
      status:
        row.status === "active"
          ? "connected"
          : row.status === "failed"
            ? "error"
            : "needs-reauth",
    }));
}

export function connectedConnectorIdsLive(workspaceId: string): string[] {
  const ids = new Set<string>();
  for (const row of byWorkspace[workspaceId] ?? []) {
    if (isUiConnectedStatus(row.status)) ids.add(row.connectorId);
  }
  return [...ids];
}

export function pendingConnectorIdsLive(workspaceId: string): string[] {
  const ids = new Set<string>();
  for (const row of byWorkspace[workspaceId] ?? []) {
    if (row.status === "pending") ids.add(row.connectorId);
  }
  return [...ids];
}

/** Remove legacy localStorage connection keys — never hydrate live state from LS. */
export function purgeLegacyConnectionStorage() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem("courier-workspace-connections");
}
