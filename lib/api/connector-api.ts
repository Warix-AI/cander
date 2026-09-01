import { CONNECTOR_CATALOG, connectorName } from "@/lib/api/connector-catalog";
import { localSpaceEntityStore } from "@/lib/api/space-entity-store";
import type { ConnectorConnection } from "@/lib/connectors/types";
import type {
  BriefingFilter,
  BriefingItem,
  ConnectorSession,
  WorkspaceCtx,
} from "@/lib/space-entities";
import {
  attachWorkConnector,
  detachWorkConnector,
  subscribeWorkConnectors,
  workConnectorIds,
} from "@/lib/work-connectors";
import {
  addWorkspaceConnection,
  connectionsForConnector,
  removeWorkspaceConnection,
  subscribeWorkspaceConnections,
} from "@/lib/workspace-connections";

export type ConnectorInfo = { id: string; name: string };

export type ConnectorApi = {
  listAvailable(ctx: WorkspaceCtx): Promise<ConnectorInfo[]>;
  listConnected(ctx: WorkspaceCtx): Promise<string[]>;
  listConnections(ctx: WorkspaceCtx): Promise<ConnectorConnection[]>;
  connect(ctx: WorkspaceCtx, connectorId: string): Promise<ConnectorConnection | void>;
  disconnect(ctx: WorkspaceCtx, connectorId: string): Promise<void>;
  disconnectConnection(
    ctx: WorkspaceCtx,
    connectionId: string,
  ): Promise<ConnectorConnection>;
  syncBriefing(
    ctx: WorkspaceCtx,
    filter?: BriefingFilter,
  ): Promise<BriefingItem[]>;
  openSession(ctx: WorkspaceCtx, connectorId: string): Promise<ConnectorSession>;
  subscribe?(listener: () => void): () => void;
};

export { connectorName };

function subscribeLocalConnectorStores(listener: () => void) {
  const a = subscribeWorkConnectors(listener);
  const b = subscribeWorkspaceConnections(listener);
  return () => {
    a();
    b();
  };
}

export function createLocalConnectorApi(): ConnectorApi {
  return {
    async listAvailable() {
      return CONNECTOR_CATALOG;
    },
    async listConnected(ctx) {
      return workConnectorIds(ctx.workspaceId);
    },
    async listConnections(ctx) {
      const ids = new Set<string>();
      for (const account of connectionsForConnector(ctx.workspaceId, "gmail", undefined as never)) {
        ids.add(account.id);
      }
      void ids;
      return [];
    },
    async connect(ctx, connectorId) {
      attachWorkConnector(ctx.workspaceId, connectorId);
    },
    async disconnect(ctx, connectorId) {
      detachWorkConnector(ctx.workspaceId, connectorId);
    },
    async disconnectConnection(ctx, connectionId) {
      void ctx;
      void connectionId;
      throw new Error("Not supported in local mode.");
    },
    async syncBriefing(ctx, filter) {
      return localSpaceEntityStore.listBriefingItems(ctx, filter);
    },
    async openSession(_ctx, connectorId) {
      const panel =
        connectorId === "gmail"
          ? "gmail"
          : connectorId === "handshake"
            ? "handshake"
            : "generic";
      return { connectorId, panel };
    },
    subscribe: subscribeLocalConnectorStores,
  };
}

export {
  addWorkspaceConnection,
  removeWorkspaceConnection,
  subscribeWorkspaceConnections,
};
