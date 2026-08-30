"use client";

/**
 * Unified client turn orchestrator for Apple Foundation Models.
 * Compiles a tiny TurnProfile per turn; FM synthesizes — runtime owns tools/retrieval.
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
  evidenceFromBrowserObservation,
  prepareSynthesisEvidence,
  type TurnEvidence,
} from "@/lib/ai/orchestrator/evidence";
import { requiresExternalEvidence } from "@/lib/ai/orchestrator/deterministic-triggers";
import { refersToActiveBrowserSurface } from "@/lib/browser-context/routing";
import {
  failClosedMessage,
  hasUsableEvidenceSnippets,
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
import {
  citationsFromAtoms,
  compileTurnProfile,
  formatTurnProfileInstructions,
  mergeProvenanceAtoms,
  normalizeWebPageResult,
  normalizeWebSearchResult,
  parseSemanticResponse,
  runParallelTasks,
  semanticBlocksInstruction,
  semanticBlocksToChatBlocks,
  semanticBlocksToMarkdown,
  toDynamicProfilePayload,
  type ProvenanceAtom,
  type TurnProfile,
} from "@/lib/ai/turn-environment";
import type { ChatBlock } from "@/lib/types";

/** @deprecated Prefer compileTurnProfile — kept for tests/compat. */
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

/** Narrow deterministic fallback — strong structured evidence only, not a second answer engine. */
function narrowDeterministicFallback(opts: {
  question: string;
  evidence: TurnEvidence[];
}): string | null {
  if (!hasUsableEvidenceSnippets(opts.evidence)) return null;
  const shape = inferAnswerShape(opts.question);
  const synthesis = prepareSynthesisEvidence(
    opts.question,
    opts.evidence,
    "onDevice",
  );
  if (!synthesis.compact.length) return null;
  const strong = synthesis.compact.filter(
    (c) =>
      c.excerpt.length >= 40 &&
      (/\d/.test(c.excerpt) || shape.kind === "fact" || shape.kind === "calculation"),
  );
  if (!strong.length && shape.kind !== "comparison") return null;
  return deterministicAnswerFromEvidence({
    question: opts.question,
    shape,
    evidence: strong.length ? strong : synthesis.compact.slice(0, 3),
  });
}

function evidenceFromToolResult(
  result: AiToolCallResult,
): { evidence: TurnEvidence[]; atoms: ProvenanceAtom[] } {
  if (result.name === "web.search" || result.name === "web.research") {
    const rows =
      (result.data?.results as Array<{
        title: string;
        url: string;
        description?: string;
        snippet?: string;
        id?: string;
      }>) ?? [];
    const cites = Array.isArray(result.data?.citations)
      ? (result.data?.citations as Array<{
          id?: string;
          title?: string;
          url?: string;
          excerpt?: string;
          description?: string;
        }>)
      : [];
    const normalized = normalizeWebSearchResult({
      toolName: result.name,
      ok: result.ok,
      results: rows,
      citations: cites,
    });
    return { evidence: normalized.evidence, atoms: normalized.atoms };
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
    const normalized = normalizeWebPageResult({
      toolName: result.name,
      ok: result.ok,
      url: String(data?.url ?? ""),
      finalUrl: data?.finalUrl,
      title: data?.title,
      text: data?.text,
      error: result.ok ? undefined : result.output,
    });
    return { evidence: normalized.evidence, atoms: normalized.atoms };
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
    const ev = evidenceFromBrowserObservation({
      ok: result.ok,
      sourceTool: result.name,
      url: obs?.url,
      title: obs?.title,
      snapshot: obs?.snapshot ?? result.output,
      sessionId: data?.sessionId,
      error: result.ok ? undefined : result.output,
    });
    return {
      evidence: [ev],
      atoms: ev.ok
        ? [
            {
              sourceId: ev.id,
              title: ev.title,
              url: ev.url,
              excerpt: ev.content.slice(0, 400),
              kind: "browser",
              sourceTool: result.name,
            },
          ]
        : [],
    };
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
      page?.visibleText || data?.selection?.text || result.output;
    const ev = evidenceFromBrowserObservation({
      ok: result.ok,
      sourceTool: result.name,
      url: page?.url || data?.selection?.url || data?.screenshot?.url,
      title: page?.title || "Active browser tab",
      snapshot: content,
      error: result.ok ? undefined : result.output,
    });
    return {
      evidence: [ev],
      atoms: ev.ok
        ? [
            {
              sourceId: ev.id,
              title: ev.title,
              url: ev.url,
              excerpt: ev.content.slice(0, 400),
              kind: "browser",
              sourceTool: result.name,
            },
          ]
        : [],
    };
  }
  if (result.ok && result.output.trim()) {
    const id = `tool_${Date.now()}`;
    return {
      evidence: [
        {
          id,
          kind: "tool",
          title: result.name,
          content: result.output.slice(0, 8000),
          retrievedAt: new Date().toISOString(),
          sourceTool: result.name,
          ok: true,
        },
      ],
      atoms: [],
    };
  }
  return { evidence: [], atoms: [] };
}

