"use client";

/**
 * Unified client turn orchestrator for Apple Foundation Models.
 * FM reasons; Cander executes tools and collects evidence in a multi-step loop.
 */

import {
  buildDialoguePrompt,
  hasPriorConversationTurns,
  isIdentityQuestion,
} from "@/lib/ai/assistant-behavior";
import { buildPlanCapabilityLine } from "@/lib/ai/plan-capability";
import { buildCanderOnDeviceInstructions } from "@/lib/ai/runtime/cander-on-device-instructions";
import {
  ensureOnDeviceIdentity,
  getOnDeviceWorkspaceSnapshot,
  refreshOnDeviceInventoryCache,
} from "@/lib/ai/runtime/on-device-workspace-cache";
import {
  executeAuthorizedTool,
  formatToolsForPrompt,
  type AiToolCallResult,
} from "@/lib/ai/runtime/tools";
import { tryIntentShortcut } from "@/lib/ai/runtime/intent-actions";
import { clearTurnContext, setTurnContext } from "@/lib/ai/runtime/turn-context";
import { generateFmTurn } from "@/lib/ai/runtime/native/fm-generate";
import { buildContextPackage } from "@/lib/ai/intelligence/context-budget";
import {
  formatTaskStateForPrompt,
  getThreadTaskState,
} from "@/lib/ai/task-state";
import { sanitizeAssistantVisibleText } from "@/lib/ai/tool-protocol";
import type {
  AgentTurnOptions,
  AgentTurnProgress,
  AgentTurnResult,
} from "@/lib/ai/runtime/agent-turn";
import type { AiGenerateRequest, AiGenerateResult } from "@/lib/ai/runtime/types";
import { getActorSnapshot } from "@/lib/session";
import { getMembersSnapshot } from "@/lib/workspace-policy";
import {
  evidenceFromWebOpen,
  evidenceFromWebSearch,
  formatEvidenceForPrompt,
  type TurnEvidence,
} from "@/lib/ai/orchestrator/evidence";
import {
  initialDeterministicToolCalls,
  requiresExternalEvidence,
} from "@/lib/ai/orchestrator/deterministic-triggers";
import {
  failClosedMessage,
  validateLocalGrounding,
} from "@/lib/ai/orchestrator/grounding-validator";
import {
  emitToolExecution,
  mapToolEventToProgressLabel,
  setTurnToolExecutionListener,
} from "@/lib/ai/orchestrator/tool-execution-bus";

export const LOCAL_ORCHESTRATOR_TOOLS = [
  "web.search",
  "web.open",
  "workspace.search",
  "knowledge.search",
  "nav.open",
  "project.create",
  "project.open",
  "panel.open",
  "panel.close",
  "ui.ask_clarification",
  "ui.confirm",
] as const;

const MAX_TOOL_ROUNDS = 5;

function detailForTool(name: string): string {
  switch (name) {
    case "web.search":
      return "Searching the web…";
    case "web.open":
      return "Opening page…";
    case "workspace.search":
      return "Searching workspace…";
    case "knowledge.search":
      return "Searching knowledge…";
    case "project.create":
      return "Creating project…";
    case "project.open":
      return "Opening project…";
    case "ui.ask_clarification":
      return "Preparing questions…";
    case "nav.open":
      return "Navigating…";
    default:
      return "Calling tool…";
  }
}

function safeContent(text: string, fallback: string): string {
  const cleaned = sanitizeAssistantVisibleText(text || "").trim();
  return cleaned || fallback;
}

function evidenceFromToolResult(
  result: AiToolCallResult,
): TurnEvidence | TurnEvidence[] | null {
  if (result.name === "web.search") {
    const rows =
      (result.data?.results as Array<{
        title: string;
        url: string;
        description?: string;
        snippet?: string;
      }>) ?? [];
    if (!rows.length) return null;
    return evidenceFromWebSearch(
      result.name,
      rows.map((r) => ({
        title: r.title,
        url: r.url,
        description: r.description || r.snippet || "",
      })),
    );
  }
  if (result.name === "web.open") {
    const data = result.data as
      | {
          url?: string;
          finalUrl?: string;
          title?: string;
          text?: string;
        }
      | undefined;
    return evidenceFromWebOpen({
      ok: result.ok,
      url: String(data?.url ?? ""),
      finalUrl: data?.finalUrl,
      title: data?.title,
      text: data?.text,
      error: result.ok ? undefined : result.output,
    });
  }
  if (result.ok && result.output.trim()) {
    return {
      id: `tool_${Date.now()}`,
      kind: "tool",
      title: result.name,
      content: result.output.slice(0, 8000),
      retrievedAt: new Date().toISOString(),
      sourceTool: result.name,
      ok: true,
    };
  }
  return null;
}

function appendEvidence(
  bucket: TurnEvidence[],
  item: TurnEvidence | TurnEvidence[] | null,
) {
  if (!item) return;
  if (Array.isArray(item)) bucket.push(...item);
  else bucket.push(item);
}

