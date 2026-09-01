"use client";

/**
 * Unified client turn orchestrator for Apple Foundation Models.
 * Compiles a tiny TurnProfile per turn; FM synthesizes — runtime owns tools/retrieval.
 */

import {
  hasPriorConversationTurns,
  isIdentityQuestion,
} from "@/lib/ai/assistant-behavior";
import { applyHistoryTransform } from "@/lib/ai/turn-environment/history-transform.ts";
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
import {
  renderNarrowEvidenceFallback,
  tryDeterministicRender,
} from "@/lib/ai/orchestrator/deterministic-render.ts";
import {
  evaluatePccEscalation,
  tryPccGeneration,
} from "@/lib/ai/orchestrator/pcc-escalation.ts";
import { emitContentDelta } from "@/lib/ai/orchestrator/stream-content.ts";
import {
  invalidateFmSessionsOnTurnRelation,
  prewarmFmSession,
  resolveFmSession,
} from "@/lib/ai/runtime/native/fm-session.ts";
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
  normalizeAssistantProse,
} from "@/lib/ai/orchestrator/citations.ts";
import {
  buildSynthesisInstruction,
  deterministicAnswerFromEvidence,
  inferAnswerShape,
  looksLikeContextOverflow,
  shrinkEvidenceForRetry,
} from "../answer-shape/index.ts";
import { ensureCompleteAnswer } from "@/lib/ai/orchestrator/ensure-complete-answer";
import {
  evaluateResearchQuality,
  extractFactualComponents,
  type EvidenceSnippet,
} from "@/lib/ai/orchestrator/research-quality";
import { shouldEscalateToBrowser } from "@/lib/computer/tool-routing";
import {
  evaluateExaSynthesisQuality,
  type ExaRetrievalMode,
} from "@/lib/ai/web-research/index.ts";
import { runEvidenceGate } from "@/lib/ai/orchestrator/evidence-gate.ts";
import {
  executableNodes,
  ensureRetrievalNodes,
  ensureUrlFetchNodes,
  researchProgressItems,
  resetRetrievalForRetry,
  type TaskGraph,
} from "@/lib/ai/orchestrator/task-graph.ts";
import { validateTaskPlan } from "@/lib/ai/orchestrator/plan-validator.ts";
import {
  acceptedEvidence,
  hasAcceptedEvidence,
  resolveTurnTerminalState,
  shouldBlockSynthesisWithoutEvidence,
  type TurnTerminalState,
} from "@/lib/ai/orchestrator/retrieval-requirements.ts";
import { compileTurn, mergeAskExtractorIntoGraph } from "@/lib/ai/orchestrator/turn-compile.ts";
import { extractAsksWithFm } from "@/lib/ai/orchestrator/ask-extractor.ts";
import { runTaskGraphExecution } from "@/lib/ai/orchestrator/task-executor.ts";
import {
  evaluateCoverage,
  shouldBlockSynthesis,
} from "@/lib/ai/orchestrator/coverage-ledger.ts";
import {
  rankAndCapCitations,
  rankProvenanceAtoms,
} from "@/lib/ai/orchestrator/evidence-verification.ts";
import { filterTaskFactsForTurn } from "@/lib/ai/orchestrator/evidence-hygiene.ts";
import {
  categoryForFmRound,
  ModelScheduler,
} from "@/lib/ai/orchestrator/model-scheduler.ts";
import {
  createWriteOperation,
  isWriteTool,
} from "@/lib/ai/orchestrator/write-safety.ts";
import {
  getRetrievalTrace,
  logRetrievalTrace,
  patchRetrievalTrace,
  recordEscalation,
  recordFmInput,
  recordSearchTrace,
  recordValidationIssues,
  setFinalSource,
  type FinalAnswerSource,
} from "@/lib/ai/orchestrator/retrieval-trace.ts";
import {
  finalizeTurnAudit,
  logTurnAudit,
  markStageEnd,
  markStageStart,
  recordAuditCoverage,
  recordAuditEvidence,
  recordAuditModelCall,
  recordAuditToolCall,
  recordTurnCompile,
  recordTurnRelation,
  resetTurnAudit,
} from "@/lib/ai/orchestrator/turn-audit.ts";
import {
  finalizeTurnTrace,
  getTurnTraceRecorder,
  startTurnTrace,
} from "@/lib/ai/orchestrator/turn-trace/index.ts";
import {
  citationsFromAtoms,
  compileTurnProfile,
  formatTurnProfileInstructions,
  getConversationTurnState,
  mergeProvenanceAtoms,
  normalizeWebPageResult,
  normalizeWebSearchResult,
  parseSemanticResponse,
  resolveTurnTask,
  webSearchArguments,
  applyConversationDelta,
  activeEntities,
  classifyTurnRelation,
  resolveConversationDelta,
  semanticBlocksInstruction,
  semanticBlocksToChatBlocks,
  semanticBlocksToMarkdown,
  setConversationTurnState,
  toDynamicProfilePayload,
  type ProvenanceAtom,
  type ResearchCompletionResult,
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
    case "web.research":
    case "workspace.search":
    case "knowledge.search":
      return "Searching";
    case "web.open":
    case "web.read":
    case "computer.browser.open":
    case "computer.browser.observe":
    case "browser.current.get_context":
    case "browser.current.get_selection":
    case "browser.current.capture_viewport":
      return "Reading";
    case "computer.browser.click":
    case "computer.browser.fill":
      return "Updating";
    case "browser.current.get_metadata":
    case "ui.ask_clarification":
      return "Checking";
    case "project.create":
    case "project.open":
    case "nav.open":
      return "Building";
    default:
      return "Updating";
  }
}