function appendEvidence(bucket: TurnEvidence[], items: TurnEvidence[]) {
  bucket.push(...items);
}

function finalizeCitations(
  toolResults: AiToolCallResult[],
  atoms: ProvenanceAtom[],
) {
  const fromAtoms = citationsFromAtoms(atoms);
  if (fromAtoms.length) return fromAtoms;
  return collectCitationsFromToolResults(toolResults);
}

function answerFromFmText(text: string): {
  content: string;
  blocks?: ChatBlock[];
} {
  const trimmed = text.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*"blocks"\s*:\s*\[[\s\S]*\]\s*\}\s*$/);
  if (jsonMatch) {
    try {
      const parsed = parseSemanticResponse(JSON.parse(jsonMatch[0]!));
      if (parsed) {
        const md = semanticBlocksToMarkdown(parsed.blocks);
        const prose = trimmed.slice(0, jsonMatch.index).trim();
        return {
          content: prose || md || trimmed,
          blocks: semanticBlocksToChatBlocks(parsed.blocks),
        };
      }
    } catch {
      // fall through
    }
  }
  return { content: trimmed };
}

/** Page fetch → agent-browser when the page needs JS, interaction, or returned thin/empty text. */
async function escalateWebOpenIfNeeded(opts: {
  result: AiToolCallResult;
  userMessage: string;
  toolResults: AiToolCallResult[];
  evidence: TurnEvidence[];
  atoms: ProvenanceAtom[];
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
  const mapped = evidenceFromToolResult(escalated);
  appendEvidence(opts.evidence, mapped.evidence);
  opts.atoms.push(...mapped.atoms);
}

async function buildFmPrompt(
  request: AiGenerateRequest,
  evidence: TurnEvidence[],
  profile: TurnProfile,
  extraInstruction?: string,
): Promise<{ prompt: string; instructions: string; profile: TurnProfile }> {
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
  const actorId = getActorSnapshot();
  const member =
    getMembersSnapshot().find((m) => m.id === actorId) ??
    getMembersSnapshot()[0];
  const taskBlock = formatTaskStateForPrompt(taskState);
  const toolBlock = formatTurnProfileInstructions(profile);
  const pkg = buildContextPackage({
    route: "on_device",
    taskStateText: taskBlock,
    recentMessages: request.messages,
    inventoryText: snap.inventoryBlock ?? "",
    toolCatalog: toolBlock,
    allowTools: profile.tools.length > 0,
  });
  const includeInventory = Boolean(pkg.inventoryText);
  const synthesis = prepareSynthesisEvidence(
    request.content,
    evidence,
    "onDevice",
  );
  const evidenceBlock = synthesis.instruction;
  let activeBrowserMeta = profile.contextPacket.activeBrowserMeta;
  if (!activeBrowserMeta) {
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
  }
  const toolsEnabled = profile.toolMode !== "disallowed" && profile.tools.length > 0;
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
      toolsEnabled,
      identityAsked: isIdentityQuestion(request.content),
    }),
    pkg.taskStateText,
    toolBlock,
    activeBrowserMeta,
    evidenceBlock,
    profile.outputSchema === "semantic_blocks_v1"
      ? semanticBlocksInstruction()
      : "",
    extraInstruction,
    requiresExternalEvidence(request.content) && evidence.length
      ? "Evidence was retrieved for this turn. Answer from compact evidence only. Never invent facts. Do not tell the user to check a website or nutrition calculator when evidence is present."
      : requiresExternalEvidence(request.content)
        ? "This turn needs live facts. Prefer tools only if still listed above."
        : "",
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, profile.budgets.maxPromptChars);

  // Expose DynamicProfile payload for native bridges (no-op today).
  void toDynamicProfilePayload(profile, evidenceBlock);

  const prompt = buildDialoguePrompt(
    (pkg.messages.length ? pkg.messages : request.messages) as
      | Array<{ role: "user" | "assistant" | "system"; content: string }>
      | undefined,
    request.content,
  );
  return { prompt, instructions, profile };
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

    const taskState = getThreadTaskState(request.threadId);
    let profile = compileTurnProfile({
      content: request.content,
      taskState,
      messages: request.messages,
      pendingStateText: formatTaskStateForPrompt(taskState),
      isDesktop:
        typeof navigator !== "undefined" &&
        /Mac|Win|Linux/i.test(navigator.platform || ""),
    });

    const evidence: TurnEvidence[] = [];
    const toolResults: AiToolCallResult[] = [];
    const provenanceBatches: ProvenanceAtom[][] = [];
    let retrievalAttempted = false;

    // —— Pre-run: bypass FM for obvious retrieval ——
    if (profile.preRunTasks.length) {
      emitToolExecution({ type: "model_generate_start", round: -1 });
      const parallel = await runParallelTasks({
        tasks: profile.preRunTasks.map((task, i) => ({
          id: `${task.name}_${i}`,
          run: async (signal) => {
            if (signal.aborted) throw new Error("cancelled");
            emitToolExecution({
              type: "tool_start",
              name: task.name,
              reason: task.reason,
              deterministic: true,
            });
            console.log("[TOOL_REQUEST]", {
              name: task.name,
              reason: task.reason,
              deterministic: true,
            });
            report({
              phase: "tool",
              label: "Thinking",
              detail: detailForTool(task.name),
              toolName: task.name,
            });
            const started = Date.now();
            const result = await executeAuthorizedTool({
              name: task.name,
              arguments: task.arguments,
            });
            if (signal.aborted) {
              emitToolExecution({
                type: "tool_end",
                name: result.name,
                ok: false,
                durationMs: Date.now() - started,
              });
              throw new Error("cancelled");
            }
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
            return result;
          },
        })),
        concurrency: profile.budgets.concurrency,
        timeoutMs: profile.budgets.toolTimeoutMs,
        isSufficient: (completed) => {
          if (!profile.budgets.earlySynthesizeWhenSufficient) return false;
          const oks = completed.filter((c) => c.ok && c.value);
          if (!oks.length) return false;
          // Early exit once one successful web.search/read returns
          return oks.some((c) => {
            const r = c.value as AiToolCallResult;
            return (
              r.ok &&
              (r.name === "web.search" ||
                r.name === "web.read" ||
                r.name === "web.open" ||
                r.name.startsWith("browser.current."))
            );
          });
        },
      });

      for (const item of parallel) {
        if (!item.ok || !item.value) continue;
        const result = item.value;
        toolResults.push(result);
        retrievalAttempted =
          retrievalAttempted ||
          result.name === "web.search" ||
          result.name === "web.open" ||
          result.name === "web.read" ||
          result.name === "web.research" ||
          result.name.startsWith("browser.current.");
        const mapped = evidenceFromToolResult(result);
        appendEvidence(evidence, mapped.evidence);
        provenanceBatches.push(mapped.atoms);

        if (
          result.name.startsWith("browser.current.") &&
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
            citations: finalizeCitations(
              toolResults,
              mergeProvenanceAtoms(provenanceBatches),
            ),
          };
        }
        if (
          (result.name === "web.open" || result.name === "web.read") &&
          !result.ok &&
          requiresExternalEvidence(request.content)
        ) {
          await escalateWebOpenIfNeeded({
            result,
            userMessage: request.content,
            toolResults,
            evidence,
            atoms: provenanceBatches[provenanceBatches.length - 1] ?? [],
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
            citations: finalizeCitations(
              toolResults,
              mergeProvenanceAtoms(provenanceBatches),
            ),
          };
        }
        if (result.name === "web.open" || result.name === "web.read") {
          await escalateWebOpenIfNeeded({
            result,
            userMessage: request.content,
            toolResults,
            evidence,
            atoms: provenanceBatches[provenanceBatches.length - 1] ?? [],
            report,
          });
        }
      }

      // Recompile after pre-run: usually disallowed tools → synthesis-only.
      profile = compileTurnProfile({
        content: request.content,
        taskState,
        messages: request.messages,
        pendingStateText: formatTaskStateForPrompt(taskState),
        evidence,
        isDesktop:
          typeof navigator !== "undefined" &&
          /Mac|Win|Linux/i.test(navigator.platform || ""),
      });
      // Force synthesis path when we already retrieved for live-info.
      if (evidence.some((e) => e.ok && e.content.trim()) && requiresExternalEvidence(request.content)) {
        profile = {
          ...profile,
          toolMode: "disallowed",
          tools: [],
        };
      }
    }

    const atoms = () => mergeProvenanceAtoms(provenanceBatches);
    const allowedToolNames = new Set(profile.tools.map((t) => t.name));
    const maxRounds = profile.budgets.maxToolRounds;
    let lastGenerate: AiGenerateResult | null = null;

    for (let round = 0; round < maxRounds; round++) {
      if (round > 0) {
        report({
          phase: "follow_up",
          label: "Thinking",
          detail: "Using the result…",
        });
      }

      const { prompt, instructions } = await buildFmPrompt(
        request,
        evidence,
        profile,
      );
      emitToolExecution({ type: "model_generate_start", round });
      report({ phase: "generating", label: "Thinking", detail: "Generating…" });
      let fm: Awaited<ReturnType<typeof generateFmTurn>>;
      try {
        fm = await generateFmTurn({ prompt, instructions });
      } catch (err) {
        const detail =
          err instanceof Error
            ? err.message.slice(0, 200)
            : "On-device model failed.";
        console.error("[LOCAL_ORCH_FM_ERROR]", { round, message: detail });
        const cites = finalizeCitations(toolResults, atoms());
        const shape = inferAnswerShape(request.content);
        let synthesis = prepareSynthesisEvidence(
          request.content,
          evidence,
          "onDevice",
        );

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
            fm = await generateFmTurn({
              prompt,
              instructions: retryInstructions,
            });
          } catch (retryErr) {
            const fallback =
              narrowDeterministicFallback({
                question: request.content,
                evidence,
              }) ||
              deterministicAnswerFromEvidence({
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
        } else {
          const narrow = narrowDeterministicFallback({
            question: request.content,
            evidence,
          });
          if (narrow) {
            return {
              content: narrow,
              runtime: "apple-local",
              offline: false,
              condensationOccurred: false,
              aiChatId: request.aiChatId ?? null,
              toolResults: toolResults.length ? toolResults : undefined,
              citations: cites,
            };
          }
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
        const parsed = answerFromFmText(fm.text);
        const answer = safeContent(
          parsed.content,
          "I'm here — tell me what you'd like to do.",
        );
        const grounding = validateLocalGrounding({
          answer,
          userRequest: request.content,
          evidence,
          retrievalAttempted,
        });
        if (grounding.recommendedAction === "use_evidence_fallback") {
          const narrow = narrowDeterministicFallback({
            question: request.content,
            evidence,
          });
          if (narrow) {
            return {
              ...lastGenerate,
              content: narrow,
              toolResults: toolResults.length ? toolResults : undefined,
              citations: finalizeCitations(toolResults, atoms()),
            };
          }
        }
        if (!grounding.valid && grounding.recommendedAction === "fail_closed") {
          return {
            ...lastGenerate,
            content: failClosedMessage(grounding.issues),
            toolResults: toolResults.length ? toolResults : undefined,
            citations: finalizeCitations(toolResults, atoms()),
          };
        }
        return {
          ...lastGenerate,
          content: answer,
          toolResults: toolResults.length ? toolResults : undefined,
          citations: finalizeCitations(toolResults, atoms()),
          ...(parsed.blocks?.length ? { blocks: parsed.blocks } : {}),
        };
      }

      // Enforce profile allowlist + clarification gate
      const clarifyBlocked =
        (call.name === "ui.ask_clarification" || call.name === "ui.confirm") &&
        !profile.clarificationPolicy.clarificationRequired;
      const notAllowed =
        profile.toolMode === "disallowed" ||
        !allowedToolNames.has(call.name) ||
        clarifyBlocked;

      if (notAllowed) {
        // Model tried a tool outside this turn's profile — do not execute.
        if (hasUsableEvidenceSnippets(evidence)) {
          const narrow = narrowDeterministicFallback({
            question: request.content,
            evidence,
          });
          const parsed = answerFromFmText(fm.text);
          const content =
            safeContent(parsed.content, "") ||
            narrow ||
            "I found sources for that — try asking again for a clearer answer.";
          return {
            ...lastGenerate,
            content,
            toolResults: toolResults.length ? toolResults : undefined,
            citations: finalizeCitations(toolResults, atoms()),
            ...(parsed.blocks?.length ? { blocks: parsed.blocks } : {}),
          };
        }
        const cleaned = safeContent(fm.text, "");
        if (cleaned) {
          return {
            ...lastGenerate,
            content: cleaned,
            toolResults: toolResults.length ? toolResults : undefined,
            citations: finalizeCitations(toolResults, atoms()),
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
      const mapped = evidenceFromToolResult(result);
      appendEvidence(evidence, mapped.evidence);
      provenanceBatches.push(mapped.atoms);
      if (mapped.evidence.length) {
        emitToolExecution({
          type: "evidence_added",
          count: mapped.evidence.length,
          kinds: mapped.evidence.map((e) => e.kind),
        });
      }

      if (call.name === "web.open" || call.name === "web.read") {
        await escalateWebOpenIfNeeded({
          result,
          userMessage: request.content,
          toolResults,
          evidence,
          atoms: provenanceBatches[provenanceBatches.length - 1] ?? [],
          report,
        });
      }

      if (result.pauseForUser) {
        if (!profile.clarificationPolicy.clarificationRequired) {
          continue;
        }
        return {
          ...lastGenerate,
          content: safeContent(
            fm.text,
            "I need a few details — fill in the card above the message box.",
          ),
          toolResults,
          citations: finalizeCitations(toolResults, atoms()),
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
          citations: finalizeCitations(toolResults, atoms()),
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
              citations: finalizeCitations(toolResults, atoms()),
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
            citations: finalizeCitations(toolResults, atoms()),
          };
        }
      }

      // Recompile allowlist after model-chosen tools
      profile = compileTurnProfile({
        content: request.content,
        taskState,
        messages: request.messages,
        evidence,
      });
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
    if (grounding.recommendedAction === "use_evidence_fallback") {
      const narrow = narrowDeterministicFallback({
        question: request.content,
        evidence,
      });
      if (narrow) {
        return {
          ...(lastGenerate as AiGenerateResult),
          content: narrow,
          toolResults,
          citations: finalizeCitations(toolResults, atoms()),
        };
      }
    }
    if (!grounding.valid && grounding.recommendedAction === "fail_closed") {
      return {
        ...(lastGenerate as AiGenerateResult),
        content: failClosedMessage(grounding.issues),
        toolResults,
        citations: finalizeCitations(toolResults, atoms()),
      };
    }
    return {
      ...(lastGenerate as AiGenerateResult),
      content: fallback,
      toolResults,
      citations: finalizeCitations(toolResults, atoms()),
    };
  } finally {
    setTurnToolExecutionListener(null);
  }
}
