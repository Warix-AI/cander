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
  evidenceFromBrowserObservation,
  prepareSynthesisEvidence,
  type TurnEvidence,
} from "@/lib/ai/orchestrator/evidence";
import {
  initialDeterministicToolCalls,
  requiresExternalEvidence,
} from "@/lib/ai/orchestrator/deterministic-triggers";
import { refersToActiveBrowserSurface } from "@/lib/browser-context/routing";
import {
  failClosedMessage,
  validateLocalGrounding,
} from "@/lib/ai/orchestrator/grounding-validator";
import {
  emitToolExecution,
  mapToolEventToProgressLabel,
  setTurnToolExecutionListener,
} from "@/lib/ai/orchestrator/tool-execution-bus";
import { collectCitationsFromToolResults } from "@/lib/ai/orchestrator/collect-citations";
import {
  deterministicAnswerFromEvidence,
  inferAnswerShape,
  looksLikeContextOverflow,
  shrinkEvidenceForRetry,
  buildSynthesisInstruction,
} from "../answer-shape/index.ts";
import { shouldEscalateToBrowser } from "@/lib/computer/tool-routing";

export const LOCAL_ORCHESTRATOR_TOOLS = [
  "web.search",
  "web.open",
  "web.read",
  "web.research",
  "browser.current.get_context",
  "browser.current.get_selection",
  "browser.current.capture_viewport",
  "browser.current.get_metadata",
  "computer.browser.open",
  "computer.browser.observe",
  "computer.browser.click",
  "computer.browser.fill",
  "computer.browser.requestUserControl",
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
    case "web.read":
      return "Reading page…";
    case "web.research":
      return "Researching…";
    case "computer.browser.open":
      return "Opening remote browser…";
    case "computer.browser.observe":
      return "Reading page structure…";
    case "computer.browser.click":
    case "computer.browser.fill":
      return "Using browser…";
    case "browser.current.get_context":
      return "Reading the page on the right…";
    case "browser.current.get_selection":
      return "Reading selection…";
    case "browser.current.capture_viewport":
      return "Capturing the viewport…";
    case "browser.current.get_metadata":
      return "Checking the active tab…";
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
  if (result.name === "web.search" || result.name === "web.research") {
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
  if (result.name === "web.open" || result.name === "web.read") {
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
  if (
    result.name.startsWith("computer.browser.") &&
    result.name !== "computer.browser.requestUserControl"
  ) {
    const data = result.data as
      | {
          sessionId?: string;
          observation?: { url?: string; title?: string; snapshot?: string };
        }
      | undefined;
    const obs = data?.observation;
    return evidenceFromBrowserObservation({
      ok: result.ok,
      sourceTool: result.name,
      url: obs?.url,
      title: obs?.title,
      snapshot: obs?.snapshot ?? result.output,
      sessionId: data?.sessionId,
      error: result.ok ? undefined : result.output,
    });
  }
  if (result.name.startsWith("browser.current.")) {
    const data = result.data as
      | {
          page?: { url?: string; title?: string; visibleText?: string };
          selection?: { url?: string; text?: string };
          screenshot?: { url?: string };
        }
      | undefined;
    const page = data?.page;
    const content =
      page?.visibleText ||
      data?.selection?.text ||
      result.output;
    return evidenceFromBrowserObservation({
      ok: result.ok,
      sourceTool: result.name,
      url: page?.url || data?.selection?.url || data?.screenshot?.url,
      title: page?.title || "Active browser tab",
      snapshot: content,
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

/** Page fetch → agent-browser when the page needs JS, interaction, or returned thin/empty text. */
async function escalateWebOpenIfNeeded(opts: {
  result: AiToolCallResult;
  userMessage: string;
  toolResults: AiToolCallResult[];
  evidence: TurnEvidence[];
  report: (progress: AgentTurnProgress) => void;
}): Promise<void> {
  if (opts.result.name !== "web.open" && opts.result.name !== "web.read") return;
  if (opts.toolResults.some((r) => r.name === "computer.browser.open")) return;
  const data = opts.result.data as
    | { url?: string; finalUrl?: string; text?: string }
    | undefined;
  const url = String(data?.finalUrl || data?.url || "").trim();
  if (!url) return;
  const textLen = String(data?.text ?? "").length;
  if (
    !shouldEscalateToBrowser({
      webOpenOk: opts.result.ok,
      textLength: textLen,
      userMessage: opts.userMessage,
    })
  ) {
    return;
  }
  emitToolExecution({
    type: "tool_start",
    name: "computer.browser.open",
    reason: "escalate_after_web_open",
    deterministic: true,
  });
  opts.report({
    phase: "tool",
    label: "Thinking",
    detail: detailForTool("computer.browser.open"),
    toolName: "computer.browser.open",
  });
  const started = Date.now();
  const escalated = await executeAuthorizedTool({
    name: "computer.browser.open",
    arguments: { url },
  });
  emitToolExecution({
    type: "tool_end",
    name: escalated.name,
    ok: escalated.ok,
    durationMs: Date.now() - started,
  });
  opts.toolResults.push(escalated);
  appendEvidence(opts.evidence, evidenceFromToolResult(escalated));
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
  const synthesis = prepareSynthesisEvidence(
    request.content,
    evidence,
    "onDevice",
  );
  const evidenceBlock = synthesis.instruction;
  let activeBrowserMeta = "";
  try {
    const { getActiveBrowserContextTab } = await import(
      "@/lib/browser-context/active-tab"
    );
    const tab = getActiveBrowserContextTab();
    if (tab) {
      let domain = tab.url;
      try {
        domain = new URL(tab.url).hostname.replace(/^www\./, "");
      } catch {
        // keep raw
      }
      activeBrowserMeta = [
        "## Active right-panel browser (metadata only — not full page text)",
        `kind=${tab.tabKind}; title=${tab.title}; domain=${domain}; project=${tab.projectId ?? "none"}`,
        `canReadText=${tab.canReadText}; canCaptureViewport=${tab.canCaptureViewport}`,
        "When the user refers to this page/screen/preview/selection, call browser.current.get_context (or capture_viewport for visual questions) before saying you cannot see it. Only the selected tab is readable.",
      ].join("\n");
    }
  } catch {
    // ignore
  }
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
    activeBrowserMeta,
    evidenceBlock,
    extraInstruction,
    requiresExternalEvidence(request.content)
      ? "This turn needs live or external facts. Prefer web.search for discovery, web.open for readable public pages, browser.current.* for the active right-panel tab, and computer.browser.open only for JavaScript, interaction, auth, scrolling, or visual inspection of remote pages. Never invent URLs, headlines, or page content — only synthesize from compact evidence above. Do not narrate search results."
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
    userMessage: request.content,
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
      citations: collectCitationsFromToolResults(shortcut.toolResults),
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
      queued.name === "web.open" ||
      queued.name === "web.read" ||
      queued.name === "web.research" ||
      queued.name.startsWith("browser.current.");
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

    // If the user asked about the right-panel page and we couldn't read it,
    // say so clearly — do not let the model invent "I can't see screens."
    if (
      queued.name.startsWith("browser.current.") &&
      !result.ok &&
      refersToActiveBrowserSurface(request.content)
    ) {
      return {
        content: safeContent(
          "",
          result.output ||
            "I couldn't read the active browser tab. Make sure a tab is selected in the right panel and you're on the latest desktop shell (0.1.3+).",
        ),
        runtime: "apple-local",
        offline: false,
        condensationOccurred: false,
        aiChatId: request.aiChatId ?? null,
        toolResults,
        citations: collectCitationsFromToolResults(toolResults),
      };
    }
    if (
      (queued.name === "web.open" || queued.name === "web.read") &&
      !result.ok &&
      requiresExternalEvidence(request.content)
    ) {
      await escalateWebOpenIfNeeded({
        result,
        userMessage: request.content,
        toolResults,
        evidence,
        report,
      });
      if (toolResults.some((r) => r.name === "computer.browser.open" && r.ok)) {
        continue;
      }
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
        citations: collectCitationsFromToolResults(toolResults),
      };
    }
    if (queued.name === "web.open" || queued.name === "web.read") {
      await escalateWebOpenIfNeeded({
        result,
        userMessage: request.content,
        toolResults,
        evidence,
        report,
      });
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
    let fm: Awaited<ReturnType<typeof generateFmTurn>>;
    try {
      fm = await generateFmTurn({ prompt, instructions });
    } catch (err) {
      const detail =
        err instanceof Error ? err.message.slice(0, 200) : "On-device model failed.";
      console.error("[LOCAL_ORCH_FM_ERROR]", { round, message: detail });
      const cites = collectCitationsFromToolResults(toolResults);
      const shape = inferAnswerShape(request.content);
      let synthesis = prepareSynthesisEvidence(
        request.content,
        evidence,
        "onDevice",
      );

      // Context overflow: shrink evidence and retry once — never dump raw search.
      if (looksLikeContextOverflow(detail) && synthesis.compact.length) {
        const shrunk = shrinkEvidenceForRetry(synthesis.compact);
        const retryInstructions = [
          instructions.replace(synthesis.instruction, ""),
          buildSynthesisInstruction({
            question: request.content,
            shape,
            evidence: shrunk,
          }),
        ]
          .filter(Boolean)
          .join("\n\n");
        try {
          report({
            phase: "generating",
            label: "Thinking",
            detail: "Condensing sources…",
          });
          fm = await generateFmTurn({ prompt, instructions: retryInstructions });
        } catch (retryErr) {
          const fallback = deterministicAnswerFromEvidence({
            question: request.content,
            shape,
            evidence: shrunk,
          });
          console.error("[LOCAL_ORCH_FM_RETRY_FAILED]", {
            message:
              retryErr instanceof Error
                ? retryErr.message.slice(0, 160)
                : "retry_failed",
          });
          return {
            content: fallback,
            runtime: "apple-local",
            offline: false,
            condensationOccurred: false,
            aiChatId: request.aiChatId ?? null,
            toolResults: toolResults.length ? toolResults : undefined,
            citations: cites,
          };
        }
      } else if (synthesis.compact.length) {
        return {
          content: deterministicAnswerFromEvidence({
            question: request.content,
            shape,
            evidence: synthesis.compact,
          }),
          runtime: "apple-local",
          offline: false,
          condensationOccurred: false,
          aiChatId: request.aiChatId ?? null,
          toolResults: toolResults.length ? toolResults : undefined,
          citations: cites,
        };
      } else {
        return {
          content:
            "I couldn’t finish that reply right now. Please try again in a moment.",
          runtime: "apple-local",
          offline: false,
          condensationOccurred: false,
          aiChatId: request.aiChatId ?? null,
          toolResults: toolResults.length ? toolResults : undefined,
          citations: cites,
        };
      }
    }
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
          citations: collectCitationsFromToolResults(toolResults),
        };
      }
      return {
        ...lastGenerate,
        content: answer,
        toolResults: toolResults.length ? toolResults : undefined,
        citations: collectCitationsFromToolResults(toolResults),
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
          citations: collectCitationsFromToolResults(toolResults),
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
      call.name === "web.open" ||
      call.name === "web.read" ||
      call.name === "web.research";
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

    if (call.name === "web.open" || call.name === "web.read") {
      await escalateWebOpenIfNeeded({
        result,
        userMessage: request.content,
        toolResults,
        evidence,
        report,
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
        citations: collectCitationsFromToolResults(toolResults),
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
        citations: collectCitationsFromToolResults(toolResults),
      };
    }

    if (!result.ok) {
      if (
        call.name === "web.search" ||
        call.name === "web.open" ||
        call.name === "web.read" ||
        call.name === "web.research"
      ) {
        if (requiresExternalEvidence(request.content)) {
          return {
            ...lastGenerate,
            content: safeContent(
              fm.text,
              result.output ||
                "I couldn't retrieve live information for that request.",
            ),
            toolResults,
            citations: collectCitationsFromToolResults(toolResults),
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
          citations: collectCitationsFromToolResults(toolResults),
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
      citations: collectCitationsFromToolResults(toolResults),
    };
  }
  return {
    ...(lastGenerate as AiGenerateResult),
    content: fallback,
    toolResults,
    citations: collectCitationsFromToolResults(toolResults),
  };
  } finally {
    setTurnToolExecutionListener(null);
  }
}