function safeContent(
  text: string,
  fallback: string,
  citationSources?: Array<{ id: string; title: string; url?: string | null }>,
): string {
  const cleaned = citationSources?.length
    ? normalizeAssistantProse(text || "", citationSources).trim()
    : sanitizeAssistantVisibleText(text || "").trim();
  return cleaned || fallback;
}

/** Narrow deterministic fallback — strong structured evidence only, not a second answer engine. */
function narrowDeterministicFallback(opts: {
  question: string;
  evidence: TurnEvidence[];
}): string | null {
  return renderNarrowEvidenceFallback(opts.question, opts.evidence);
}

function evidenceAsSnippets(items: TurnEvidence[]): EvidenceSnippet[] {
  return items
    .filter((e) => e.ok && e.content.trim())
    .map((e) => ({
      id: e.id,
      title: e.title,
      url: e.url,
      content: e.content,
      kind: e.kind,
    }));
}

async function escalateExaSearchIfNeeded(opts: {
  question: string;
  conversationState: ReturnType<typeof applyConversationDelta>;
  turnRelation?: import("@/lib/ai/turn-environment/turn-relation.ts").TurnRelation;
  toolResults: AiToolCallResult[];
  evidence: TurnEvidence[];
  provenanceBatches: ProvenanceAtom[][];
  report: (progress: AgentTurnProgress) => void;
}): Promise<void> {
  const MAX_ESCALATIONS = 4;

  for (let attempt = 0; attempt < MAX_ESCALATIONS; attempt++) {
    const searches = opts.toolResults.filter(
      (r) => r.name === "web.search" && r.ok,
    );
    if (!searches.length) return;

    const last = searches[searches.length - 1]!;
    const data = (last.data ?? {}) as Record<string, unknown>;
    const synthesis = data.synthesis as
      | {
          directAnswer?: string;
          grounding?: Array<{ confidence?: string }>;
          groundingConfidence?: string;
          retrievalMode?: string | null;
          query?: string;
        }
      | undefined;
    const directAnswer = String(
      data.directAnswer ?? synthesis?.directAnswer ?? "",
    ).trim();

    const turnTask = resolveTurnTask({
      content: opts.question,
      previous: opts.conversationState,
      turnRelation: opts.turnRelation,
    });
    const hints =
      (data.retrievalHints as Record<string, unknown> | undefined) ??
      ({
        subject: turnTask.subject,
        operation: turnTask.operation,
        requestedFields: turnTask.requestedFields,
        requestedItemCount: turnTask.requestedItemCount,
        freshness: turnTask.freshness,
        depth: turnTask.depth,
        presentation: turnTask.presentation,
      } as import("@/lib/ai/web-research/index.ts").TurnRetrievalHints);
    const retrievalMode = (data.retrievalMode ??
      synthesis?.retrievalMode ??
      "fast") as ExaRetrievalMode;

    recordSearchTrace({
      mode: retrievalMode,
      outputSchemaType:
        data.outputSchemaType === "object" ? "object" : directAnswer ? "text" : "none",
      numResults: Array.isArray(data.results)
        ? (data.results as unknown[]).length
        : undefined,
      directOutputPresent: Boolean(directAnswer),
      groundingCount: Array.isArray(data.grounding)
        ? (data.grounding as unknown[]).length
        : (synthesis?.grounding?.length ?? 0),
      escalatedFrom: getRetrievalTrace().escalatedFrom ?? null,
    });

    if (!directAnswer && !synthesis) return;

    const quality = evaluateExaSynthesisQuality({
      bundle: {
        provider: "exa",
        retrievalMode,
        query: String(data.query ?? opts.question),
        directAnswer,
        grounding: Array.isArray(data.grounding)
          ? (data.grounding as Array<{
              field?: string;
              citations?: Array<{ url?: string; title?: string }>;
              confidence?: string;
            }>)
          : (synthesis?.grounding ?? []),
        groundingConfidence:
          (data.groundingConfidence as
            | "low"
            | "medium"
            | "high"
            | "none") ??
          (synthesis?.groundingConfidence as
            | "low"
            | "medium"
            | "high"
            | "none") ??
          "none",
        supportingResults: [],
        outputSchemaType: "text",
      },
      question: opts.question,
      hints,
    });

    if (quality.sufficient || !quality.escalateTo) return;

    const query = String(data.query ?? opts.question);
    opts.report({
      phase: "tool",
      label: "Thinking",
      detail: "Searching",
      toolName: "web.search",
    });
    const result = await executeAuthorizedTool({
      name: "web.search",
      arguments: webSearchArguments({
        content: opts.question,
        turnTask,
        conv: opts.conversationState,
        query,
        escalate: quality.escalateTo,
      }),
    });
    opts.toolResults.push(result);
    const mapped = evidenceFromToolResult(result);
    appendEvidence(opts.evidence, mapped.evidence);
    opts.provenanceBatches.push(mapped.atoms);

    recordEscalation(retrievalMode, quality.escalateTo);
    console.log("[EXA_ESCALATION]", {
      from: retrievalMode,
      to: quality.escalateTo,
      issues: quality.issues,
      ok: result.ok,
      attempt: attempt + 1,
    });
  }
}

