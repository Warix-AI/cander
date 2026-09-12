"use client";

import type { ConnectorApi } from "@/lib/api/connector-api";
import {
  disconnectConnectorConnection,
  fetchConnectorCatalog,
  fetchConnectorConnections,
  initiateConnectorConnection,
} from "@/lib/api/connector-client";
import { subscribeAllConnectorStores } from "@/lib/api/connector-sync";
import type { SpaceEntityApi } from "@/lib/api/space-entity-api";
import { notifyEntityStoreChange } from "@/lib/api/space-entity-store";
import {
  activeAccountsForConnector,
  connectedConnectorIdsLive,
  connectionsForConnectorLive,
  replaceConnectorConnectionsForWorkspace,
} from "@/lib/connector-connections-store";
import { isUiConnectedStatus } from "@/lib/connectors/authz";
import { isOauthConnectorId } from "@/lib/connectors/oauth-connectors";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { ConnectorCatalogRow } from "@/lib/supabase/connector-mapper";
import {
  attachWorkConnector,
  detachWorkConnector,
} from "@/lib/work-connectors";
import type {
  BriefingFilter,
  ConnectorSession,
  WorkspaceCtx,
} from "@/lib/space-entities";

function panelForConnector(
  connectorId: string,
  panelType?: ConnectorCatalogRow["panel_type"],
): ConnectorSession["panel"] {
  if (panelType && panelType !== "generic") return panelType;
  if (connectorId === "gmail") return "gmail";
  if (connectorId === "handshake") return "handshake";
  return "generic";
}

export function createSupabaseConnectorApi(
  entities: SpaceEntityApi,
): ConnectorApi {
  return {
    async listAvailable() {
      const catalog = await fetchConnectorCatalog();
      return catalog.map((item) => ({ id: item.id, name: item.name }));
    },

    async listConnected(ctx) {
      try {
        const connections = await fetchConnectorConnections(ctx.workspaceId);
        replaceConnectorConnectionsForWorkspace(ctx.workspaceId, connections);
        return connections
          .filter((row) => isUiConnectedStatus(row.status))
          .map((row) => row.connectorId);
      } catch {
        return connectedConnectorIdsLive(ctx.workspaceId);
      }
    },

    async listConnections(ctx) {
      const connections = await fetchConnectorConnections(ctx.workspaceId);
      replaceConnectorConnectionsForWorkspace(ctx.workspaceId, connections);
      return connections;
    },

    async connect(ctx, connectorId) {
      if (!isOauthConnectorId(connectorId)) {
        throw new Error("Connector not available.");
      }
      const existing = connectionsForConnectorLive(ctx.workspaceId, connectorId).filter(
        (row) => row.status === "pending" || row.status === "active",
      );
      const used = new Set(
        existing.map((row) => row.displayName.trim().toLowerCase()),
      );
      let displayName = "Account";
      if (used.has(displayName.toLowerCase())) {
        for (let i = 2; i <= 3; i++) {
          const candidate = `Acct${i}`;
          if (!used.has(candidate.toLowerCase())) {
            displayName = candidate;
            break;
          }
        }
      }
      const { connection, authorizationUrl } = await initiateConnectorConnection({
        workspaceId: ctx.workspaceId,
        connectorId,
        displayName,
        forceNew: existing.length > 0,
      });
      const all = await fetchConnectorConnections(ctx.workspaceId);
      replaceConnectorConnectionsForWorkspace(ctx.workspaceId, all);
      attachWorkConnector(ctx.workspaceId, connectorId);
      if (authorizationUrl) {
        const { openConnectorAuthorizationUrl } = await import(
          "@/lib/open-connector-oauth"
        );
        openConnectorAuthorizationUrl(authorizationUrl);
      }
      return connection;
    },

    async disconnect(ctx, connectorId) {
      const live = connectionsForConnectorLive(ctx.workspaceId, connectorId).find(
        (row) => row.status === "pending" || row.status === "active",
      );
      if (live) {
        await disconnectConnectorConnection({
          workspaceId: ctx.workspaceId,
          connectionId: live.id,
        });
        const all = await fetchConnectorConnections(ctx.workspaceId);
        replaceConnectorConnectionsForWorkspace(ctx.workspaceId, all);
      }
      detachWorkConnector(ctx.workspaceId, connectorId);
    },

    async disconnectConnection(ctx, connectionId) {
      const connection = await disconnectConnectorConnection({
        workspaceId: ctx.workspaceId,
        connectionId,
      });
      const all = await fetchConnectorConnections(ctx.workspaceId);
      replaceConnectorConnectionsForWorkspace(ctx.workspaceId, all);
      return connection;
    },

    async syncBriefing(ctx, filter) {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.functions.invoke("briefing-sync", {
        body: {
          workspaceId: ctx.workspaceId,
          connectorId: filter?.connectorId ?? null,
        },
      });
      if (error) {
        console.warn("[cander] briefing-sync failed", error);
      } else {
        notifyEntityStoreChange();
      }
      return entities.listBriefingItems(ctx, filter);
    },

    async openSession(ctx, connectorId) {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from("connector_catalog")
        .select("panel_type")
        .eq("id", connectorId)
        .maybeSingle();
      if (error) throw error;

      const accounts = activeAccountsForConnector(ctx.workspaceId, connectorId);
      const panel = panelForConnector(
        connectorId,
        (data as { panel_type?: ConnectorCatalogRow["panel_type"] } | null)
          ?.panel_type,
      );

      if (!accounts.length) {
        return { connectorId, panel };
      }

      return { connectorId, panel };
    },

    subscribe: subscribeAllConnectorStores,
  };
}
