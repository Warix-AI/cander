/**
 * Agent loop: intent shortcuts → generate → parse tool → execute → optional re-generate.
 * Never leak tool JSON into the visible assistant reply.
 */

import {
  executeAuthorizedTool,
  parseToolCallFromContent,
  type AiToolCallResult,
} from "@/lib/ai/runtime/tools";
import { tryIntentShortcut } from "@/lib/ai/runtime/intent-actions";
import { buildCreateProjectClarification } from "@/lib/ai/runtime/intent-actions";
import { setTurnThreadId } from "@/lib/ai/runtime/turn-context";
import { sanitizeAssistantVisibleText } from "@/lib/ai/tool-protocol";
import {
  isConversationOnlyTurn,
  isInAppToolIntent,
} from "@/lib/ai/tool-intent";
import { getThreadTaskState } from "@/lib/ai/task-state";
import { generateWithAiRuntime } from "@/lib/ai/runtime/runtime";
import type {
  AiGenerateRequest,
  AiGenerateResult,
} from "@/lib/ai/runtime/types";

const MAX_TOOL_ROUNDS = 3;

export type AgentTurnResult = AiGenerateResult & {
  toolResults?: AiToolCallResult[];
  pausedForUser?: boolean;
};

function safeContent(text: string, fallback: string): string {
  const cleaned = sanitizeAssistantVisibleText(text || "").trim();
  return cleaned || fallback;
}

function shouldForceCreateProjectCard(
  userContent: string,
  callTitle?: unknown,
): boolean {
  const blob = `${userContent} ${String(callTitle ?? "")}`.toLowerCase();
  return /\bproject\b/.test(blob) && /\b(create|new|make)\b/.test(blob);
}

function toolsAllowedForTurn(request: AiGenerateRequest): boolean {
  if (request.allowTools === false) return false;
  const task = getThreadTaskState(request.threadId);
  const taskActive =
    Boolean(task) &&
    task!.status !== "idle" &&
    task!.status !== "completed";
  if (taskActive) return true;
  if (isInAppToolIntent(request.content)) return true;
  if (isConversationOnlyTurn(request.content)) return false;
  return false;
}

export async function runAssistantTurn(
  request: AiGenerateRequest,
): Promise<AgentTurnResult> {
  setTurnThreadId(request.threadId);
  try {
    return await runAssistantTurnInner(request);
  } finally {
    setTurnThreadId(null);
  }
}

