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
import { generateWithAiRuntime } from "@/lib/ai/runtime/runtime";
import type {
  AiGenerateRequest,
  AiGenerateResult,
} from "@/lib/ai/runtime/types";
import { AiRuntimeError } from "@/lib/ai/runtime/types";
import { isAgentOrchestratorEnabled } from "@/lib/ai/orchestrator/flags";
import { getAiRuntimeMode } from "@/lib/ai/runtime/mode-store";
import { shouldUseLocalTurnOrchestrator } from "@/lib/ai/runtime/on-device-routing";

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
  /** Multi-part research subtasks — drives progressive checklist UI. */
  researchTasks?: Array<{
    id: string;
    label: string;
    status: "done" | "active" | "pending";
  }>;
};

export type AgentTurnOptions = {
  onProgress?: (progress: AgentTurnProgress) => void;
};

function looksLikeClaimedSearch(text: string): boolean {
  return /\b(search(ed|ing)?|found (a |some )?snippet|according to (the )?(web|sources?)|latest (news|weather))\b/i.test(
    text,
  );
}

function safeContent(text: string, fallback: string): string {
  const cleaned = sanitizeAssistantVisibleText(text || "").trim();
  return cleaned || fallback;
}

/** Never ship a “I searched / found…” preamble when search did not succeed. */
function contentAfterFailedWebSearch(text: string, toolOutput: string): string {
  const cleaned = sanitizeAssistantVisibleText(text || "").trim();
  if (!cleaned || looksLikeClaimedSearch(cleaned)) {
    return (
      toolOutput.trim() ||
      "I couldn’t reach web search right now. Try again in a moment."
    );
  }
  return cleaned;
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
    case "knowledge.search":
      return "Searching knowledge…";
    case "web.search":
      return "Searching the web…";
    case "web.open":
      return "Opening page…";
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
    userMessage: request.content,
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
  // Unified orchestrator: local FM loop on Apple devices; cloud for vision/complex work.
  const hasImages = Boolean(request.images?.length);
  if (isAgentOrchestratorEnabled()) {
    const useLocal = await shouldUseLocalTurnOrchestrator(request);
    if (useLocal) {
      const { runLocalTurnOrchestrator } = await import(
        "@/lib/ai/orchestrator/local-turn-orchestrator"
      );
      return runLocalTurnOrchestrator(request, opts);
    }
    // Cloud path cannot touch Electron/Capacitor — preflight browser reads here.
    const { preflightActiveBrowserContext } = await import(
      "@/lib/ai/orchestrator/browser-context-preflight"
    );
    const pre = await preflightActiveBrowserContext(request, opts);
    if (pre.earlyReturn) return pre.earlyReturn;
    const { runOrchestratedTurn } = await import(
      "@/lib/ai/orchestrator/run-turn"
    );
    const cloud = await runOrchestratedTurn(pre.request, {
      onProgress: opts?.onProgress,
    });
    if (pre.toolResults.length) {
      const { collectCitationsFromToolResults } = await import(
        "@/lib/ai/orchestrator/collect-citations"
      );
      const mergedTools = [...pre.toolResults, ...(cloud.toolResults ?? [])];
      return {
        ...cloud,
        toolResults: mergedTools,
        citations:
          cloud.citations?.length
            ? cloud.citations
            : collectCitationsFromToolResults(mergedTools),
      };
    }
    return cloud;
  }

  // Legacy path — only when NEXT_PUBLIC_AI_AGENT_ORCHESTRATOR is off.
  // Prefer unified orchestrators above; this regex-gated loop is deprecated.

  if (hasImages) {
    throw new AiRuntimeError(
      "vision_requires_cloud",
      "Photos and images need Cloud or Auto mode — on-device Apple Intelligence can't interpret images yet. Switch runtime mode and try again.",
    );
  }

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
    // Images need cloud/vision — on-device text models cannot see them.
    forceCloud: mode === "cloud" || Boolean(request.images?.length),
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
    preferredRoute: request.images?.length
      ? "cander_cloud"
      : decision.target,
    routingReason: request.images?.length
      ? "image_attachments"
      : decision.reason,
  };

  const shortcut = allowTools
    ? await tryIntentShortcut(request.content, {
        threadId: request.threadId,
        recentText: (request.messages ?? [])
          .slice(-24)
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

  // Live web intent: hit Brave first. Models often say “I’ll search…” without
  // emitting tool JSON — that never reaches the API. Force the tool here.
  // Only when this turn’s content unlocked web (not sticky unrelated tools).
  const webIntentThisTurn =
    allowTools &&
    allowedToolNames.includes("web.search") &&
    decision.domains.includes("web") &&
    !decision.domains.some(
      (d) =>
        d === "projects" ||
        d === "navigation" ||
        d === "cloud_work" ||
        d === "clarification",
    );
  if (webIntentThisTurn) {
    const query = request.content.trim().slice(0, 200);
    console.log("[MODEL_TOOL_CALL]", {
      round: 0,
      name: "web.search",
      allowed: true,
      forced: true,
    });
    report({
      phase: "tool",
      label: "Thinking",
      detail: detailForTool("web.search"),
      toolName: "web.search",
    });
    const searchResult = await executeAuthorizedTool({
      name: "web.search",
      arguments: { query },
    });
    if (!searchResult.ok) {
      return {
        content: contentAfterFailedWebSearch(
          "",
          searchResult.output?.trim()
            ? `Web search failed: ${searchResult.output.trim()}`
            : "I couldn’t complete a live web search. Please try again in a moment — I won’t invent headlines or sources.",
        ),
        runtime: "cloud",
        offline: false,
        condensationOccurred: false,
        aiChatId: request.aiChatId ?? null,
        toolResults: [searchResult],
      };
    }
    report({
      phase: "follow_up",
      label: "Thinking",
      detail: "Reading sources…",
      toolName: "web.search",
    });
    report({
      phase: "generating",
      label: "Thinking",
      detail: "Generating…",
    });
    // Phase 0: keep the real user utterance; inject compressed evidence (not raw Exa dumps).
    const { compressEvidenceForSynthesis, buildSynthesisInstruction, answerShapeFromContract } =
      await import("@/lib/ai/answer-shape");
    const rows =
      (searchResult.data?.results as Array<{
        title?: string;
        url?: string;
        description?: string;
        snippet?: string;
      }>) ?? [];
    const shape = answerShapeFromContract(request.content);
    const compact = compressEvidenceForSynthesis({
      question: request.content,
      shape,
      profile: "onDevice",
      items: rows.map((r, i) => ({
        id: `legacy_${i + 1}`,
        title: r.title,
        url: r.url,
        content: r.description || r.snippet || "",
        kind: "search_result",
        ok: true,
      })),
    });
    const answered = await generateWithAiRuntime({
      ...gatedRequest,
      allowTools: false,
      allowedToolNames: [],
      content: request.content.trim(),
      toolContext: buildSynthesisInstruction({
        question: request.content,
        shape,
        evidence: compact,
      }),
      messages: [
        ...(request.messages ?? []),
        { role: "user", content: request.content },
      ],
    });
    const { ensureCompleteAnswer } = await import(
      "@/lib/ai/orchestrator/ensure-complete-answer"
    );
    const completed = await ensureCompleteAnswer({
      question: request.content,
      draft: safeContent(
        answered.content,
        "I found sources but couldn’t summarize them. Try asking again.",
      ),
      generate: async (instruction) => {
        const again = await generateWithAiRuntime({
          ...gatedRequest,
          allowTools: false,
          allowedToolNames: [],
          content: request.content.trim(),
          toolContext: instruction,
          messages: [
            ...(request.messages ?? []),
            { role: "user", content: request.content },
          ],
        });
        return again.content;
      },
    });
    return {
      ...answered,
      content: completed.content,
      toolResults: [searchResult],
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

    console.log("[MODEL_TOOL_CALL]", {
      round,
      name: call.name,
      allowed: allowTools && allowedToolNames.includes(call.name),
    });

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
      if (call.name === "web.search") {
        return {
          ...last,
          content: contentAfterFailedWebSearch(
            text,
            "I couldn’t complete a live web search. Please try again in a moment — I won’t invent headlines or sources.",
          ),
          toolResults,
        };
      }
      return {
        ...last,
        content: safeContent(
          text,
          "I couldn't complete that. Try again in a different way?",
        ),
        toolResults,
      };
    }

    if (call.name === "web.search") {
      report({
        phase: "follow_up",
        label: "Thinking",
        detail: "Reading sources…",
        toolName: call.name,
      });
    }

    const toolNote = [
      `Result for ${result.name}:\n${result.output}`,
      "Continue briefly for the user in plain language only. Call another tool only if still needed; otherwise a short normal reply with no JSON and no tool names. Cite real URLs from the results only — never invent sources or claim you searched if results are empty.",
    ].join("\n\n");

    report({
      phase: "generating",
      label: "Thinking",
      detail: "Generating…",
    });

    working = {
      ...gatedRequest,
      // Keep the real user utterance — never persist tool blobs as user turns.
      content: request.content,
      toolContext: [working.toolContext, toolNote].filter(Boolean).join("\n\n"),
      messages: [
        ...(request.messages ?? []),
        { role: "user", content: request.content },
        { role: "assistant", content: text || "(acted)" },
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
