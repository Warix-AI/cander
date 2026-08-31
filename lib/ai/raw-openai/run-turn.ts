/**
 * Client entry for raw OpenAI benchmark turns (multimodal).
 * Posts conversation to /api/ai/raw-openai — never touches OpenAI keys.
 */

import type {
  AgentTurnOptions,
  AgentTurnResult,
} from "../runtime/agent-turn.ts";
import type { AiGenerateRequest } from "../runtime/types.ts";
import { AiRuntimeError } from "../runtime/types.ts";
import { getRawOpenAIAuthHeaders } from "./upload-client.ts";

const SYSTEM_INSTRUCTIONS = `You are a helpful assistant in the Cander chat product.
Answer clearly and completely. Handle follow-ups, pronouns, multi-part questions, and topic changes using the conversation history provided.
When web search is available, use it only when current or external facts would improve the answer; otherwise answer from knowledge.
When files or images are attached, use their contents to answer.`;

export type RawOpenAITrace = {
  provider: "openai";
  mode: "raw";
  model: string;
  webSearchEnabled?: boolean;
  webSearchUsed?: boolean;
  threadMessageCount: number;
  attachmentCount?: number;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs: number;
  success: boolean;
  error?: string;
};

export async function runRawOpenAITurn(
  request: AiGenerateRequest,
  opts?: AgentTurnOptions,
): Promise<AgentTurnResult> {
  const report = opts?.onProgress ?? (() => {});
  report({
    phase: "thinking",
    label: "RAW OPENAI",
    detail: "Sending conversation to OpenAI",
  });

  const history = (request.messages ?? []).map((m) => ({
    role: m.role,
    content: m.content,
    ...(m.id ? { id: m.id } : {}),
  }));

  const last = history[history.length - 1];
  const current = (request.content || "").trim();
  if (
    current &&
    !(last?.role === "user" && (last.content || "").trim() === current)
  ) {
    history.push({ role: "user", content: current });
  }

  const attachmentIds = (request.attachmentIds || []).filter(Boolean);
  const started = Date.now();
  let res: Response;
  try {
    const authHeaders = await getRawOpenAIAuthHeaders();
    res = await fetch("/api/ai/raw-openai", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
      },
      body: JSON.stringify({
        messages: history,
        system: SYSTEM_INSTRUCTIONS,
        // Prefer uploaded file_ids; keep data-URL images only as fallback
        images: attachmentIds.length ? undefined : request.images?.slice(0, 4),
        attachmentIds: attachmentIds.length ? attachmentIds : undefined,
        threadId: request.threadId,
        title: request.title,
      }),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "network_error";
    logTrace({
      provider: "openai",
      mode: "raw",
      model: "unknown",
      threadMessageCount: history.length,
      attachmentCount: attachmentIds.length,
      latencyMs: Date.now() - started,
      success: false,
      error: msg,
    });
    throw new AiRuntimeError(
      "raw_openai_network",
      `Raw OpenAI request failed: ${msg}`,
    );
  }

  const data = (await res.json().catch(() => ({}))) as {
    content?: string;
    model?: string;
    webSearchEnabled?: boolean;
    webSearchUsed?: boolean;
    inputTokens?: number;
    outputTokens?: number;
    error?: string;
    latencyMs?: number;
  };

  const latencyMs = data.latencyMs ?? Date.now() - started;
  const model = data.model || "unknown";
  const webSearchEnabled = Boolean(data.webSearchEnabled);
  const webSearchUsed = Boolean(data.webSearchUsed);

  if (!res.ok || data.error) {
    logTrace({
      provider: "openai",
      mode: "raw",
      model,
      webSearchEnabled,
      webSearchUsed,
      threadMessageCount: history.length,
      attachmentCount: attachmentIds.length,
      inputTokens: data.inputTokens,
      outputTokens: data.outputTokens,
      latencyMs,
      success: false,
      error: data.error || `http_${res.status}`,
    });
    throw new AiRuntimeError(
      "raw_openai_failed",
      data.error || `Raw OpenAI HTTP ${res.status}`,
    );
  }

  const content = (data.content || "").trim();
  logTrace({
    provider: "openai",
    mode: "raw",
    model,
    webSearchEnabled,
    webSearchUsed,
    threadMessageCount: history.length,
    attachmentCount: attachmentIds.length,
    inputTokens: data.inputTokens,
    outputTokens: data.outputTokens,
    latencyMs,
    success: true,
  });

  report({
    phase: "generating",
    label: "RAW OPENAI",
    detail: webSearchUsed
      ? `${model} · web search`
      : webSearchEnabled
        ? `${model} · web search available`
        : model,
    contentDelta: content,
    contentStreaming: false,
  });

  return {
    content: content || "OpenAI returned an empty response.",
    runtime: "cloud",
    offline: false,
    condensationOccurred: false,
    aiChatId: request.aiChatId,
  };
}

function logTrace(trace: RawOpenAITrace): void {
  console.log("[RAW_OPENAI_TRACE]", trace);
}

/** Build the message list that will be sent (exported for tests). */
export function buildRawOpenAIHistory(request: AiGenerateRequest): ChatTurn[] {
  const history = (request.messages ?? []).map((m) => ({
    role: m.role,
    content: m.content,
    ...(m.id ? { id: m.id } : {}),
  }));
  const last = history[history.length - 1];
  const current = (request.content || "").trim();
  if (
    current &&
    !(last?.role === "user" && (last.content || "").trim() === current)
  ) {
    history.push({ role: "user", content: current });
  }
  return history;
}

type ChatTurn = {
  role: "user" | "assistant" | "system";
  content: string;
  id?: string;
};
