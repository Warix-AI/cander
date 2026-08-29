/**
 * Agent loop: intent shortcuts → generate → parse tool → execute → optional re-generate.
 * Never leak tool JSON into the visible assistant reply.
 * Tools are domain-gated — execute only allowed names for this turn.
 */

import {
  executeAuthorizedTool,
  parseToolCallFromContent,
  type AiToolCallResult,
} from "@/lib/ai/runtime/tools";
import { tryIntentShortcut } from "@/lib/ai/runtime/intent-actions";
import { buildCreateProjectClarification } from "@/lib/ai/runtime/intent-actions";
import { clearTurnContext, setTurnContext } from "@/lib/ai/runtime/turn-context";
import { sanitizeAssistantVisibleText } from "@/lib/ai/tool-protocol";
import { getThreadTaskState, upsertThreadTaskState } from "@/lib/ai/task-state";
import {
  classifyAndRoute,
  recordRoutingDecision,
} from "@/lib/ai/intelligence";
import { getPccAvailability } from "@/lib/ai/intelligence/pcc";
import { getAiRuntimeMode } from "@/lib/ai/runtime/mode-store";
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

/** Cursor-style live status while the agent thinks / calls tools. */
export type AgentTurnProgress = {
  phase: "thinking" | "generating" | "tool" | "follow_up";
  label: string;
  detail?: string;
  toolName?: string;
};

export type AgentTurnOptions = {
  onProgress?: (progress: AgentTurnProgress) => void;
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

function detailForTool(name: string): string {
  switch (name) {
    case "project.create":
      return "Creating project…";
    case "project.open":
      return "Opening project…";
    case "workspace.search":
      return "Searching workspace…";
    case "ui.ask_clarification":
      return "Preparing questions…";
    case "nav.open":
      return "Navigating…";
    case "panel.open":
    case "panel.close":
      return "Updating panel…";
    case "create_work_task":
      return "Starting work task…";
    case "check_work_task":
      return "Checking progress…";
    case "request_publish_approval":
      return "Preparing publish…";
    default:
      return "Calling tool…";
  }
}

function detailForComplexWork(taskType: string): string | undefined {
  switch (taskType) {
    case "coding":
    case "research":
    case "multi_step":
    case "release":
      return "Working on your request…";
    default:
      return undefined;
  }
}

export async function runAssistantTurn(
  request: AiGenerateRequest,
  opts?: AgentTurnOptions,
): Promise<AgentTurnResult> {
  setTurnContext({
    threadId: request.threadId,
    workspaceId: request.workspaceId,
    projectId: request.projectId,
  });
  try {
    return await runAssistantTurnInner(request, opts);
  } finally {
    clearTurnContext();
  }
}

async function runAssistantTurnInner(
  request: AiGenerateRequest,
  opts?: AgentTurnOptions,
): Promise<AgentTurnResult> {
  const report = (progress: AgentTurnProgress) => {
    try {
      opts?.onProgress?.(progress);
    } catch {
      // UI progress must never break the turn.
    }
  };

  // Progress UI: primary Thinking is owned by the client; only emit details for tools/work.
  report({
    phase: "thinking",
    label: "Thinking",
  });

  const taskState = getThreadTaskState(request.threadId);
  const mode = getAiRuntimeMode();
  const pcc = await getPccAvailability();
  const decision = classifyAndRoute({
    content: request.content,
    taskState,
    projectId: request.projectId,
    forceLocal: mode === "local",
    forceCloud: mode === "cloud",
    pccAvailable: pcc.available,
  });
  recordRoutingDecision(decision, {
    threadId: request.threadId,
    projectId: request.projectId,
    workspaceId: request.workspaceId,
  });

  const allowedToolNames = decision.toolNames;
  const allowTools = allowedToolNames.length > 0;

  const complexDetail = detailForComplexWork(decision.taskType);
  if (complexDetail) {
    report({
      phase: "thinking",
      label: "Thinking",
      detail: complexDetail,
    });
  }

  if (allowTools && request.threadId && decision.domains.length) {
    upsertThreadTaskState(request.threadId, {
      allowedDomains: decision.domains as import("@/lib/ai/tools/domains").ToolDomain[],
    });
  }

  const gatedRequest: AiGenerateRequest = {
    ...request,
    allowTools,
    allowedToolNames,
    preferredRoute: decision.target,
    routingReason: decision.reason,
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
    if (shortcut.toolResults?.length) {
      const first = shortcut.toolResults[0]!;
      report({
        phase: "tool",
        label: "Thinking",
        detail: detailForTool(first.name),
        toolName: first.name,
      });
    }
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
    if (round > 0) {
      report({
        phase: "follow_up",
        label: "Thinking",
        detail: "Using the result…",
      });
    } else if (complexDetail) {
      report({
        phase: "thinking",
        label: "Thinking",
        detail: complexDetail,
      });
    }
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

    // Domain gate: refuse tools not in this turn's allowlist.
    if (!allowTools || !allowedToolNames.includes(call.name)) {
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
          allowedToolNames: [],
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

    report({
      phase: "tool",
      label: "Thinking",
      detail: detailForTool(call.name),
      toolName: call.name,
    });
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
        call.name === "panel.close" ||
        call.name === "create_work_task" ||
        call.name === "check_work_task" ||
        call.name === "request_publish_approval")
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
