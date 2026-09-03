/**
 * Connector SDK types — View / Sync / Operations path (no agent, no LLM).
 * Distinct from lib/connectors/adapters (AI tool argument mapping).
 */

export type ConnectorCapabilities = {
  sync: boolean;
  list: boolean;
  readBody?: boolean;
  compose?: boolean;
  reply?: boolean;
  archive?: boolean;
  markRead?: boolean;
  markUnread?: boolean;
};

export type SyncContext = {
  workspaceId: string;
  profileId: string;
  connectionId: string;
  connectorId: string;
  /** Provider account id — never expose to clients. */
  providerConnectionId: string;
  cursor: string | null;
  providerState: Record<string, unknown>;
  /** Soft cap for header/snippet fetch. */
  limit?: number;
};

export type SyncMessageHeader = {
  providerMessageId: string;
  threadId?: string | null;
  fromAddr?: string | null;
  toAddrs?: string[];
  ccAddrs?: string[];
  subject?: string | null;
  snippet?: string | null;
  receivedAt?: string | null;
  isUnread?: boolean;
  isArchived?: boolean;
  hasAttachments?: boolean;
  rawMeta?: Record<string, unknown>;
};

export type SyncResult = {
  upserted: SyncMessageHeader[];
  cursor?: string | null;
  providerState?: Record<string, unknown>;
};

export type ActionContext = {
  workspaceId: string;
  profileId: string;
  connectionId: string;
  connectorId: string;
  providerConnectionId: string;
};

export type ActionResult = {
  ok: boolean;
  error?: string;
  data?: Record<string, unknown>;
};

/**
 * Provider adapter for connector views + background sync.
 * Must not invoke OpenAI or the agent runtime.
 */
export interface ConnectorViewAdapter {
  connectorId: string;
  capabilities: ConnectorCapabilities;

  sync(ctx: SyncContext): Promise<SyncResult>;

  executeAction(
    action: string,
    input: unknown,
    ctx: ActionContext,
  ): Promise<ActionResult>;
}
