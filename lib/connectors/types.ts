/** Connector connection domain types — safe for client API responses. */

export type ConnectorConnectionStatus =
  | "pending"
  | "active"
  | "failed"
  | "disconnected";

export type ConnectorConnectionMode = "personal" | "workspace_shared";

export type ConnectorConnection = {
  id: string;
  workspaceId: string;
  connectorId: string;
  status: ConnectorConnectionStatus;
  connectionMode: ConnectorConnectionMode;
  failureDetail: string | null;
  createdAt: string;
  updatedAt: string;
  connectedAt: string | null;
  disconnectedAt: string | null;
  pendingExpiresAt: string | null;
};

export type ConnectorCatalogItem = {
  id: string;
  name: string;
  category: string;
  description: string;
  icon: string;
  featured: boolean;
  displayOrder: number;
  enabled: boolean;
  comingSoon: boolean;
  scope: "public" | "personal";
  actions: string[];
  panelType: "gmail" | "handshake" | "generic";
};

export type ConnectorAuditEventType =
  | "connection_initiated"
  | "connection_disconnected"
  | "connection_failed"
  | "lifecycle_forbidden"
  | "lifecycle_not_found";

export type ConnectorAuditDetail = {
  reason_code?: string;
  connector_id?: string;
  connection_id?: string;
  workspace_id?: string;
  http_status?: number;
};
