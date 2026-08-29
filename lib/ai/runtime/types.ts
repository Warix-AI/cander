/**
 * Unified AI runtime contracts.
 * UI and product features must talk to AIRuntime — never Apple/Android/Ollama/OpenAI directly.
 */

export type AiRuntimeMode = "auto" | "local" | "cloud";

export type AiRuntimeId =
  | "cloud"
  | "apple-local"
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
  }>;
  /**
   * When false, providers should omit tool catalogs from instructions
   * (used for general conversation / knowledge turns).
   */
  allowTools?: boolean;
  /** Domain-gated allowlist — execute only these tool names. */
  allowedToolNames?: string[];
};

export type AiGenerateResult = {
  content: string;
  runtime: AiRuntimeId;
  offline: boolean;
  condensationOccurred: boolean;
  aiChatId?: string | null;
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
