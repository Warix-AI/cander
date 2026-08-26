import { CONNECTOR_CATALOG, connectorName } from "@/lib/api/connector-catalog";
import { localSpaceEntityStore } from "@/lib/api/space-entity-store";
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

export type ConnectorInfo = { id: string; name: string };

export type ConnectorApi = {
  listAvailable(ctx: WorkspaceCtx): Promise<ConnectorInfo[]>;
  listConnected(ctx: WorkspaceCtx): Promise<string[]>;
  connect(ctx: WorkspaceCtx, connectorId: string): Promise<void>;
  disconnect(ctx: WorkspaceCtx, connectorId: string): Promise<void>;
  syncBriefing(
    ctx: WorkspaceCtx,
    filter?: BriefingFilter,
  ): Promise<BriefingItem[]>;
  openSession(ctx: WorkspaceCtx, connectorId: string): Promise<ConnectorSession>;
  subscribe?(listener: () => void): () => void;
};

export { connectorName };

export function createLocalConnectorApi(): ConnectorApi {
  return {
    async listAvailable() {
      return CONNECTOR_CATALOG;
    },
    async listConnected(ctx) {
      return workConnectorIds(ctx.workspaceId);
    },
    async connect(ctx, connectorId) {
      attachWorkConnector(ctx.workspaceId, connectorId);
    },
    async disconnect(ctx, connectorId) {
      detachWorkConnector(ctx.workspaceId, connectorId);
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
    subscribe: subscribeWorkConnectors,
  };
}
