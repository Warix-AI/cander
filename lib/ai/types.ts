/**
 * Private AI chat contracts — server decides provider/model; no UI picker.
 */

export type AiProviderId = "ollama-bridge" | string;

export type AiMessageRole = "system" | "user" | "assistant";

export type AiChatMessage = {
  role: AiMessageRole;
  content: string;
};

export type AiContextRefKind =
  | "project"
  | "source"
  | "connector"
  | "automation"
  | "research"
  | "workspace";

export type AiContextRef = {
  kind: AiContextRefKind;
  id: string;
  workspaceId?: string | null;
  /** Small authorized snapshot (title, kind label) — not a full entity dump. */
  meta?: Record<string, string | number | boolean | null>;
};

export type ProviderCapabilities = {
  streaming: boolean;
  toolCalling: boolean;
  structuredOutput: boolean;
  attachments: boolean;
};

export type ChatRequest = {
  messages: AiChatMessage[];
  /** Optional authorized context block already resolved server-side. */
  contextText?: string | null;
  /** Reserved — tools are selected server-side from the registry, never from the client. */
  toolNames?: string[];
  maxTokens?: number;
};

export type ChatStreamEvent =
  | { type: "delta"; text: string }
  | { type: "done"; content: string }
  | { type: "error"; message: string; code?: string };

export type ChatResult = {
  content: string;
  provider: AiProviderId;
  model: string;
};

export type AiProvider = {
  id: AiProviderId;
  capabilities: ProviderCapabilities;
  sendChat: (request: ChatRequest) => Promise<ChatResult>;
  streamChat: (
    request: ChatRequest,
    onEvent: (event: ChatStreamEvent) => void,
  ) => Promise<ChatResult>;
};

export type AiChatRow = {
  id: string;
  ownerId: string;
  workspaceId: string | null;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type AiChatMessageRow = {
  id: string;
  chatId: string;
  ownerId: string;
  role: AiMessageRole;
  content: string;
  status: "complete" | "streaming" | "error" | "pending";
  sortOrder: number;
  error: string | null;
  createdAt: string;
};

export type AiChatContextRefRow = {
  id: string;
  chatId: string;
  ownerId: string;
  workspaceId: string | null;
  refKind: AiContextRefKind;
  refId: string;
  meta: Record<string, unknown> | null;
  createdAt: string;
};

/** Active provider — server-only; never expose to the browser as a picker. */
export const ACTIVE_AI_PROVIDER_ID: AiProviderId = "ollama-bridge";
export const ACTIVE_AI_MODEL = "llama3.2";