function fmFinalSource(evidence: TurnEvidence[]): FinalAnswerSource {
  return evidence.some((e) => e.ok && e.kind === "exa_synthesis")
    ? "fm_verbalized"
    : "fm_synthesis";
}

function finalizeTurnResult<T extends AiGenerateResult>(
  result: T,
  source: FinalAnswerSource,
  terminalState?: TurnTerminalState,
): T {
  markStageEnd("model_synthesis");
  setFinalSource(source);
  finalizeTurnAudit({
    finalSource: source,
    answerChars: result.content?.length,
    terminalState,
  });
  const trace = getTurnTraceRecorder();
  trace?.recordFinalResponse({
    content: result.content ?? "",
    citations: result.citations?.map((c) => ({
      id: c.id,
      url: c.url,
      title: c.title,
    })),
    finalSource: source,
  });
  finalizeTurnTrace();
  logTurnAudit({ traceId: trace?.traceId });
  logRetrievalTrace({ traceId: trace?.traceId });
  return result;
}

async function finalizeTurnWithStream<T extends AiGenerateResult>(
  result: T,
  source: FinalAnswerSource,
  report: (progress: AgentTurnProgress) => void,
  stream = true,
): Promise<T & { presentationStreamed?: boolean }> {
  if (stream && result.content?.trim()) {
    emitContentDelta(report, result.content, true);
    return {
      ...finalizeTurnResult(result, source),
      presentationStreamed: true,
    };
  }
  return finalizeTurnResult(result, source);
}

function reportResearchProgress(
  report: (progress: AgentTurnProgress) => void,
  graph: TaskGraph,
  detail?: string,
): void {
  const items = researchProgressItems(graph);
  if (items.length < 2) return;
  report({
    phase: "tool",
    label: "Thinking",
    detail: detail ?? items.find((i) => i.status === "active")?.label ?? "Searching",
    toolName: "web.search",
    researchTasks: items,
  });
}

function applyEvidenceHygiene(opts: {
  evidence: TurnEvidence[];
  question: string;
  conversationState: ReturnType<typeof applyConversationDelta>;
  turnRelation?: import("@/lib/ai/turn-environment/turn-relation.ts").TurnRelation;
  requireQuality?: boolean;
}): ReturnType<typeof runEvidenceGate> {
  markStageStart("evidence_gate");
  const turnTask = resolveTurnTask({
    content: opts.question,
    previous: opts.conversationState,
    turnRelation: opts.turnRelation,
  });
  const gate = runEvidenceGate({
    evidence: opts.evidence,
    question: opts.question,
    turnTask,
    conversationState: opts.conversationState,
    turnRelation: opts.turnRelation,
    deeper: true,
    requireQuality: opts.requireQuality,
  });
  for (const rec of gate.records) {
    recordAuditEvidence({
      id: rec.id,
      action:
        rec.action === "inject"
          ? "accepted"
          : rec.action === "quarantine"
            ? "quarantined"
            : "rejected",
      reason: rec.reason,
      kind: rec.kind,
      subtaskId: rec.subtaskId,
    });
    const trace = getTurnTraceRecorder();
    if (rec.action === "inject") {
      trace?.recordEvidenceAccept({
        taskId: rec.subtaskId,
        evidence: {
          id: rec.id,
          title: rec.kind ?? rec.id,
          content: rec.reason ?? "",
          ...(rec.kind ? { kind: rec.kind as TurnEvidence["kind"] } : {}),
        },
        reason: rec.reason,
      });
    } else {
      trace?.recordEvidenceReject({
        taskId: rec.subtaskId,
        evidenceId: rec.id,
        reason: rec.reason ?? rec.action,
        kind: rec.kind,
      });
    }
  }
  if (gate.rejectCount > 0) {
    patchRetrievalTrace({ staleEvidenceDropped: gate.rejectCount });
  }
  if (gate.quarantineCount > 0) {
    recordValidationIssues([`${gate.quarantineCount} quarantined`]);
  }
  markStageEnd("evidence_gate");
  return gate;
}

