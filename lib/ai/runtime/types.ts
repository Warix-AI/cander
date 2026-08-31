/**
 * Unified AI runtime contracts.
 * UI and product features must talk to AIRuntime — never Apple/Android/Ollama/OpenAI directly.
 */

export type AiRuntimeMode = "auto" | "local" | "cloud";

export type AiRuntimeId =
  | "cloud"
  | "apple-local"
  | "apple-cloud-future"
  | "android-local"
  | "unavailable";

export type AiRuntimeCapabilities = {
  available: boolean;
  runtime: AiRuntimeId;
  local: boolean;
  private: boolean;
  offline: boolean;
  streaming: boolean;
  tools: boolean;
  structuredOutput: boolean;
  /** Can interpret attached images (cloud vision path). */
  vision?: boolean;
  contextWindow?: number;
};

export type AiGenerateRequest = {
  /** Already-authorized user turn text (may include attachment notes). */
  content: string;
  title: string;
  workspaceId: string;
  projectId?: string | null;
  projectSpace?: string | null;
  /** Existing private ai_chats id when cloud path is used. */
  aiChatId?: string | null;
  /** UI thread id — used by on-device context (Recents / “this chat”). */
  threadId?: string | null;
  /**
   * Prior turns in this UI thread (excluding the in-flight empty assistant).
   * Cloud still prefers Edge DB history; LOCAL uses this for dialogue continuity.
   */
  messages?: Array<{
    role: "user" | "assistant" | "system";
    content: string;
    /** UI message id — used to reattach prior openai_file_ids */
    id?: string;
  }>;
  /**
   * Image data-URLs (or raw base64) for vision-capable cloud inference.
   * On-device text models cannot see these — runtime should prefer cloud.
   */
  images?: string[];
  /**
   * Raw OpenAI: chat_attachments ids owned by the user (current turn).
   * Prefer these over images[] data URLs when present.
   */
  attachmentIds?: string[];
  /**
   * When false, providers should omit tool catalogs from instructions
   * (used for general conversation / knowledge turns).
   */
  allowTools?: boolean;
  /** Domain-gated allowlist — execute only these tool names. */
  allowedToolNames?: string[];
  /** Classifier route target (Phase 1). */
  preferredRoute?: "on_device" | "pcc" | "cander_cloud";
  routingReason?: string;
  /**
   * Composer Web override: Auto | On | Off.
   * Auto = knowledge routing; On = force web for factual; Off = block unless explicit browse.
   */
  browserMode?: "auto" | "on" | "off";
  /**
   * Ephemeral tool/search context for this turn only — never persisted as a user message.
   * Used by the legacy cloud path; orchestrator uses structured events instead.
   */
  toolContext?: string;
};

export type AiGenerateResult = {
  content: string;
  runtime: AiRuntimeId;
  offline: boolean;
  condensationOccurred: boolean;
  aiChatId?: string | null;
  /** Optional structured chat blocks (semantic response renderer). */
  blocks?: import("@/lib/types").ChatBlock[];
  /** Raw OpenAI generated-image attachment ids to link to the assistant message. */
  generatedAttachmentIds?: string[];
  /** Durable web sources for Sources UI (not visible answer text). */
  citations?: Array<{
    id: string;
    title: string;
    url: string;
    canonicalUrl?: string;
    domain?: string;
    excerpt?: string;
    publishedAt?: string;
    retrievedAt?: string;
    sourceType?: string;
  }>;
};

export class AiRuntimeError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "AiRuntimeError";
    this.code = code;
  }
}

export type AiRuntimeProvider = {
  id: AiRuntimeId;
  getCapabilities: () => Promise<AiRuntimeCapabilities>;
  isAvailable: () => Promise<boolean>;
  generate: (request: AiGenerateRequest) => Promise<AiGenerateResult>;
};