async function buildFmPrompt(
  request: AiGenerateRequest,
  evidence: TurnEvidence[],
  extraInstruction?: string,
): Promise<{ prompt: string; instructions: string }> {
  const [identity] = await Promise.all([
    ensureOnDeviceIdentity(),
    refreshOnDeviceInventoryCache(request.workspaceId),
  ]);
  const taskState = getThreadTaskState(request.threadId);
  const taskActive =
    Boolean(taskState) &&
    taskState!.status !== "idle" &&
    taskState!.status !== "completed";
  const priorTurns = hasPriorConversationTurns(request.messages, { taskActive });
  const snap = getOnDeviceWorkspaceSnapshot({
    workspaceId: request.workspaceId,
    projectId: request.projectId,
    projectSpace: request.projectSpace,
    aiChatId: request.aiChatId,
    threadId: request.threadId,
    currentContent: request.content,
  });
  const toolBlock = formatToolsForPrompt([...LOCAL_ORCHESTRATOR_TOOLS]);
  const actorId = getActorSnapshot();
  const member =
    getMembersSnapshot().find((m) => m.id === actorId) ??
    getMembersSnapshot()[0];
  const taskBlock = formatTaskStateForPrompt(taskState);
  const pkg = buildContextPackage({
    route: "on_device",
    taskStateText: taskBlock,
    recentMessages: request.messages,
    inventoryText: snap.inventoryBlock ?? "",
    toolCatalog: toolBlock,
    allowTools: true,
  });
  const includeInventory = Boolean(pkg.inventoryText);
  const evidenceBlock = formatEvidenceForPrompt(evidence);
  const instructions = [
    buildCanderOnDeviceInstructions({
      shortName: identity?.shortName ?? snap.shortName,
      fullName: identity?.fullName ?? snap.fullName,
      email: identity?.email ?? snap.email,
      workspaceName: snap.workspaceName,
      projectTitle: includeInventory ? snap.projectTitle : null,
      spaceLabel: includeInventory ? snap.spaceLabel : null,
      inventoryBlock: includeInventory ? pkg.inventoryText : null,
      transcriptBlock: priorTurns ? null : snap.transcriptBlock,
      planCapabilityLine: buildPlanCapabilityLine(member),
      hasPriorTurns: priorTurns,
      includeInventory,
      toolsEnabled: true,
      identityAsked: isIdentityQuestion(request.content),
    }),
    pkg.taskStateText,
    pkg.toolCatalog,
    evidenceBlock,
    extraInstruction,
    requiresExternalEvidence(request.content)
      ? "This turn needs live or external facts. Use web.open or web.search when needed. Never invent URLs, headlines, or page content — only cite evidence above or from tool results."
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  const prompt = buildDialoguePrompt(
    (pkg.messages.length ? pkg.messages : request.messages) as
      | Array<{ role: "user" | "assistant" | "system"; content: string }>
      | undefined,
    request.content,
  );
  return { prompt, instructions };
}

export async function runLocalTurnOrchestrator(
  request: AiGenerateRequest,
  opts?: AgentTurnOptions,
): Promise<AgentTurnResult> {
  setTurnContext({
    threadId: request.threadId,
    workspaceId: request.workspaceId,
    projectId: request.projectId,
  });
  try {
    return await runLocalTurnOrchestratorInner(request, opts);
  } finally {
    clearTurnContext();
  }
}

async function runLocalTurnOrchestratorInner(
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

  setTurnToolExecutionListener((event) => {
    const mapped = mapToolEventToProgressLabel(event);
    if (mapped) {
      report({
        phase: mapped.phase,
        label: "Thinking",
        detail: mapped.detail,
        toolName: mapped.toolName,
      });
    }
  });

  try {
    report({ phase: "thinking", label: "Thinking" });

  const shortcut = await tryIntentShortcut(request.content, {
    threadId: request.threadId,
    recentText: (request.messages ?? [])
      .slice(-24)
      .map((m) => m.content)
      .join("\n"),
  });
  if (shortcut) {
    return {
      content: shortcut.content,
      runtime: "apple-local",
      offline: false,
      condensationOccurred: false,
      aiChatId: request.aiChatId ?? null,
      toolResults: shortcut.toolResults,
      pausedForUser: shortcut.pausedForUser,
    };
  }

  const evidence: TurnEvidence[] = [];
  const toolResults: AiToolCallResult[] = [];
  let retrievalAttempted = false;

  for (const queued of initialDeterministicToolCalls(request.content)) {
    emitToolExecution({
      type: "tool_start",
      name: queued.name,
      reason: queued.reason,
      deterministic: true,
    });
    console.log("[TOOL_REQUEST]", {
      name: queued.name,
      reason: queued.reason,
      deterministic: true,
    });
    report({
      phase: "tool",
      label: "Thinking",
      detail: detailForTool(queued.name),
      toolName: queued.name,
    });
    retrievalAttempted =
      retrievalAttempted ||
      queued.name === "web.search" ||
      queued.name === "web.open";
    const started = Date.now();
    const result = await executeAuthorizedTool({
      name: queued.name,
      arguments: queued.arguments,
    });
    emitToolExecution({
      type: "tool_end",
      name: result.name,
      ok: result.ok,
      durationMs: Date.now() - started,
    });
    console.log("[TOOL_RESULT]", {
      name: result.name,
      ok: result.ok,
      deterministic: true,
    });
    toolResults.push(result);
    appendEvidence(evidence, evidenceFromToolResult(result));
    if (
      queued.name === "web.open" &&
      !result.ok &&
      requiresExternalEvidence(request.content)
    ) {
      return {
        content: safeContent(
          "",
          result.output ||
            "I couldn't open that page, so I won't guess what's on it. Try again in a moment.",
        ),
        runtime: "apple-local",
        offline: false,
        condensationOccurred: false,
        aiChatId: request.aiChatId ?? null,
        toolResults,
      };
    }
  }

  let lastGenerate: AiGenerateResult | null = null;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    if (round > 0) {
      report({
        phase: "follow_up",
        label: "Thinking",
        detail: "Using the result…",
      });
    }

    const { prompt, instructions } = await buildFmPrompt(request, evidence);
    emitToolExecution({ type: "model_generate_start", round });
    report({ phase: "generating", label: "Thinking", detail: "Generating…" });
    const fm = await generateFmTurn({ prompt, instructions });
    emitToolExecution({
      type: "model_generate_end",
      round,
      structured: fm.structured,
    });
    lastGenerate = {
      content: fm.text,
      runtime: "apple-local",
      offline: false,
      condensationOccurred: false,
      aiChatId: request.aiChatId ?? null,
    };

    const call = fm.toolCall;
    if (!call) {
      const answer = safeContent(
        fm.text,
        "I'm here — tell me what you'd like to do.",
      );
      const grounding = validateLocalGrounding({
        answer,
        userRequest: request.content,
        evidence,
        retrievalAttempted,
      });
      if (!grounding.valid && grounding.recommendedAction === "fail_closed") {
        return {
          ...lastGenerate,
          content: failClosedMessage(grounding.issues),
          toolResults: toolResults.length ? toolResults : undefined,
        };
      }
      return {
        ...lastGenerate,
        content: answer,
        toolResults: toolResults.length ? toolResults : undefined,
      };
    }

    if (
      !LOCAL_ORCHESTRATOR_TOOLS.includes(
        call.name as (typeof LOCAL_ORCHESTRATOR_TOOLS)[number],
      )
    ) {
      const cleaned = safeContent(fm.text, "");
      if (cleaned) {
        return {
          ...lastGenerate,
          content: cleaned,
          toolResults: toolResults.length ? toolResults : undefined,
        };
      }
      continue;
    }

    emitToolExecution({ type: "tool_start", name: call.name, round });
    console.log("[TOOL_REQUEST]", { name: call.name, round });
    report({
      phase: "tool",
      label: "Thinking",
      detail: detailForTool(call.name),
      toolName: call.name,
    });
    retrievalAttempted =
      retrievalAttempted ||
      call.name === "web.search" ||
      call.name === "web.open";
    const toolStarted = Date.now();
    const result = await executeAuthorizedTool({
      name: call.name,
      arguments: call.arguments,
    });
    emitToolExecution({
      type: "tool_end",
      name: result.name,
      ok: result.ok,
      durationMs: Date.now() - toolStarted,
      round,
    });
    console.log("[TOOL_RESULT]", { name: result.name, ok: result.ok, round });
    toolResults.push(result);
    appendEvidence(evidence, evidenceFromToolResult(result));
    const added = evidenceFromToolResult(result);
    if (added) {
      const items = Array.isArray(added) ? added : [added];
      emitToolExecution({
        type: "evidence_added",
        count: items.length,
        kinds: items.map((e) => e.kind),
      });
    }

    if (result.pauseForUser) {
      return {
        ...lastGenerate,
        content: safeContent(
          fm.text,
          "I need a few details — fill in the card above the message box.",
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
        ...lastGenerate,
        content: safeContent(fm.text, result.output),
        toolResults,
      };
    }

    if (!result.ok) {
      if (call.name === "web.search" || call.name === "web.open") {
        if (requiresExternalEvidence(request.content)) {
          return {
            ...lastGenerate,
            content: safeContent(
              fm.text,
              result.output ||
                "I couldn't retrieve live information for that request.",
            ),
            toolResults,
          };
        }
      } else {
        return {
          ...lastGenerate,
          content: safeContent(
            fm.text,
            "I couldn't complete that. Try again in a different way?",
          ),
          toolResults,
        };
      }
    }
  }

  const fallback = safeContent(
    lastGenerate?.content ?? "",
    "I hit a step limit — try a shorter request.",
  );
  const grounding = validateLocalGrounding({
    answer: fallback,
    userRequest: request.content,
    evidence,
    retrievalAttempted,
  });
  if (!grounding.valid && grounding.recommendedAction === "fail_closed") {
    return {
      ...(lastGenerate as AiGenerateResult),
      content: failClosedMessage(grounding.issues),
      toolResults,
    };
  }
  return {
    ...(lastGenerate as AiGenerateResult),
    content: fallback,
    toolResults,
  };
  } finally {
    setTurnToolExecutionListener(null);
  }
}
