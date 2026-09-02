/**
 * Chat turns — every message goes straight to OpenAI. No other runtime.
 */

import { clearTurnContext, setTurnContext } from "@/lib/ai/runtime/turn-context";
import type {
  AiGenerateRequest,
  AiGenerateResult,
} from "@/lib/ai/runtime/types";
import type { AiToolCallResult } from "@/lib/ai/runtime/tools";

export type AgentTurnResult = AiGenerateResult & {
  toolResults?: AiToolCallResult[];
  pausedForUser?: boolean;
  presentationStreamed?: boolean;
};

export type AgentTurnProgress = {
  phase: "thinking" | "generating" | "tool" | "follow_up";
  label: string;
  detail?: string;
  toolName?: string;
  researchTasks?: Array<{
    id: string;
    label: string;
    status: "done" | "active" | "pending";
  }>;
  contentDelta?: string;
  contentStreaming?: boolean;
};

export type AgentTurnOptions = {
  onProgress?: (progress: AgentTurnProgress) => void;
  signal?: AbortSignal;
};

export async function runAssistantTurn(
  request: AiGenerateRequest,
  opts?: AgentTurnOptions,
): Promise<AgentTurnResult> {
  setTurnContext({
    threadId: request.threadId,
    workspaceId: request.workspaceId,
    projectId: request.projectId,
    userMessage: request.content,
  });
  try {
    opts?.onProgress?.({ phase: "thinking", label: "Thinking" });
    const { runRawOpenAITurn } = await import("@/lib/ai/raw-openai/run-turn");
    return runRawOpenAITurn(request, opts);
  } finally {
    clearTurnContext();
  }
}
