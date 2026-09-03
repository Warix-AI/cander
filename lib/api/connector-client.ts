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
  tool: string;
  arguments: Record<string, unknown>;
  connectionId?: string;
  toolCallId?: string;
}): Promise<{ output: string }> {
  const headers = await authHeaders();
  const response = await fetch("/api/connectors/tools/execute", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({
      workspaceId: input.workspaceId,
      tool: input.tool,
      arguments: input.arguments,
      connectionId: input.connectionId,
      toolCallId: input.toolCallId,
    }),
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

export type SyncedMailListItem = {
  id: string;
  providerMessageId: string;
  threadId: string | null;
  fromAddr: string | null;
  toAddrs: string[];
  subject: string | null;
  snippet: string | null;
  receivedAt: string | null;
  isUnread: boolean;
  isArchived: boolean;
  hasAttachments: boolean;
  hasBody: boolean;
};

export type SyncedMailDetail = SyncedMailListItem & {
  ccAddrs?: string[];
  bodyText: string | null;
  bodyHtml: string | null;
};

export async function syncConnectorView(input: {
  workspaceId: string;
  connectorId: string;
  connectionId?: string;
  limit?: number;
}): Promise<{ connectionId: string; upserted: number; lastSyncedAt: string }> {
  const headers = await authHeaders();
  const response = await fetch("/api/connectors/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(input),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error ?? "Could not sync connector.");
  }
  return {
    connectionId: String(data.connectionId),
    upserted: Number(data.upserted ?? 0),
    lastSyncedAt: String(data.lastSyncedAt),
  };
}

export async function fetchSyncedMailList(input: {
  workspaceId: string;
  connectorId?: string;
  connectionId?: string;
  includeArchived?: boolean;
}): Promise<{
  connectionId: string;
  messages: SyncedMailListItem[];
  sync: {
    lastSyncedAt: string | null;
    status: string;
    lastError: string | null;
  };
}> {
  const headers = await authHeaders();
  const params = new URLSearchParams({
    workspaceId: input.workspaceId,
    connectorId: input.connectorId ?? "gmail",
  });
  if (input.connectionId) params.set("connectionId", input.connectionId);
  if (input.includeArchived) params.set("includeArchived", "1");
  const response = await fetch(`/api/connectors/view/mail?${params}`, {
    headers,
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error ?? "Could not load mail.");
  }
  return {
    connectionId: String(data.connectionId),
    messages: (data.messages ?? []) as SyncedMailListItem[],
    sync: {
      lastSyncedAt: data.sync?.lastSyncedAt ?? null,
      status: data.sync?.status ?? "idle",
      lastError: data.sync?.lastError ?? null,
    },
  };
}

export async function fetchSyncedMailDetail(input: {
  workspaceId: string;
  connectorId?: string;
  connectionId?: string;
  messageId: string;
}): Promise<{ connectionId: string; message: SyncedMailDetail }> {
  const headers = await authHeaders();
  const params = new URLSearchParams({
    workspaceId: input.workspaceId,
    connectorId: input.connectorId ?? "gmail",
    messageId: input.messageId,
  });
  if (input.connectionId) params.set("connectionId", input.connectionId);
  const response = await fetch(`/api/connectors/view/mail?${params}`, {
    headers,
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error ?? "Could not load message.");
  }
  return {
    connectionId: String(data.connectionId),
    message: data.message as SyncedMailDetail,
  };
}

export async function runConnectorViewOperation(input: {
  workspaceId: string;
  connectorId: string;
  connectionId?: string;
  operation: string;
  input?: Record<string, unknown>;
}): Promise<{ connectionId: string; data: Record<string, unknown> }> {
  const headers = await authHeaders();
  const response = await fetch("/api/connectors/view/operations", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({
      workspaceId: input.workspaceId,
      connectorId: input.connectorId,
      connectionId: input.connectionId,
      operation: input.operation,
      input: input.input,
    }),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error ?? "Could not run connector operation.");
  }
  return {
    connectionId: String(data.connectionId),
    data: (data.data ?? {}) as Record<string, unknown>,
  };
}
