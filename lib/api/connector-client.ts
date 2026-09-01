"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type {
  ConnectorCatalogItem,
  ConnectorConnection,
} from "@/lib/connectors/types";

async function authHeaders(): Promise<HeadersInit> {
  const supabase = createSupabaseBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.access_token) {
    return { Authorization: `Bearer ${session.access_token}` };
  }
  return {};
}

export async function fetchConnectorCatalog(): Promise<ConnectorCatalogItem[]> {
  const headers = await authHeaders();
  const response = await fetch("/api/connectors/catalog", { headers });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error ?? "Could not load connector catalog.");
  }
  return data.catalog as ConnectorCatalogItem[];
}

export async function fetchConnectorConnections(
  workspaceId: string,
): Promise<ConnectorConnection[]> {
  const headers = await authHeaders();
  const response = await fetch(
    `/api/connectors/connections?workspaceId=${encodeURIComponent(workspaceId)}`,
    { headers },
  );
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error ?? "Could not load connections.");
  }
  return data.connections as ConnectorConnection[];
}

export async function initiateConnectorConnection(input: {
  workspaceId: string;
  connectorId: string;
}): Promise<ConnectorConnection> {
  const headers = await authHeaders();
  const response = await fetch("/api/connectors/connections/initiate", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(input),
  });
  const data = await response.json();
  if (response.status === 401 || response.status === 403) {
    const { clearConnectorConnectionsCache } = await import(
      "@/lib/connector-connections-store"
    );
    clearConnectorConnectionsCache();
  }
  if (!response.ok) {
    throw new Error(data.error ?? "Could not initiate connection.");
  }
  return data.connection as ConnectorConnection;
}

export async function disconnectConnectorConnection(input: {
  workspaceId: string;
  connectionId: string;
}): Promise<ConnectorConnection> {
  const headers = await authHeaders();
  const response = await fetch(
    `/api/connectors/connections/${encodeURIComponent(input.connectionId)}/disconnect`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ workspaceId: input.workspaceId }),
    },
  );
  const data = await response.json();
  if (response.status === 401 || response.status === 403) {
    const { clearConnectorConnectionsCache } = await import(
      "@/lib/connector-connections-store"
    );
    clearConnectorConnectionsCache();
  }
  if (!response.ok) {
    throw new Error(data.error ?? "Could not disconnect.");
  }
  return data.connection as ConnectorConnection;
}
