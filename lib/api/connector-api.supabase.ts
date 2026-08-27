"use client";

import type { ConnectorApi } from "@/lib/api/connector-api";
import { subscribeAllConnectorStores } from "@/lib/api/connector-sync";
import type { SpaceEntityApi } from "@/lib/api/space-entity-api";
import { notifyEntityStoreChange } from "@/lib/api/space-entity-store";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  catalogRowToInfo,
  type ConnectorCatalogRow,
} from "@/lib/supabase/connector-mapper";
import { connectionsForConnector } from "@/lib/workspace-connections";
import {
  attachWorkConnector,
  detachWorkConnector,
  workConnectorIds,
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
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from("connector_catalog")
        .select("id, name")
        .order("name");
      if (error) throw error;
      return (data ?? []).map((row) =>
        catalogRowToInfo(row as ConnectorCatalogRow),
      );
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

      const accounts = connectionsForConnector(ctx.workspaceId, connectorId);
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
