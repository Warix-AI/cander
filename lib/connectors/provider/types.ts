/**
 * Future Composio provider boundary — server-only.
 * Composio SDK integration happens in a later phase.
 */

export type ProviderAuthorizationBegin = {
  ok: boolean;
  authorizationUrl?: string;
  error?: string;
};

export type ProviderConnectionStatus = {
  ok: boolean;
  status?: "pending" | "active" | "failed" | "disconnected";
  providerConnectionId?: string;
  failureDetail?: string;
  error?: string;
};

export type ProviderWebhookVerifyResult = {
  ok: boolean;
  eventId?: string;
  error?: string;
};

export type ConnectorProviderAdapter = {
  readonly name: string;
  beginAuthorization(input: {
    connectorId: string;
    workspaceId: string;
    ownerId: string;
    redirectUrl: string;
  }): Promise<ProviderAuthorizationBegin>;
  reconcileConnection(input: {
    connectionId: string;
    providerConnectionId: string;
  }): Promise<ProviderConnectionStatus>;
  getStatus(input: {
    providerConnectionId: string;
  }): Promise<ProviderConnectionStatus>;
  disconnect(input: {
    providerConnectionId: string;
  }): Promise<{ ok: boolean; error?: string }>;
  verifyWebhook(input: {
    rawBody: string;
    headers: Headers;
  }): Promise<ProviderWebhookVerifyResult>;
};
