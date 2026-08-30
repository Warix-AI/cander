"use client";

/**
 * Thin Cap/web/desktop client for Edge TurnOrchestrator.
 * No second brain — only attach knowledge hits, execute client_actions, cancel.
 */

import {
  cancelAgentTurn,
  newTurnId,
  runAgentTurn,
  runAgentTurnStream,
  type AgentRunTurnResult,
  type AgentStreamEvent,
} from "@/lib/api/ai-agent-api";
import {
  createAiChat,
  setAiChatContext,
  type AiContextRefInput,
} from "@/lib/api/ai-chat-api";
import { preferOrchestratorV2 } from "@/lib/ai/orchestrator/flags";
import { collectTurnVisionImages } from "@/lib/ai/attachment-context";
import {
  executeAuthorizedTool,
  type AiToolCallResult,
} from "@/lib/ai/runtime/tools";
import { setTurnContext, clearTurnContext } from "@/lib/ai/runtime/turn-context";
import { tryIntentShortcut } from "@/lib/ai/runtime/intent-actions";
import type { AgentTurnProgress } from "@/lib/ai/runtime/agent-turn";
import type { AiGenerateRequest, AiGenerateResult } from "@/lib/ai/runtime/types";
import type { SpaceId } from "@/lib/types";

export type OrchestratedTurnResult = AiGenerateResult & {
  toolResults?: AiToolCallResult[];
  pausedForUser?: boolean;
  turnId?: string;
  citations?: AiGenerateResult["citations"];
};

let activeTurnId: string | null = null;

export function getActiveOrchestratorTurnId(): string | null {
  return activeTurnId;
}

export async function cancelActiveOrchestratorTurn(): Promise<void> {
  if (!activeTurnId) return;
  const id = activeTurnId;
  activeTurnId = null;
  try {
    await cancelAgentTurn(id);
  } catch {
    // best-effort
  }
}

function buildAiContextRefs(opts: {
  workspaceId: string;
  projectId?: string | null;
  projectSpace?: string | null;
}): AiContextRefInput[] {
  const refs: AiContextRefInput[] = [
    {
      kind: "workspace",
      id: opts.workspaceId,
      workspaceId: opts.workspaceId,
    },
  ];
  if (opts.projectId) {
    const kind = opts.projectSpace === "research" ? "research" : "project";
    refs.push({
      kind,
      id: opts.projectId,
      workspaceId: opts.workspaceId,
    });
  }
  return refs;
}

function mapStatus(
  phase: string,
  detail?: string,
  toolName?: string,
): AgentTurnProgress {
  switch (phase) {
    case "searching":
      return {
        phase: "tool",
        label: "Thinking",
        detail: detail ?? "Searching",
        toolName: toolName ?? "web.search",
      };
    case "reading":
      return {
        phase: "follow_up",
        label: "Thinking",
        detail: detail ?? "Reading",
        toolName: "web.search",
      };
    case "generating":
      return {
        phase: "generating",
        label: "Thinking",
        detail: detail ?? "Generating",
      };
    case "client_action":
      return {
        phase: "tool",
        label: "Thinking",
        detail: detail ?? "Updating",
        toolName,
      };
    case "routing":
      return {
        phase: "thinking",
        label: "Thinking",
        detail: detail ?? "Checking",
      };
    case "retrieving":
    case "thinking":
    default:
      return {
        phase: "thinking",
        label: "Thinking",
        detail: detail ?? "Generating",
      };
  }
}

