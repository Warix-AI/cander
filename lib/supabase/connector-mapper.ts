import type { ConnectorAccount } from "@/lib/types";

export type ConnectorCatalogRow = {
  id: string;
  name: string;
  category: string;
  description: string;
  icon: string;
  scope: "public" | "personal";
  featured: boolean;
  actions: string[];
  panel_type: "gmail" | "handshake" | "generic";
};

export type ConnectorInstallationRow = {
  id: string;
  profile_id: string;
  workspace_id: string | null;
  connector_id: string;
  sort_order: number;
};

export type ConnectorAccountRow = {
  id: string;
  workspace_id: string;
  connector_id: string;
  profile_id: string;
  label: string;
  status: ConnectorAccount["status"];
  token_ref: string | null;
};

export function catalogRowToInfo(row: ConnectorCatalogRow) {
  return { id: row.id, name: row.name };
}

export function accountRowToAccount(row: ConnectorAccountRow): ConnectorAccount {
  return {
    id: row.id,
    label: row.label,
    status: row.status,
  };
}

export function accountToRow(
  account: ConnectorAccount,
  workspaceId: string,
  connectorId: string,
  profileId: string,
): ConnectorAccountRow {
  return {
    id: account.id,
    workspace_id: workspaceId,
    connector_id: connectorId,
    profile_id: profileId,
    label: account.label,
    status: account.status,
    token_ref: null,
  };
}

export function installationId(
  profileId: string,
  connectorId: string,
  workspaceId?: string | null,
) {
  if (workspaceId) {
    return `inst-${workspaceId}-${connectorId}`;
  }
  return `inst-${profileId}-${connectorId}`;
}

export function rebuildWorkConnectorsFromInstallations(
  rows: ConnectorInstallationRow[],
): Record<string, string[]> {
  const byWorkspace: Record<string, string[]> = {};
  const workspaceRows = rows
    .filter((row) => row.workspace_id)
    .sort((a, b) => a.sort_order - b.sort_order);

  for (const row of workspaceRows) {
    const ws = row.workspace_id!;
    const list = byWorkspace[ws] ?? [];
    list.push(row.connector_id);
    byWorkspace[ws] = list;
  }
  return byWorkspace;
}

export function rebuildProfileInstallsFromInstallations(
  rows: ConnectorInstallationRow[],
): string[] {
  return rows
    .filter((row) => !row.workspace_id)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((row) => row.connector_id);
}

export function rebuildConnectionsFromAccounts(
  rows: ConnectorAccountRow[],
): Record<string, Record<string, ConnectorAccount[]>> {
  const byWorkspace: Record<string, Record<string, ConnectorAccount[]>> = {};
  for (const row of rows) {
    const ws = byWorkspace[row.workspace_id] ?? {};
    const list = ws[row.connector_id] ?? [];
    list.push(accountRowToAccount(row));
    ws[row.connector_id] = list;
    byWorkspace[row.workspace_id] = ws;
  }
  return byWorkspace;
}
