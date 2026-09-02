/**
 * Thin client transport for /api/ai/agent.
 * Handles request lifecycle, progress, cancel, and pause prompts only.
 * Does NOT orchestrate model rounds or execute tools.
 */

"use client";

import { getRawOpenAIAuthHeaders } from "@/lib/ai/raw-openai/upload-client";
import type {
  AgentTurnOptions,
  AgentTurnResult,
} from "@/lib/ai/runtime/agent-turn";
import type { AiGenerateRequest } from "@/lib/ai/runtime/types";
import { AiRuntimeError } from "@/lib/ai/runtime/types";
import type { ToolExecutionResult } from "@/lib/ai/tools/types";

export type AgentPauseEvent =
  | {
      type: "confirmation_required";
      toolId: string;
      preview?: Record<string, unknown>;
      message: string;
    }
  | {
      type: "skill_disabled";
      connectorId: string;
      skillId: string;
      message: string;
    }
  | {
      type: "account_ambiguous";
      connectorId: string;
      candidates: Array<{ connectionId: string; label: string }>;
      message: string;
    };

export type AgentClientResult = AgentTurnResult & {
  pause?: AgentPauseEvent | null;
  turnId?: string;
  toolExecutionResults?: ToolExecutionResult[];
};

export async function runAgentClientTransport(
  request: AiGenerateRequest,
  opts?: AgentTurnOptions & {
    confirmedToolCallId?: string | null;
    selectedConnectionId?: string | null;
  },
): Promise<AgentClientResult> {
  const report = opts?.onProgress ?? (() => {});
  report({
    phase: "thinking",
    label: "Thinking",
    detail: "Starting agent…",
  });

  const history = (request.messages ?? []).map((m) => ({
    role: m.role,
    content: m.content,
  }));
  const current = (request.content || "").trim();
  const last = history[history.length - 1];
  if (
    current &&
    !(last?.role === "user" && (last.content || "").trim() === current)
  ) {
    history.push({ role: "user", content: current });
  }

  let res: Response;
  try {
    const authHeaders = await getRawOpenAIAuthHeaders();
    res = await fetch("/api/ai/agent", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
      },
      body: JSON.stringify({
        messages: history,
        workspaceId: request.workspaceId,
        threadId: request.threadId,
        aiChatId: request.aiChatId,
        title: request.title,
        confirmedToolCallId: opts?.confirmedToolCallId ?? null,
        selectedConnectionId: opts?.selectedConnectionId ?? null,
      }),
      signal: opts?.signal,
    });
  } catch (e) {
    if (
      opts?.signal?.aborted ||
      (e instanceof DOMException && e.name === "AbortError")
    ) {
      throw new AiRuntimeError("cancelled", "Turn cancelled.");
    }
    throw new AiRuntimeError(
      "network",
      e instanceof Error ? e.message : "network_error",
    );
  }

  const data = (await res.json().catch(() => ({}))) as {
    content?: string;
    error?: string;
    pause?: AgentPauseEvent | null;
    turnId?: string;
    toolResults?: ToolExecutionResult[];
    model?: string;
  };

  if (!res.ok) {
    const err = new AiRuntimeError(
      res.status === 503 ? "unavailable" : "provider",
      data.error || `Agent request failed (${res.status})`,
    );
    throw err;
  }

  const content = (data.content || "").trim();
  report({
    phase: "generating",
    label: "Thinking",
    contentDelta: content,
    contentStreaming: true,
  });

  if (data.pause) {
    report({
      phase: "tool",
      label: "Needs input",
      detail: data.pause.message,
      toolName: "toolId" in data.pause ? data.pause.toolId : undefined,
    });
  }

  return {
    content:
      data.pause && !content
        ? data.pause.message
        : content || data.pause?.message || "",
    runtime: "cloud",
    offline: false,
    condensationOccurred: false,
    aiChatId: request.aiChatId ?? null,
    pausedForUser: Boolean(data.pause),
    pause: data.pause ?? null,
    turnId: data.turnId,
    toolExecutionResults: data.toolResults,
    toolResults: data.toolResults?.map((r) => ({
      name: r.toolId,
      ok: r.status === "success",
      output: JSON.stringify(r.data ?? r.error ?? { status: r.status }),
    })),
  };
}
