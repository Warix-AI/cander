/**
 * TurnTraceRecorder — structured JSON events for the full turn pipeline.
 */

import type { RequestLedger } from "../request-scanner.ts";
import type { TaskNode } from "../task-graph.ts";
import type { TemporalGrounding } from "../temporal-grounding.ts";
import type { CoverageResult } from "../coverage-ledger.ts";
import type { TurnEvidence } from "../evidence.ts";
import { isLocalTurnTracePersistEnabled } from "./persist.ts";
import { redactToolPayload, redactTraceValue } from "./redact.ts";
import { storeTurnTrace } from "./store.ts";
import type {
  RetrievalChainLink,
  TaskGraphSnapshot,
  TraceEvent,
  TraceFailureType,
  TraceStage,
  TurnTrace,
} from "./types.ts";
import { nodeTaskId } from "./types.ts";

let eventSeq = 0;

function nextEventId(): string {
  eventSeq += 1;
  return `evt_${eventSeq}_${Date.now().toString(36)}`;
}

function newTraceId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `trace_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function isTurnTraceEnabled(): boolean {
  if (typeof process !== "undefined") {
    const flag = process.env.NEXT_PUBLIC_TURN_TRACE;
    if (flag === "0" || flag === "false") return false;
    if (flag === "1" || flag === "true") return true;
    if (process.env.NODE_ENV === "development") return true;
  }
  if (typeof window !== "undefined") {
    try {
      const ls = window.localStorage?.getItem("cander:turn-trace");
      if (ls === "0") return false;
      if (ls === "1") return true;
    } catch {
      /* ignore */
    }
  }
  return true;
}

export function shouldRecordTurnTrace(): boolean {
  return isTurnTraceEnabled() || isLocalTurnTracePersistEnabled();
}

export class TurnTraceRecorder {
  readonly traceId: string;
  readonly startedAt: number;
  private readonly trace: TurnTrace;
  private stageStarts = new Map<string, number>();

  constructor(opts: {
    traceId?: string;
    threadId?: string;
    aiChatId?: string;
    userInput: string;
  }) {
    this.traceId = opts.traceId ?? newTraceId();
    this.startedAt = Date.now();
    this.trace = {
      traceId: this.traceId,
      runtime: "local",
      threadId: opts.threadId,
      aiChatId: opts.aiChatId,
      startedAt: this.startedAt,
      userInput: opts.userInput,
      events: [],
      retrievalChain: [],
    };
    this.record("user_input", {
      decision: "turn_started",
      output: { content: opts.userInput },
    });
    this.appendChain({
      step: "user_ask",
      at: this.startedAt,
      summary: opts.userInput.slice(0, 160),
      payload: opts.userInput,
    });
  }

  get snapshot(): TurnTrace {
    return {
      ...this.trace,
      events: [...this.trace.events],
      retrievalChain: [...this.trace.retrievalChain],
    };
  }

  private appendChain(link: RetrievalChainLink): void {
    this.trace.retrievalChain.push(link);
  }

  private record(
    stage: TraceStage,
    opts: {
      taskId?: string;
      decision?: string;
      failureType?: TraceFailureType;
      input?: unknown;
      output?: unknown;
      durationMs?: number;
    },
  ): TraceEvent {
    const event: TraceEvent = {
      id: nextEventId(),
      traceId: this.traceId,
      taskId: opts.taskId,
      stage,
      startedAt: Date.now(),
      durationMs: opts.durationMs,
      decision: opts.decision,
      failureType: opts.failureType,
      input: opts.input !== undefined ? redactTraceValue(opts.input) : undefined,
      output: opts.output !== undefined ? redactTraceValue(opts.output) : undefined,
    };
    this.trace.events.push(event);
    return event;
  }

  markStageStart(stage: TraceStage, taskId?: string): void {
    const key = taskId ? `${stage}:${taskId}` : stage;
    this.stageStarts.set(key, Date.now());
  }

  markStageEnd(
    stage: TraceStage,
    opts?: {
      taskId?: string;
      decision?: string;
      input?: unknown;
      output?: unknown;
      failureType?: TraceFailureType;
    },
  ): void {
    const key = opts?.taskId ? `${stage}:${opts.taskId}` : stage;
    const start = this.stageStarts.get(key);
    const durationMs = start != null ? Date.now() - start : undefined;
    this.stageStarts.delete(key);
    this.record(stage, {
      taskId: opts?.taskId,
      decision: opts?.decision,
      failureType: opts?.failureType,
      input: opts?.input,
      output: opts?.output,
      durationMs,
    });
  }

  recordTemporalGrounding(grounding: TemporalGrounding): void {
    this.trace.temporal = grounding;
    this.record("temporal_grounding", {
      decision: "resolved",
      output: grounding,
    });
  }

  /** Generic stage logger for simple-turn runtime. */
  recordStage(
    stage: TraceStage,
    opts?: {
      taskId?: string;
      decision?: string;
      failureType?: TraceFailureType;
      input?: unknown;
      output?: unknown;
      durationMs?: number;
    },
  ): void {
    this.record(stage, opts ?? {});
  }

  recordRequestLedger(ledger: RequestLedger): void {
    this.trace.requestLedger = ledger;
    this.record("request_ledger", {
      decision: "scanned",
      output: ledger,
    });
  }

  recordTaskGraph(graph: TaskGraphSnapshot): void {
    this.trace.taskGraph = graph;
    this.record("task_graph", {
      decision: "compiled",
      output: graph,
    });
  }

  recordRouteCapability(opts: {
    taskId: string;
    node: Pick<TaskNode, "kind" | "capability" | "query" | "label">;
    reason: string;
  }): void {
    this.record("route_capability", {
      taskId: opts.taskId,
      decision: opts.reason,
      output: {
        kind: opts.node.kind,
        capability: opts.node.capability ?? "web.search",
        query: opts.node.query ?? opts.node.label,
      },
    });
  }

  recordToolRequest(opts: {
    taskId?: string;
    tool: string;
    arguments: Record<string, unknown>;
    reason?: string;
  }): void {
    this.record("tool_request", {
      taskId: opts.taskId,
      decision: opts.reason ?? `invoke ${opts.tool}`,
      input: { tool: opts.tool, arguments: opts.arguments },
    });
    if (opts.tool === "web.search" || opts.tool === "web.research") {
      const query =
        (opts.arguments.query as string) ??
        (opts.arguments.q as string) ??
        JSON.stringify(opts.arguments).slice(0, 200);
      this.appendChain({
        step: "exa_query",
        taskId: opts.taskId,
        at: Date.now(),
        summary: query.slice(0, 200),
        payload: { tool: opts.tool, arguments: redactTraceValue(opts.arguments) },
      });
    }
  }

  recordToolResponseRaw(opts: {
    taskId?: string;
    tool: string;
    ok: boolean;
    durationMs: number;
    rawData?: Record<string, unknown>;
    rawOutput?: string;
    error?: string;
  }): void {
    this.record("tool_response_raw", {
      taskId: opts.taskId,
      decision: opts.ok ? "tool_ok" : "tool_failed",
      failureType: opts.ok ? undefined : "tool_error",
      durationMs: opts.durationMs,
      output: {
        ok: opts.ok,
        data: opts.rawData ? redactToolPayload(opts.rawData) : undefined,
        output: opts.rawOutput ? redactTraceValue(opts.rawOutput) : undefined,
        error: opts.error,
      },
    });
    this.appendChain({
      step: "raw_tool_response",
      taskId: opts.taskId,
      at: Date.now(),
      summary: opts.ok ? `${opts.tool} ok (${opts.durationMs}ms)` : `${opts.tool} failed`,
      payload: {
        ok: opts.ok,
        data: opts.rawData ? redactToolPayload(opts.rawData) : undefined,
        outputPreview:
          typeof opts.rawOutput === "string" ? opts.rawOutput.slice(0, 500) : undefined,
      },
    });
  }

  recordEvidenceAccept(opts: {
    taskId?: string;
    evidence: Pick<TurnEvidence, "id" | "title" | "content" | "url"> & {
      kind?: TurnEvidence["kind"];
    };
    reason?: string;
  }): void {
    this.record("evidence_accept", {
      taskId: opts.taskId,
      decision: opts.reason ?? "accepted",
      output: opts.evidence,
    });
    this.appendChain({
      step: "accepted_evidence",
      taskId: opts.taskId,
      at: Date.now(),
      summary: opts.evidence.title?.slice(0, 120) ?? opts.evidence.id,
      payload: opts.evidence,
    });
  }

  recordEvidenceReject(opts: {
    taskId?: string;
    evidenceId: string;
    reason: string;
    kind?: string;
  }): void {
    this.record("evidence_reject", {
      taskId: opts.taskId,
      decision: opts.reason,
      failureType: "evidence_rejected",
      output: { id: opts.evidenceId, kind: opts.kind },
    });
    this.appendChain({
      step: "rejected_evidence",
      taskId: opts.taskId,
      at: Date.now(),
      summary: opts.reason,
      payload: { id: opts.evidenceId, reason: opts.reason },
    });
  }

  recordEvidenceNormalize(opts: {
    taskId?: string;
    inputCount: number;
    outputCount: number;
    atoms?: unknown[];
  }): void {
    this.record("evidence_normalize", {
      taskId: opts.taskId,
      decision: "provenance_normalize",
      input: { count: opts.inputCount },
      output: { count: opts.outputCount, atomsPreview: opts.atoms?.slice(0, 5) },
    });
  }

  recordModelPrompt(opts: {
    round: number;
    prompt: string;
    instructions: string;
    evidencePacket?: unknown;
  }): void {
    this.record("model_prompt", {
      decision: `fm_round_${opts.round}`,
      input: {
        promptChars: opts.prompt.length,
        instructionsChars: opts.instructions.length,
        prompt: opts.prompt,
        instructions: opts.instructions,
        evidencePacket: opts.evidencePacket,
      },
    });
    this.appendChain({
      step: "model_input",
      at: Date.now(),
      summary: `FM round ${opts.round} (${opts.prompt.length + opts.instructions.length} chars)`,
      payload: {
        round: opts.round,
        promptPreview: opts.prompt.slice(0, 800),
        instructionsPreview: opts.instructions.slice(0, 400),
        evidencePacket: opts.evidencePacket,
      },
    });
  }

  recordModelOutput(opts: { round: number; text: string; structured?: boolean }): void {
    this.record("model_output", {
      decision: opts.structured ? "structured" : "prose",
      output: { round: opts.round, text: opts.text, chars: opts.text.length },
    });
    this.appendChain({
      step: "model_output",
      at: Date.now(),
      summary: opts.text.slice(0, 160),
      payload: opts.text,
    });
  }

  recordRetry(opts: {
    taskId: string;
    reason: string;
    refinedQuery?: string;
    alternateCapability?: string;
    attempt: number;
  }): void {
    this.record("retry", {
      taskId: opts.taskId,
      decision: opts.reason,
      input: { attempt: opts.attempt },
      output: {
        refinedQuery: opts.refinedQuery,
        alternateCapability: opts.alternateCapability,
      },
    });
  }

  recordValidationFailure(opts: {
    taskId: string;
    reason: string;
    needsVerificationSearch?: boolean;
    issues?: string[];
  }): void {
    this.record("validation_failure", {
      taskId: opts.taskId,
      decision: opts.reason,
      failureType: "validation_failed",
      output: {
        needsVerificationSearch: opts.needsVerificationSearch,
        issues: opts.issues,
      },
    });
  }

  recordFallback(opts: { decision: string; reason: string; failureType?: TraceFailureType }): void {
    this.record("fallback", {
      decision: opts.decision,
      failureType: opts.failureType ?? "other",
      output: { reason: opts.reason },
    });
  }

  recordCoverage(coverage: CoverageResult): void {
    this.trace.coverage = coverage;
    this.record("coverage", {
      decision: coverage.readyForSynthesis ? "ready" : "blocked",
      failureType: coverage.readyForSynthesis ? undefined : "coverage_blocked",
      output: coverage,
    });
  }

  recordFinalResponse(opts: {
    content: string;
    citations?: Array<{ id: string; url?: string; title?: string }>;
    finalSource?: string;
  }): void {
    this.trace.finalResponse = opts.content;
    this.trace.citationsUsed = opts.citations;
    this.trace.finalSource = opts.finalSource;
    this.record("final_response", {
      decision: opts.finalSource ?? "answer",
      output: {
        content: opts.content,
        citations: opts.citations,
      },
    });
    this.appendChain({
      step: "final_answer",
      at: Date.now(),
      summary: opts.content.slice(0, 160),
      payload: opts.content,
    });
  }

  finalize(opts?: { failureReason?: string }): TurnTrace {
    this.trace.finishedAt = Date.now();
    this.trace.latencyMs = this.trace.finishedAt - this.startedAt;
    if (opts?.failureReason) this.trace.failureReason = opts.failureReason;
    storeTurnTrace(this.snapshot);
    if (isTurnTraceEnabled()) {
      try {
        console.log("[TURN_TRACE]", JSON.stringify(this.snapshot));
      } catch {
        console.log("[TURN_TRACE]", {
          traceId: this.traceId,
          latencyMs: this.trace.latencyMs,
          events: this.trace.events.length,
        });
      }
    }
    return this.snapshot;
  }
}

let activeRecorder: TurnTraceRecorder | null = null;

export function startTurnTrace(opts: {
  threadId?: string;
  aiChatId?: string;
  userInput: string;
}): TurnTraceRecorder | null {
  if (!shouldRecordTurnTrace()) return null;
  activeRecorder = new TurnTraceRecorder(opts);
  return activeRecorder;
}

export function getTurnTraceRecorder(): TurnTraceRecorder | null {
  return activeRecorder;
}

export function finalizeTurnTrace(opts?: { failureReason?: string }): TurnTrace | null {
  if (!activeRecorder) return null;
  const trace = activeRecorder.finalize(opts);
  activeRecorder = null;
  return trace;
}

export function resetTurnTraceForTests(): void {
  activeRecorder = null;
  eventSeq = 0;
}

export function traceRouteForNode(node: TaskNode, reason: string): void {
  const rec = getTurnTraceRecorder();
  if (!rec) return;
  rec.recordRouteCapability({
    taskId: nodeTaskId(node),
    node,
    reason,
  });
}
