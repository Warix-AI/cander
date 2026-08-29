"use client";

/**
 * Thin Cap/web/desktop client for Edge TurnOrchestrator.
 * No second brain — only attach knowledge hits, execute client_actions, cancel.
 */

import {
  cancelAgentTurn,
  newTurnId,
  runAgentTurn,
  type AgentRunTurnResult,
} from "@/lib/api/ai-agent-api";
import {
  createAiChat,
  setAiChatContext,
  type AiContextRefInput,
} from "@/lib/api/ai-chat-api";
import { routeDeterministic } from "@/lib/ai/orchestrator/router";
import { preferOrchestratorV2 } from "@/lib/ai/orchestrator/flags";
import { searchWorkspaceKnowledge } from "@/lib/knowledge/search";
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
        detail: detail ?? "Searching the web…",
        toolName: toolName ?? "web.search",
      };
    case "reading":
      return {
        phase: "follow_up",
        label: "Thinking",
        detail: detail ?? "Reading sources…",
        toolName: "web.search",
      };
    case "generating":
      return {
        phase: "generating",
        label: "Thinking",
        detail: detail ?? "Generating…",
      };
    case "client_action":
      return {
        phase: "tool",
        label: "Thinking",
        detail: detail ?? "Running app action…",
        toolName,
      };
    case "routing":
      return {
        phase: "thinking",
        label: "Thinking",
        detail: detail ?? "Planning next step…",
      };
    case "retrieving":
    case "thinking":
    default:
      return {
        phase: "thinking",
        label: "Thinking",
        detail,
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

    const route = routeDeterministic(request.content);
    // V2: server requests knowledge via paused_for_client — do not pre-decide.
    // Keep optional pre-hits only as a warm cache when client already knows.
    let workspaceKnowledgeHits:
      | Array<{ title: string; snippet: string; id?: string }>
      | undefined;
    if (route.needsKnowledge || route.kind === "knowledge_retrieve") {
      // Soft hint only; V2 controller may still request knowledge.search
      const hits = searchWorkspaceKnowledge(
        request.workspaceId,
        request.content,
      );
      if (hits.length) {
        workspaceKnowledgeHits = hits.map((h) => ({
          id: `kb_${h.fileId}`,
          title: `${h.knowledgeBaseName} / ${h.fileName}`,
          snippet: h.excerpt,
        }));
      }
    }

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

    try {
      let result = await runAgentTurn({
        turnId,
        chatId,
        content: request.content,
        images: request.images,
        workspaceKnowledgeHits,
        orchestratorVersion: preferOrchestratorV2() ? "v2" : "v1",
      });

      for (const ev of result.statusEvents ?? []) {
        report(mapStatus(ev.phase, ev.detail));
      }

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

        result = await runAgentTurn({
          turnId,
          chatId,
          content: request.content,
          images: request.images,
          workspaceKnowledgeHits,
          clientActionResults: actionResults,
          orchestratorVersion: preferOrchestratorV2() ? "v2" : "v1",
        });
        for (const ev of result.statusEvents ?? []) {
          report(mapStatus(ev.phase, ev.detail));
        }
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
  };
}