async function runAssistantTurnInner(
  request: AiGenerateRequest,
): Promise<AgentTurnResult> {
  const allowTools = toolsAllowedForTurn(request);
  const gatedRequest: AiGenerateRequest = {
    ...request,
    allowTools,
  };

  const shortcut = allowTools
    ? await tryIntentShortcut(request.content, {
        threadId: request.threadId,
        recentText: (request.messages ?? [])
          .slice(-6)
          .map((m) => m.content)
          .join("\n"),
      })
    : null;
  if (shortcut) {
    return {
      content: shortcut.content,
      runtime: "cloud",
      offline: false,
      condensationOccurred: false,
      aiChatId: request.aiChatId ?? null,
      toolResults: shortcut.toolResults,
      pausedForUser: shortcut.pausedForUser,
    };
  }

  const toolResults: AiToolCallResult[] = [];
  let working: AiGenerateRequest = { ...gatedRequest };
  let last: AiGenerateResult | null = null;
  let skippedToolOnce = false;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    last = await generateWithAiRuntime(working);
    const { text, call } = parseToolCallFromContent(last.content);

    if (!call) {
      return {
        ...last,
        content: safeContent(
          text,
          "I'm here — tell me what you'd like to do.",
        ),
        toolResults: toolResults.length ? toolResults : undefined,
      };
    }

    // Model tried a tool on a conversation/knowledge turn — ignore and answer.
    if (!allowTools) {
      const cleaned = safeContent(text, "");
      if (cleaned) {
        return {
          ...last,
          content: cleaned,
          toolResults: undefined,
        };
      }
      if (!skippedToolOnce) {
        skippedToolOnce = true;
        working = {
          ...gatedRequest,
          allowTools: false,
          content: [
            request.content,
            "",
            "Answer directly in plain language. Do not use tools, JSON, or mention projects/workspace search.",
          ].join("\n"),
        };
        continue;
      }
      return {
        ...last,
        content:
          "I'm here — ask me anything, or tell me what you'd like to do in Cander.",
        toolResults: undefined,
      };
    }

    if (
      call.name === "ui.ask_clarification" &&
      request.threadId &&
      shouldForceCreateProjectCard(request.content, call.arguments?.title)
    ) {
      const card = buildCreateProjectClarification({
        threadId: request.threadId,
      });
      if (card.opened) {
        return {
          ...last,
          content: safeContent(
            text,
            "Sure — what space should this project live in, and what should we name it?",
          ),
          toolResults: [
            {
              name: "ui.ask_clarification",
              ok: true,
              output: card.detail,
              pauseForUser: true,
            },
          ],
          pausedForUser: true,
        };
      }
    }

    // Refuse workspace.search on non–workspace questions.
    if (
      call.name === "workspace.search" &&
      isConversationOnlyTurn(request.content)
    ) {
      return {
        ...last,
        content: safeContent(
          text,
          "I'm here — ask me anything, or tell me what you'd like to do in Cander.",
        ),
        toolResults: undefined,
      };
    }

    const result = await executeAuthorizedTool(call);
    toolResults.push(result);

    if (
      call.name === "ui.ask_clarification" &&
      (!result.ok || result.pauseForUser)
    ) {
      if (!result.ok && request.threadId) {
        const lower = request.content.toLowerCase();
        if (/\bproject\b/.test(lower) && /\b(create|new|make)\b/.test(lower)) {
          const card = buildCreateProjectClarification({
            threadId: request.threadId,
          });
          if (card.opened) {
            return {
              ...last,
              content: safeContent(
                text,
                "Sure — what space should this project live in, and what should we name it?",
              ),
              toolResults: [
                ...toolResults,
                {
                  name: "ui.ask_clarification",
                  ok: true,
                  output: card.detail,
                  pauseForUser: true,
                },
              ],
              pausedForUser: true,
            };
          }
        }
      }
      return {
        ...last,
        content: safeContent(
          text,
          "I need a few details — fill in the card above the message box.",
        ),
        toolResults,
        pausedForUser: true,
      };
    }

    if (result.pauseForUser) {
      return {
        ...last,
        content: safeContent(
          text,
          call.name === "ui.ask_clarification"
            ? "I need a few details — fill in the card above the message box."
            : "Please confirm to continue.",
        ),
        toolResults,
        pausedForUser: true,
      };
    }

    if (
      result.ok &&
      (call.name === "nav.open" ||
        call.name === "project.open" ||
        call.name === "project.create" ||
        call.name === "panel.open" ||
        call.name === "panel.close")
    ) {
      return {
        ...last,
        content: safeContent(text, result.output),
        toolResults,
      };
    }

    if (!result.ok) {
      return {
        ...last,
        content: safeContent(
          text,
          "I couldn't complete that. Try again in a different way?",
        ),
        toolResults,
      };
    }

    const followUp = [
      `Internal result for ${result.name}: ${result.output}`,
      "Continue briefly for the user in plain language only. Call another tool only if still needed; otherwise a short normal reply with no JSON and no tool names.",
    ].join("\n");

    working = {
      ...gatedRequest,
      content: followUp,
      messages: [
        ...(request.messages ?? []),
        { role: "user", content: request.content },
        { role: "assistant", content: text || "(acted)" },
        { role: "user", content: followUp },
      ],
    };
  }

  return {
    ...(last as AiGenerateResult),
    content: safeContent(
      last?.content ?? "",
      "I hit a step limit — try a shorter request.",
    ),
    toolResults,
  };
}
