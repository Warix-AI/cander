/**
 * NDJSON protocol for /api/ai/raw-openai token streaming.
 * One JSON object per line. Never includes API keys.
 */

export type RawOpenAIStreamDelta = {
  type: "delta";
  text: string;
};

export type RawOpenAIStreamStatus = {
  type: "status";
  detail: string;
};

export type RawOpenAIStreamDone = {
  type: "done";
  content: string;
  blocks?: Array<Record<string, unknown>>;
  images?: Array<{
    dataUrl: string;
    mimeType?: string;
    name?: string;
    attachmentId?: string;
    openaiFileId?: string;
  }>;
  model?: string;
  webSearchEnabled?: boolean;
  webSearchUsed?: boolean;
  imageGenerationEnabled?: boolean;
  imageGenerationUsed?: boolean;
  citations?: unknown;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs?: number;
};

export type RawOpenAIStreamError = {
  type: "error";
  error: string;
  latencyMs?: number;
};

export type RawOpenAIStreamEvent =
  | RawOpenAIStreamDelta
  | RawOpenAIStreamStatus
  | RawOpenAIStreamDone
  | RawOpenAIStreamError;

export function encodeRawOpenAIStreamEvent(event: RawOpenAIStreamEvent): string {
  return `${JSON.stringify(event)}\n`;
}

export function parseRawOpenAIStreamLine(
  line: string,
): RawOpenAIStreamEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed) as RawOpenAIStreamEvent;
    if (!parsed || typeof parsed !== "object" || !parsed.type) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Pull visible text from an OpenAI Responses stream event. */
export function textDeltaFromOpenAIStreamEvent(event: unknown): string {
  if (!event || typeof event !== "object") return "";
  const e = event as Record<string, unknown>;
  const type = typeof e.type === "string" ? e.type : "";
  if (
    type === "response.output_text.delta" ||
    type.endsWith("output_text.delta")
  ) {
    if (typeof e.delta === "string") return e.delta;
    if (e.delta && typeof e.delta === "object") {
      const d = e.delta as Record<string, unknown>;
      if (typeof d.text === "string") return d.text;
    }
  }
  if (type.includes("output_text") && type.includes("delta")) {
    if (typeof e.delta === "string") return e.delta;
  }
  return "";
}

export function isOpenAIWebSearchStreamEvent(event: unknown): boolean {
  if (!event || typeof event !== "object") return false;
  const type = String((event as { type?: unknown }).type || "");
  return type.includes("web_search");
}

export function completedResponseFromOpenAIStreamEvent(
  event: unknown,
): { output?: unknown; usage?: { input_tokens?: number; output_tokens?: number } } | null {
  if (!event || typeof event !== "object") return null;
  const e = event as Record<string, unknown>;
  if (e.type !== "response.completed") return null;
  const response = e.response;
  if (!response || typeof response !== "object") return null;
  return response as {
    output?: unknown;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
}
