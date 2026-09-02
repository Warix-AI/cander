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
}): Promise<{ connection: ConnectorConnection; authorizationUrl?: string | null }> {
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
  return {
    connection: data.connection as ConnectorConnection,
    authorizationUrl: (data.authorizationUrl as string | null | undefined) ?? null,
  };
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

export async function executeConnectorToolRequest(input: {
  workspaceId: string;
  tool: "gmail.search" | "gmail.read" | "gmail.send" | "gmail.draft" | "gmail.reply";
  arguments: Record<string, unknown>;
}): Promise<{ output: string }> {
  const headers = await authHeaders();
  const response = await fetch("/api/connectors/tools/execute", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(input),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error ?? "Could not execute connector tool.");
  }
  return { output: String(data.output ?? "") };
}

export async function updateConnectorToolPermissions(input: {
  workspaceId: string;
  connectionId: string;
  access?: "read" | "write";
  enabled?: boolean;
  permissions?: Record<string, boolean>;
}): Promise<ConnectorConnection> {
  const headers = await authHeaders();
  const body: Record<string, unknown> = {
    workspaceId: input.workspaceId,
  };
  if (input.permissions) {
    body.permissions = input.permissions;
  } else if (input.access && typeof input.enabled === "boolean") {
    body.access = input.access;
    body.enabled = input.enabled;
  } else {
    throw new Error("Invalid tool permission update.");
  }
  const response = await fetch(
    `/api/connectors/connections/${encodeURIComponent(input.connectionId)}/permissions`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    },
  );
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error ?? "Could not update tool permissions.");
  }
  return data.connection as ConnectorConnection;
}
