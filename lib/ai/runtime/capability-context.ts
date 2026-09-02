/**
 * Server-only capability snapshot — cheap, no Composio calls, no tool schemas.
 * Never trust a client-provided snapshot.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  listCanderToolsForConnector,
  capabilityKeyFromToolId,
} from "../tools/cander-registry.ts";
import type {
  CapabilityFamily,
  CapabilitySnapshot,
  CapabilityConnectorSnapshot,
} from "../tools/types.ts";
import { resolveToolPermissions } from "../../connectors/tool-catalog.ts";
import { listActiveConnections } from "../../connectors/connections.ts";

const CONNECTOR_LABELS: Record<string, string> = {
  gmail: "Gmail",
  slack: "Slack",
  github: "GitHub",
  gcal: "Google Calendar",
  notion: "Notion",
};

const CONNECTOR_FAMILY: Record<string, CapabilityFamily> = {
  gmail: "email",
  slack: "messaging",
  gcal: "calendar",
  notion: "files",
  github: "project_management",
};

export async function getCapabilitySnapshot(input: {
  client: SupabaseClient;
  workspaceId: string;
  profileId: string;
}): Promise<CapabilitySnapshot> {
  const listed = await listActiveConnections({
    client: input.client,
    workspaceId: input.workspaceId,
    profileId: input.profileId,
  });
  const connections = listed.ok ? listed.connections : [];

  const byConnector = new Map<string, typeof connections>();
  for (const conn of connections) {
    const list = byConnector.get(conn.connectorId) ?? [];
    list.push(conn);
    byConnector.set(conn.connectorId, list);
  }

  const connectors: CapabilityConnectorSnapshot[] = [];
  for (const [connectorId, accounts] of byConnector) {
    const tools = listCanderToolsForConnector(connectorId);
    const family = CONNECTOR_FAMILY[connectorId] ?? "internal";
    connectors.push({
      connectorId,
      label: CONNECTOR_LABELS[connectorId] ?? connectorId,
      capabilityFamily: family,
      accounts: accounts.map((account) => {
        const permissions = resolveToolPermissions(
          connectorId,
          account.toolPermissions,
        );
        const capabilities: Record<string, boolean> = {};
        for (const tool of tools) {
          const key = capabilityKeyFromToolId(tool.id);
          // Include disabled skills explicitly so model knows they exist.
          capabilities[key] = Boolean(permissions[tool.id]);
        }
        return {
          connectionId: account.connectionId,
          label: account.label,
          status: "active" as const,
          capabilities,
        };
      }),
    });
  }

  const families: CapabilitySnapshot["families"] = {};
  for (const connector of connectors) {
    const family = connector.capabilityFamily;
    const existing = families[family] ?? {
      connected: false,
      connectorIds: [],
      accounts: [],
    };
    existing.connected = true;
    existing.connectorIds.push(connector.connectorId);
    existing.accounts.push(...connector.accounts);
    families[family] = existing;
  }

  return { connectors, families };
}

export function formatCapabilitySnapshotForPrompt(
  snapshot: CapabilitySnapshot,
): string {
  if (!snapshot.connectors.length) {
    return `Connected apps: none. The user has not connected any external apps in this workspace.`;
  }

  const lines = [
    "Connected apps (capability index — detailed tools load only when needed):",
  ];
  for (const connector of snapshot.connectors) {
    for (const account of connector.accounts) {
      const caps = Object.entries(account.capabilities)
        .map(([key, enabled]) => `${key}:${enabled ? "on" : "off"}`)
        .join(", ");
      lines.push(
        `- ${connector.label} (${connector.capabilityFamily}) account="${account.label}" connectionId=${account.connectionId} [${caps}]`,
      );
    }
  }
  lines.push(
    "Rules: never claim an external action succeeded unless a tool returned success. Disabled skills stay disabled until the user enables them in Connectors.",
  );
  return lines.join("\n");
}