export async function runOrchestratedTurn(
  request: AiGenerateRequest,
  opts?: {
    onProgress?: (progress: AgentTurnProgress) => void;
    signal?: AbortSignal;
  },
): Promise<OrchestratedTurnResult> {
  setTurnContext({
    threadId: request.threadId,
    workspaceId: request.workspaceId,
    projectId: request.projectId,
    userMessage: request.content,
  });

  const report = (p: AgentTurnProgress) => {
    try {
      opts?.onProgress?.(p);
    } catch {
      // ignore
    }
  };

  try {
    report({ phase: "thinking", label: "Thinking" });

    // Same high-confidence local shortcuts as before (nav / create project cards)
    const shortcut = await tryIntentShortcut(request.content, {
      threadId: request.threadId,
      recentText: (request.messages ?? [])
        .map((m) => m.content)
        .join("\n")
        .slice(-2000),
    });
    if (shortcut) {
      return {
        content: shortcut.content,
        runtime: "cloud",
        offline: false,
        condensationOccurred: false,
        aiChatId: request.aiChatId,
        toolResults: shortcut.toolResults,
        pausedForUser: shortcut.pausedForUser,
      };
    }

    let chatId = request.aiChatId?.trim() || null;
    if (!chatId) {
      const { chat } = await createAiChat({
        title: request.title.slice(0, 80) || "New chat",
        workspaceId: request.workspaceId,
      });
      chatId = chat.id;
    }
    await setAiChatContext(
      chatId,
      buildAiContextRefs({
        workspaceId: request.workspaceId,
        projectId: request.projectId,
        projectSpace: request.projectSpace as SpaceId | null | undefined,
      }),
    ).catch(() => {});

    // V2: server decides knowledge via paused_for_client — no client pre-routing.
    const useV2 = preferOrchestratorV2();

    const turnId = newTurnId();
    // Cancel any abandoned in-flight turn before starting a new one
    if (activeTurnId && activeTurnId !== turnId) {
      const prev = activeTurnId;
      activeTurnId = turnId;
      void cancelAgentTurn(prev);
    } else {
      activeTurnId = turnId;
    }

    const onAbort = () => {
      void cancelAgentTurn(turnId);
    };
    opts?.signal?.addEventListener("abort", onAbort);

    const handleStreamEvent = (ev: AgentStreamEvent) => {
      if (ev.type === "status") {
        report(mapStatus(ev.phase, ev.detail));
      }
    };

    const invokeTurn = async (
      extra?: {
        clientActionResults?: Array<{
          name: string;
          output: string;
          ok: boolean;
        }>;
      },
    ) => {
      let turnImages: string[] | undefined;
      if (request.images?.length) {
        const validated = collectTurnVisionImages(request.images);
        if (!validated.ok) {
          throw new Error(validated.error);
        }
        turnImages = validated.urls;
      }
      const payload = {
        turnId,
        chatId,
        content: request.content,
        images: turnImages,
        clientActionResults: extra?.clientActionResults,
        orchestratorVersion: useV2 ? ("v2" as const) : ("v1" as const),
      };
      if (useV2) {
        return runAgentTurnStream(payload, {
          onEvent: handleStreamEvent,
          signal: opts?.signal,
        });
      }
      const result = await runAgentTurn(payload);
      for (const ev of result.statusEvents ?? []) {
        report(mapStatus(ev.phase, ev.detail));
      }
      return result;
    };

    try {
      let result = await invokeTurn();

      // Execute client_actions and resume once
      if (
        result.status === "paused_for_client" &&
        result.clientActions?.length
      ) {
        const actionResults: Array<{
          name: string;
          output: string;
          ok: boolean;
        }> = [];
        const toolResults: AiToolCallResult[] = [];
        let pausedForUser = false;

        for (const action of result.clientActions) {
          report(
            mapStatus("client_action", `Running ${action.name}…`, action.name),
          );
          const executed = await executeAuthorizedTool({
            name: action.name,
            arguments: action.arguments,
          });
          toolResults.push(executed);
          actionResults.push({
            name: executed.name,
            output: executed.output,
            ok: executed.ok,
          });
          if (executed.pauseForUser) pausedForUser = true;
        }

        if (pausedForUser) {
          return {
            content:
              toolResults.map((t) => t.output).filter(Boolean).join("\n") ||
              "Waiting for your input…",
            runtime: "cloud",
            offline: false,
            condensationOccurred: false,
            aiChatId: chatId,
            toolResults,
            pausedForUser: true,
            turnId,
          };
        }

        result = await invokeTurn({ clientActionResults: actionResults });
      }

      return toGenerateResult(result, chatId, turnId);
    } finally {
      opts?.signal?.removeEventListener("abort", onAbort);
      if (activeTurnId === turnId) activeTurnId = null;
    }
  } finally {
    clearTurnContext();
  }
}

function toGenerateResult(
  result: AgentRunTurnResult,
  chatId: string,
  turnId: string,
): OrchestratedTurnResult {
  if (result.status === "cancelled") {
    return {
      content: "",
      runtime: "cloud",
      offline: false,
      condensationOccurred: false,
      aiChatId: chatId,
      turnId,
    };
  }
  return {
    content: result.content,
    runtime: "cloud",
    offline: result.offline,
    condensationOccurred: result.condensationOccurred,
    aiChatId: chatId,
    turnId,
    citations: result.citations?.length
      ? result.citations.map((c, i) => ({
          id: c.id || `src_${i + 1}`,
          title: c.title,
          url: c.url ?? "",
          excerpt: c.snippet,
          sourceType: c.kind,
        })).filter((c) => c.url)
      : undefined,
  };
}
