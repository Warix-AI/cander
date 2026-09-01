/**
 * Future Composio provider boundary — server-only.
 * Composio SDK integration happens in a later phase.
 */

export type ProviderAuthorizationBegin = {
  ok: boolean;
  authorizationUrl?: string;
  /** Server-only Composio link session ref — never expose to clients. */
  linkSessionRef?: string;
  error?: string;
};

export type ProviderCallbackVerification = {
  ok: boolean;
  providerConnectionId?: string;
  toolkitSlug?: string;
  failureDetail?: string;
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
  connectedAccountId?: string;
  status?: string;
  composioUserId?: string;
  eventType?: string;
  error?: string;
};

export type ConnectorProviderAdapter = {
  readonly name: string;
  beginAuthorization(input: {
    connectorId: string;
    workspaceId: string;
    ownerId: string;
  }): Promise<ProviderAuthorizationBegin>;
  completeCallbackVerification(input: {
    sessionUri: string;
    composioUserId: string;
    expectedLinkSessionRef?: string | null;
  }): Promise<ProviderCallbackVerification>;
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