function evidenceFromToolResult(
  result: AiToolCallResult,
  subtaskId?: string,
): { evidence: TurnEvidence[]; atoms: ProvenanceAtom[] } {
  const tag = (items: TurnEvidence[]): TurnEvidence[] =>
    items.map((e) => ({
      ...e,
      id: subtaskId ? `st_${subtaskId}_${e.id}` : e.id,
      subtaskId,
    }));
  if (result.name === "web.search" || result.name === "web.research") {
    const data = (result.data ?? {}) as Record<string, unknown>;
    const rows =
      (data.results as Array<{
        title: string;
        url: string;
        description?: string;
        snippet?: string;
        id?: string;
      }>) ?? [];
    const cites = Array.isArray(data.citations)
      ? (data.citations as Array<{
          id?: string;
          title?: string;
          url?: string;
          excerpt?: string;
          description?: string;
        }>)
      : [];
    const synthesis = data.synthesis as
      | {
          directAnswer?: string;
          structuredAnswer?: Record<string, unknown> | null;
          grounding?: Array<{
            field?: string;
            citations?: Array<{ url?: string; title?: string }>;
            confidence?: string;
          }>;
          groundingConfidence?: "low" | "medium" | "high" | "none";
          retrievalMode?: string | null;
        }
      | undefined;
    const normalized = normalizeWebSearchResult({
      toolName: result.name,
      ok: result.ok,
      directAnswer:
        String(data.directAnswer ?? synthesis?.directAnswer ?? "").trim() ||
        undefined,
      structuredAnswer:
        (data.structuredAnswer as Record<string, unknown> | null) ??
        synthesis?.structuredAnswer ??
        null,
      grounding:
        (Array.isArray(data.grounding)
          ? data.grounding
          : synthesis?.grounding) ?? [],
      groundingConfidence:
        (data.groundingConfidence as
          | "low"
          | "medium"
          | "high"
          | "none"
          | undefined) ?? synthesis?.groundingConfidence,
      retrievalMode:
        (data.retrievalMode as string | null) ?? synthesis?.retrievalMode ?? null,
      results: rows,
      citations: cites,
    });
    return {
      evidence: tag(normalized.evidence),
      atoms: normalized.atoms,
    };
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
  const ranked = rankProvenanceAtoms(atoms);
  const fromAtoms = rankAndCapCitations(citationsFromAtoms(ranked));
  if (fromAtoms.length) return fromAtoms;
  return rankAndCapCitations(collectCitationsFromToolResults(toolResults));
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
  researchCompletion?: ResearchCompletionResult | null,
): Promise<{ prompt: string; instructions: string; profile: TurnProfile }> {
  const [identity] = await Promise.all([
    ensureOnDeviceIdentity(),
    refreshOnDeviceInventoryCache(request.workspaceId),
  ]);
  const taskState = getThreadTaskState(request.threadId);
  const conv = getConversationTurnState(request.threadId);
  const turnRelation = profile.turnRelation ?? conv?.lastTurnRelation;
  const turnTask = resolveTurnTask({
    content: request.content,
    previous: conv,
    turnRelation,
  });
  const filteredTaskState = taskState
    ? {
        ...taskState,
        facts: filterTaskFactsForTurn(taskState, {
          turnTask,
          conversationState: conv,
          turnRelation,
        }),
      }
    : null;
  const taskActive =
    Boolean(filteredTaskState) &&
    filteredTaskState!.status !== "idle" &&
    filteredTaskState!.status !== "completed";
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
  const taskBlock = formatTaskStateForPrompt(filteredTaskState);
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
    {
      researchPlan: profile.researchPlan,
      researchCompletion,
    },
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
      userMessage: request.content,
    }),
    pkg.taskStateText,
    toolBlock,
    activeBrowserMeta,
    evidenceBlock,
    profile.outputSchema === "semantic_blocks_v1"
      ? semanticBlocksInstruction()
      : "",
    extraInstruction,
    requiresExternalEvidence(request.content) && evidence.some((e) => e.kind === "exa_synthesis")
      ? "Exa already resolved the factual answer in GROUNDED RETRIEVAL ANSWER. Your job is intent, phrasing, and presentation only — do not change dates, names, numbers, or other facts. Do not cite sources inline; Sources appear separately."
      : requiresExternalEvidence(request.content) && evidence.length
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

  const activeLabels = conv
    ? activeEntities(conv).map((e) => e.label)
    : [];
  const prompt = applyHistoryTransform({
    messages: (pkg.messages.length ? pkg.messages : request.messages) as
      | Array<{ role: string; content: string }>
      | undefined,
    latestUserContent: request.content,
    turnRelation,
    activeLabels,
    reactivateLabel: undefined,
  });
  recordFmInput(prompt.length + instructions.length);
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
    if (event.type === "tool_start") {
      recordAuditToolCall({
        name: event.name,
        reason: event.reason,
        deterministic: event.deterministic,
        round: event.round,
        subtaskId: event.reason?.startsWith("subtask:")
          ? event.reason.slice("subtask:".length)
          : undefined,
      });
    } else if (event.type === "tool_end") {
      recordAuditToolCall({
        name: event.name,
        ok: event.ok,
        durationMs: event.durationMs,
        round: event.round,
      });
    } else if (event.type === "model_generate_start") {
      recordAuditModelCall({
        stage: event.round < 0 ? "plan" : event.round === 0 ? "synthesis" : "tool_round",
        round: event.round,
      });
    } else if (event.type === "model_generate_end") {
      recordAuditModelCall({
        stage: event.round < 0 ? "plan" : event.round === 0 ? "synthesis" : "tool_round",
        round: event.round,
        structured: event.structured,
      });
    }
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

  let evidence: TurnEvidence[] = [];
  let toolResults: AiToolCallResult[] = [];
  let provenanceBatches: ProvenanceAtom[][] = [];
  let retrievalAttempted = false;

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
    const priorConv = getConversationTurnState(request.threadId);
    resetTurnAudit({
      threadId: request.threadId ?? undefined,
      userMessage: request.content,
    });
    startTurnTrace({
      threadId: request.threadId ?? undefined,
      aiChatId: request.aiChatId ?? undefined,
      userInput: request.content,
    });
    ModelScheduler.start();

    const preRelation = classifyTurnRelation({
      userMessage: request.content,
      previous: priorConv,
    });

    const { resolveBuildTurnContext, shouldRunBuildLocally } = await import(
      "@/lib/ai/build/turn-context"
    );
    const buildCtx = resolveBuildTurnContext({
      content: request.content,
      activeSpace: request.projectSpace,
      explicitProjectId: request.projectId,
      threadProjectId: request.projectId,
      conversationState: priorConv,
    });

    const { resolveHealthCapabilities } = await import(
      "@/lib/ai/health/capabilities"
    );
    let healthEnabled = false;
    let platformSupportsHealthKit = false;
    try {
      const { getNativeCapabilities, isHealthKitFlagEnabled } = await import(
        "@/lib/native"
      );
      if (isHealthKitFlagEnabled()) {
        const native = getNativeCapabilities();
        platformSupportsHealthKit = native.device.healthKit.available;
        healthEnabled = Boolean(native.health?.isLocallyEnabled());
      }
    } catch {
      // SSR / missing localStorage — treat as off
    }
    const healthCaps = resolveHealthCapabilities({
      content: request.content,
      healthEnabled,
      platformSupportsHealthKit,
    });

    if (
      buildCtx.requiresBuildCapabilities &&
      shouldRunBuildLocally(buildCtx) &&
      buildCtx.complexity === "routine"
    ) {
      const { runRoutineBuildMutation } = await import(
        "@/lib/ai/build/routine-mutation"
      );
      const mutation = await runRoutineBuildMutation({
        content: request.content,
        ctx: buildCtx,
      });
      if (mutation.content) {
        return {
          content: mutation.content,
          runtime: "apple-local",
          offline: false,
          condensationOccurred: false,
          aiChatId: request.aiChatId ?? null,
          toolResults: [],
          citations: [],
        };
      }
    }

    markStageStart("compile");
    const compiled = await compileTurn({
      content: request.content,
      threadId: request.threadId,
      priorConv,
      profileOpts: {
        taskState,
        messages: request.messages,
        pendingStateText:
          preRelation.relation === "topic_switch"
            ? ""
            : formatTaskStateForPrompt(
                taskState
                  ? {
                      ...taskState,
                      facts: filterTaskFactsForTurn(taskState, {
                        turnTask: resolveTurnTask({
                          content: request.content,
                          previous: priorConv,
                          turnRelation: preRelation.relation,
                        }),
                        conversationState: priorConv,
                        turnRelation: preRelation.relation,
                      }),
                    }
                  : null,
              ),
        isDesktop:
          typeof navigator !== "undefined" &&
          /Mac|Win|Linux/i.test(navigator.platform || ""),
        ...(buildCtx.requiresBuildCapabilities
          ? {
              build: {
                requiresBuildCapabilities: true,
                buildSpecSlice: buildCtx.buildSpecSlice,
                forceDomains: buildCtx.forceDomains,
                readOnlyPreRun: true,
                needsClarification: buildCtx.projectResolve.status === "clarify",
                clarificationReason: buildCtx.projectResolve.reason,
              },
            }
          : {}),
        ...(healthCaps.requiresHealthCapabilities
          ? {
              health: {
                requiresHealthCapabilities: true,
                forceDomains: ["health"],
              },
            }
          : {}),
      },
    });

    let conversationState = compiled.conversationState;
    const relationResult = compiled.turnRelation;
    setConversationTurnState(request.threadId, conversationState);
    recordTurnRelation(relationResult.relation);

    let profile = compiled.profile;
    let taskGraph = compiled.graph;
    const requestLedger = compiled.ledger;
    let planValidation = compiled.planValidation;
    const retrievalRequired = compiled.retrievalRequired;

    if (conversationState.dissatisfactionSignal) {
      taskGraph = resetRetrievalForRetry(taskGraph);
    }

    recordTurnCompile({
      intent: compiled.turnTask.intent,
      relation: relationResult.relation,
      webPlan: profile.webRetrievalPlan,
      researchPlan: profile.researchPlan,
    });

    const traceRecorder = getTurnTraceRecorder();
    traceRecorder?.recordTemporalGrounding(compiled.temporalGrounding);
    traceRecorder?.recordRequestLedger(requestLedger);
    traceRecorder?.recordTaskGraph({
      nodes: taskGraph.nodes,
      constraints: taskGraph.constraints,
      objective: taskGraph.objective,
      maxRetrievalRounds: taskGraph.maxRetrievalRounds,
    });

    if (planValidation.issues.length) {
      recordValidationIssues(planValidation.issues);
    }

    if (planValidation.health === "invalid") {
      const urlRepair = ensureUrlFetchNodes({
        graph: taskGraph,
        ledger: requestLedger,
      });
      if (urlRepair.repaired) {
        taskGraph = urlRepair.graph;
        planValidation = validateTaskPlan({
          ledger: requestLedger,
          graph: taskGraph,
          researchPlan: profile.researchPlan,
          retrievalRequired,
        });
      }
    }

    if (planValidation.health === "invalid") {
      markStageEnd("compile");
      return finalizeTurnResult(
        {
          content:
            "I couldn't prepare that request right now. Please try again in a moment.",
          runtime: "apple-local",
          offline: false,
          condensationOccurred: false,
          aiChatId: request.aiChatId ?? null,
        },
        "research_incomplete",
        "FAILED",
      );
    }

    if (planValidation.needsAskExtractor) {
      const specs = await extractAsksWithFm({
        content: request.content,
        ledger: requestLedger,
        generate: async (prompt, instructions) => {
          ModelScheduler.current()?.record("planning");
          const fm = await generateFmTurn({ prompt, instructions });
          return fm.text;
        },
      });
      taskGraph = mergeAskExtractorIntoGraph(
        taskGraph,
        requestLedger,
        specs,
        profile.researchPlan,
      );
      const repair = ensureRetrievalNodes({
        graph: taskGraph,
        ledger: requestLedger,
        turnTask: compiled.turnTask,
        researchPlan: profile.researchPlan,
        retrievalRequired,
      });
      taskGraph = repair.graph;
      planValidation = validateTaskPlan({
        ledger: requestLedger,
        graph: taskGraph,
        researchPlan: profile.researchPlan,
        retrievalRequired,
      });
      if (planValidation.issues.length) {
        recordValidationIssues(planValidation.issues);
      }
    }

    markStageEnd("compile");

    if (request.threadId) {
      invalidateFmSessionsOnTurnRelation(
        request.threadId,
        relationResult.relation,
      );
      void prewarmFmSession({
        threadId: request.threadId,
        profile: "synthesis",
        instructions: formatTurnProfileInstructions(profile),
        dynamicPayload: toDynamicProfilePayload(profile),
      });
    }

    evidence = [];
    toolResults = [];
    provenanceBatches = [];
    retrievalAttempted = false;
    let researchCompletion: ResearchCompletionResult | null = null;

    if (retrievalRequired && executableNodes(taskGraph).length === 0) {
      const repair = ensureRetrievalNodes({
        graph: taskGraph,
        ledger: requestLedger,
        turnTask: compiled.turnTask,
        researchPlan: profile.researchPlan,
        retrievalRequired: true,
      });
      taskGraph = repair.graph;
    }

    const graphTasks = executableNodes(taskGraph);
    if (profile.preRunTasks.length || graphTasks.length) {
      markStageStart("pre_run");
      reportResearchProgress(report, taskGraph);
      emitToolExecution({ type: "model_generate_start", round: -1 });

      const execResult = await runTaskGraphExecution({
        graph: taskGraph,
        ctx: {
          content: request.content,
          turnTask: compiled.turnTask,
          conversationState,
          webRetrievalPlan: profile.webRetrievalPlan,
          researchPlan: profile.researchPlan,
          temporalGrounding: compiled.temporalGrounding,
          constraints: taskGraph.constraints,
          executeTool: ({ name, arguments: args }) =>
            executeAuthorizedTool({ name, arguments: args }),
          mapToolResult: evidenceFromToolResult,
          report,
          onGraphChange: (g) => {
            taskGraph = g;
            reportResearchProgress(report, taskGraph);
          },
          detailForTool,
          emitToolStart: (name, reason) =>
            emitToolExecution({
              type: "tool_start",
              name,
              reason,
              deterministic: true,
            }),
          emitToolEnd: (name, ok, durationMs) =>
            emitToolExecution({ type: "tool_end", name, ok, durationMs }),
        },
        evidence,
        toolResults,
        provenanceBatches,
        preGraphTasks: profile.preRunTasks,
      });

      taskGraph = execResult.graph;
      researchCompletion = execResult.researchCompletion;
      retrievalAttempted =
        graphTasks.length > 0 ||
        profile.preRunTasks.some((t) => t.name.startsWith("web."));

      for (const result of toolResults) {
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

      await escalateExaSearchIfNeeded({
        question: request.content,
        conversationState,
        turnRelation: relationResult.relation,
        toolResults,
        evidence,
        provenanceBatches,
        report,
      });

      applyEvidenceHygiene({
        evidence,
        question: request.content,
        conversationState,
        turnRelation: relationResult.relation,
      });

      const autonomousTask = toolResults.find(
        (r) => r.name === "create_work_task" && r.ok,
      );
      if (autonomousTask) {
        patchRetrievalTrace({ provider: "none", mode: "agent" });
        return finalizeTurnResult(
          {
            content: safeContent(
              autonomousTask.output,
              "Started a research task.",
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
          },
          "work_task",
        );
      }

      const coverage = evaluateCoverage(taskGraph);
      recordAuditCoverage({
        complete: coverage.readyForSynthesis,
        unresolved: coverage.unresolvedAsks.map((a) => a.id),
        calculatedTotal: researchCompletion?.calculatedTotal,
      });
      getTurnTraceRecorder()?.recordCoverage(coverage);

      if (shouldBlockSynthesis(coverage, {
        retrievalRequired,
        evidenceCount: acceptedEvidence(evidence).length,
      })) {
        getTurnTraceRecorder()?.recordFallback({
          decision: "block_synthesis",
          reason: "MISSING_RETRIEVAL",
          failureType: "fail_closed",
        });
        return finalizeTurnResult(
          {
            content: failClosedMessage(["MISSING_RETRIEVAL"]),
            runtime: "apple-local",
            offline: false,
            condensationOccurred: false,
            aiChatId: request.aiChatId ?? null,
            toolResults: toolResults.length ? toolResults : undefined,
            citations: finalizeCitations(
              toolResults,
              mergeProvenanceAtoms(provenanceBatches),
            ),
          },
          "research_incomplete",
          "UNRESOLVED",
        );
      }

      if (!coverage.readyForSynthesis && coverage.unresolvedAsks.length) {
        const missing = coverage.unresolvedAsks.map((a) => a.label).join("; ");
        return finalizeTurnResult(
          {
            content: safeContent(
              "",
              missing.length
                ? `I found partial information but couldn't verify everything needed for a reliable answer (still missing: ${missing}). Try asking about one item at a time.`
                : "I found partial information but couldn't verify everything needed for a reliable answer. Try asking about one item at a time.",
            ),
            runtime: "apple-local",
            offline: false,
            condensationOccurred: false,
            aiChatId: request.aiChatId ?? null,
            toolResults: toolResults.length ? toolResults : undefined,
            citations: finalizeCitations(
              toolResults,
              mergeProvenanceAtoms(provenanceBatches),
            ),
          },
          "research_incomplete",
        );
      }

      applyEvidenceHygiene({
        evidence,
        question: request.content,
        conversationState,
        turnRelation: relationResult.relation,
      });

      const deterministic = tryDeterministicRender({
        question: request.content,
        evidence,
        researchPlan: profile.researchPlan,
        researchCompletion,
      });
      if (deterministic) {
        const detSource =
          profile.researchPlan &&
          researchCompletion?.complete &&
          profile.researchPlan.subtasks.length >= 2
            ? "deterministic_render"
            : evidence.some((e) => e.ok && e.kind === "exa_synthesis")
              ? "exa_search_output"
              : "deterministic_render";
        return finalizeTurnWithStream(
          {
            content: deterministic,
            runtime: "apple-local",
            offline: false,
            condensationOccurred: false,
            aiChatId: request.aiChatId ?? null,
            toolResults: toolResults.length ? toolResults : undefined,
            citations: finalizeCitations(
              toolResults,
              mergeProvenanceAtoms(provenanceBatches),
            ),
          },
          detSource,
          report,
        );
      }

      profile = compileTurnProfile({
        content: request.content,
        taskState,
        messages: request.messages,
        pendingStateText:
          relationResult.relation === "topic_switch"
            ? ""
            : formatTaskStateForPrompt(
                taskState
                  ? {
                      ...taskState,
                      facts: filterTaskFactsForTurn(taskState, {
                        turnTask: resolveTurnTask({
                          content: request.content,
                          previous: conversationState,
                          turnRelation: relationResult.relation,
                        }),
                        conversationState,
                        turnRelation: relationResult.relation,
                      }),
                    }
                  : null,
              ),
        evidence,
        conversationState,
        turnRelation: relationResult.relation,
        reactivateEntityLabel: relationResult.reactivateEntityLabel,
        isDesktop:
          typeof navigator !== "undefined" &&
          /Mac|Win|Linux/i.test(navigator.platform || ""),
      });
      const gate = evaluateResearchQuality({
        question: request.content,
        evidence: evidenceAsSnippets(evidence),
        deeper: true,
      });
      if (
        evidence.some((e) => e.ok && e.content.trim()) &&
        requiresExternalEvidence(request.content) &&
        (gate.evidenceSufficient || !gate.needsMoreInvestigation)
      ) {
        profile = {
          ...profile,
          preRunTasks: [],
          toolMode: "disallowed",
          tools: [],
        };
      }
      markStageEnd("pre_run");
    }

    if (
      shouldBlockSynthesisWithoutEvidence({
        retrievalRequired,
        evidence,
        retrievalAttempted,
      })
    ) {
      getTurnTraceRecorder()?.recordFallback({
        decision: "block_synthesis_no_evidence",
        reason: "UNGROUNDED_CURRENT_FACT",
        failureType: "fail_closed",
      });
      return finalizeTurnResult(
        {
          content: failClosedMessage(["UNGROUNDED_CURRENT_FACT"]),
          runtime: "apple-local",
          offline: false,
          condensationOccurred: false,
          aiChatId: request.aiChatId ?? null,
          toolResults: toolResults.length ? toolResults : undefined,
          citations: finalizeCitations(toolResults, mergeProvenanceAtoms(provenanceBatches)),
        },
        "research_incomplete",
        "UNRESOLVED",
      );
    }

    const atoms = () => mergeProvenanceAtoms(provenanceBatches);
    const allowedToolNames = new Set(profile.tools.map((t) => t.name));
    const maxRounds = profile.budgets.maxToolRounds;
    let lastGenerate: AiGenerateResult | null = null;

    markStageStart("model_synthesis");
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
        undefined,
        researchCompletion,
      );
      getTurnTraceRecorder()?.recordModelPrompt({
        round,
        prompt,
        instructions,
        evidencePacket: prepareSynthesisEvidence(
          request.content,
          evidence,
          "onDevice",
        ),
      });
      emitToolExecution({ type: "model_generate_start", round });
      report({ phase: "generating", label: "Thinking", detail: "Generating" });
      const fmCategory = categoryForFmRound(round);
      const scheduler = ModelScheduler.current();
      if (scheduler && !scheduler.canCall(fmCategory)) {
        const pccDecision = evaluatePccEscalation({
          question: request.content,
          modelBudgetExhausted: true,
          multiSubtaskResearch: Boolean(
            profile.researchPlan && profile.researchPlan.subtasks.length >= 2,
          ),
          evidenceTokenEstimate: prompt.length + instructions.length,
        });
        if (pccDecision) {
          const pcc = await tryPccGeneration({
            prompt,
            instructions,
            decision: pccDecision,
          });
          if (pcc?.content) {
            emitContentDelta(report, pcc.content, true);
            return finalizeTurnResult(
              {
                content: pcc.content,
                runtime: "apple-local",
                offline: false,
                condensationOccurred: false,
                aiChatId: request.aiChatId ?? null,
                toolResults: toolResults.length ? toolResults : undefined,
                citations: finalizeCitations(toolResults, atoms()),
                presentationStreamed: true,
              },
              "pcc_synthesis",
            );
          }
        }
        console.warn("[MODEL_SCHEDULER] budget exhausted", fmCategory);
        break;
      }
      scheduler?.record(fmCategory);
      recordAuditModelCall({
        stage:
          fmCategory === "planning"
            ? "plan"
            : fmCategory === "tool_round"
              ? "tool_round"
              : "synthesis",
        round,
      });
      const threadId = request.threadId ?? "anonymous";
      const fmSession = resolveFmSession({
        threadId,
        profile: round === 0 ? "synthesis" : "delta",
        instructions: instructions ?? "",
      });
      let fm: Awaited<ReturnType<typeof generateFmTurn>>;
      try {
        fm = await generateFmTurn({
          prompt,
          instructions,
          sessionId: fmSession.sessionId,
          preferStream: true,
          onDelta: (partial) => emitContentDelta(report, partial, false),
        });
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
              sessionId: fmSession.sessionId,
              preferStream: true,
              onDelta: (partial) => emitContentDelta(report, partial, false),
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
      getTurnTraceRecorder()?.recordModelOutput({
        round,
        text: fm.text,
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
          retrievalRequired,
          turnTask: compiled.turnTask,
          temporalGrounding: compiled.temporalGrounding,
          conversationState,
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
          return finalizeTurnResult(
            {
              ...lastGenerate!,
              content: failClosedMessage(grounding.issues),
              toolResults: toolResults.length ? toolResults : undefined,
              citations: finalizeCitations(toolResults, atoms()),
            },
            "research_incomplete",
            "UNRESOLVED",
          );
        }
        report({
          phase: "generating",
          label: "Thinking",
          detail: "Generating",
        });
        const completed = await ensureCompleteAnswer({
          question: request.content,
          draft: answer,
          generate: async (instruction) => {
            const repair = await generateFmTurn({
              prompt: request.content,
              instructions: instruction,
              sessionId: fmSession.sessionId,
              onDelta: (partial) => emitContentDelta(report, partial, false),
            });
            return repair.text;
          },
        });
        return {
          ...finalizeTurnResult(
            {
              ...lastGenerate,
              content: completed.content,
              toolResults: toolResults.length ? toolResults : undefined,
              citations: finalizeCitations(toolResults, atoms()),
              ...(parsed.blocks?.length ? { blocks: parsed.blocks } : {}),
            },
            fmFinalSource(evidence),
            resolveTurnTerminalState({
              retrievalRequired,
              evidence,
              retrievalAttempted,
              grounded: hasAcceptedEvidence(evidence),
            }),
          ),
          presentationStreamed: fm.streamed,
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
      if (isWriteTool(call.name)) {
        const writeOp = createWriteOperation(call.name);
        if (writeOp?.status === "blocked") {
          toolResults.push({
            name: call.name,
            ok: false,
            output:
              "This action requires explicit confirmation before I can proceed.",
          });
          continue;
        }
      }
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
        conversationState,
        turnRelation: relationResult.relation,
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
      retrievalRequired,
      turnTask: compiled.turnTask,
      temporalGrounding: compiled.temporalGrounding,
      conversationState,
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
      return finalizeTurnResult(
        {
          ...(lastGenerate as AiGenerateResult),
          content: failClosedMessage(grounding.issues),
          toolResults,
          citations: finalizeCitations(toolResults, atoms()),
        },
        "research_incomplete",
        "UNRESOLVED",
      );
    }
    return finalizeTurnResult(
      {
        ...(lastGenerate as AiGenerateResult),
        content: fallback,
        toolResults,
        citations: finalizeCitations(toolResults, atoms()),
      },
      fmFinalSource(evidence),
      resolveTurnTerminalState({
        retrievalRequired,
        evidence,
        retrievalAttempted,
        grounded: hasAcceptedEvidence(evidence),
      }),
    );
  } finally {
    setTurnToolExecutionListener(null);
    if (!getRetrievalTrace().finalSource) {
      const source = fmFinalSource(evidence);
      setFinalSource(source);
      finalizeTurnAudit({
        finalSource: source,
        terminalState: "FAILED",
      });
    }
    if (getTurnTraceRecorder()) {
      finalizeTurnTrace({ failureReason: "turn_exit_without_finalize" });
    }
    logTurnAudit({
      modelScheduler: ModelScheduler.current()?.snapshot(),
    });
    ModelScheduler.reset();
    logRetrievalTrace();
  }
}
