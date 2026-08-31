import { redactToolPayload, redactTraceValue } from "./redact.ts";
import type {
  RetrievalChainLink,
  TraceFailureType,
  TraceStage,
  TurnTrace,
} from "./types.ts";

let eventSeq = 0;

function nextEventId(): string {
  eventSeq += 1;
  return `evt_${eventSeq}_${Date.now().toString(36)}`;
}

export function isEdgeTurnTraceEnabled(): boolean {
  const v = (Deno.env.get("TURN_TRACE") ?? Deno.env.get("AI_TURN_TRACE") ?? "1")
    .trim()
    .toLowerCase();
  return v !== "0" && v !== "false" && v !== "off";
}

export class EdgeTurnTraceRecorder {
  readonly traceId: string;
  readonly startedAt: number;
  private readonly trace: TurnTrace;

  constructor(opts: {
    traceId: string;
    turnId: string;
    chatId: string;
    userInput: string;
  }) {
    this.traceId = opts.traceId;
    this.startedAt = Date.now();
    this.trace = {
      traceId: opts.traceId,
      runtime: "cloud",
      turnId: opts.turnId,
      aiChatId: opts.chatId,
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
  ): void {
    this.trace.events.push({
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
    });
  }

  recordTemporalContext(ctx: Record<string, unknown>): void {
    this.trace.temporal = ctx;
    this.record("temporal_grounding", { decision: "resolved", output: ctx });
  }

  recordControllerDecision(opts: {
    cycle: number;
    action: string;
    reasonCode: string;
    queries?: string[];
    sourceIds?: string[];
  }): void {
    const taskId = `controller_${opts.cycle}`;
    this.record("route_capability", {
      taskId,
      decision: `${opts.action}:${opts.reasonCode}`,
      output: {
        action: opts.action,
        reasonCode: opts.reasonCode,
        queries: opts.queries,
        sourceIds: opts.sourceIds,
      },
    });
  }

  recordToolRequest(opts: {
    taskId: string;
    tool: string;
    arguments: Record<string, unknown>;
    reason?: string;
  }): void {
    this.record("tool_request", {
      taskId: opts.taskId,
      decision: opts.reason ?? `invoke ${opts.tool}`,
      input: { tool: opts.tool, arguments: opts.arguments },
    });
    if (
      opts.tool === "web.search" ||
      opts.tool === "web.research" ||
      opts.tool === "brave.search"
    ) {
      const query = String(opts.arguments.query ?? opts.arguments.q ?? "");
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
    taskId: string;
    tool: string;
    ok: boolean;
    durationMs: number;
    raw?: unknown;
    error?: string;
  }): void {
    this.record("tool_response_raw", {
      taskId: opts.taskId,
      decision: opts.ok ? "tool_ok" : "tool_failed",
      failureType: opts.ok ? undefined : "tool_error",
      durationMs: opts.durationMs,
      output: {
        ok: opts.ok,
        raw: redactToolPayload(opts.raw),
        error: opts.error,
      },
    });
    this.appendChain({
      step: "raw_tool_response",
      taskId: opts.taskId,
      at: Date.now(),
      summary: opts.ok ? `${opts.tool} ok (${opts.durationMs}ms)` : `${opts.tool} failed`,
      payload: { ok: opts.ok, raw: redactToolPayload(opts.raw) },
    });
  }

  recordEvidenceAccepted(opts: {
    taskId?: string;
    item: { id: string; kind: string; title?: string; url?: string | null; content: string };
    reason?: string;
  }): void {
    this.record("evidence_accept", {
      taskId: opts.taskId,
      decision: opts.reason ?? "accepted",
      output: opts.item,
    });
    this.appendChain({
      step: "accepted_evidence",
      taskId: opts.taskId,
      at: Date.now(),
      summary: opts.item.title?.slice(0, 120) ?? opts.item.id,
      payload: opts.item,
    });
  }

  recordEvidenceRejected(opts: { evidenceId: string; reason: string }): void {
    this.record("evidence_reject", {
      decision: opts.reason,
      failureType: "evidence_rejected",
      output: { id: opts.evidenceId },
    });
  }

  recordEvidenceBriefing(briefing: unknown): void {
    this.record("evidence_normalize", {
      decision: "evidence_briefing",
      output: briefing,
    });
  }

  recordModelPrompt(opts: {
    round: number;
    promptPacket: unknown;
    messageCount?: number;
  }): void {
    this.record("model_prompt", {
      decision: `answer_gen_${opts.round}`,
      input: {
        round: opts.round,
        messageCount: opts.messageCount,
        packet: opts.promptPacket,
      },
    });
    this.appendChain({
      step: "model_input",
      at: Date.now(),
      summary: `Answer gen round ${opts.round}`,
      payload: opts.promptPacket,
    });
  }

  recordModelOutput(opts: { round: number; text: string }): void {
    this.record("model_output", {
      decision: "answer",
      output: { round: opts.round, text: opts.text, chars: opts.text.length },
    });
    this.appendChain({
      step: "model_output",
      at: Date.now(),
      summary: opts.text.slice(0, 160),
      payload: opts.text,
    });
  }

  recordValidationFailure(opts: {
    reason: string;
    issues?: string[];
    recommendedAction?: string;
  }): void {
    this.record("validation_failure", {
      decision: opts.reason,
      failureType: "validation_failed",
      output: {
        issues: opts.issues,
        recommendedAction: opts.recommendedAction,
      },
    });
  }

  recordRetry(opts: {
    taskId: string;
    reason: string;
    action?: string;
    queries?: string[];
  }): void {
    this.record("retry", {
      taskId: opts.taskId,
      decision: opts.reason,
      output: { action: opts.action, queries: opts.queries },
    });
  }

  recordFallback(opts: { decision: string; reason: string }): void {
    this.record("fallback", {
      decision: opts.decision,
      output: { reason: opts.reason },
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
      output: { content: opts.content, citations: opts.citations },
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
    if (isEdgeTurnTraceEnabled()) {
      console.log("[TURN_TRACE]", JSON.stringify(this.snapshot));
    }
    return this.snapshot;
  }
}

export async function persistStructuredTrace(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  turnId: string,
  trace: TurnTrace,
  observabilityPatch?: Record<string, unknown>,
): Promise<void> {
  if (!isEdgeTurnTraceEnabled()) return;
  try {
    await supabase
      .from("ai_chat_turns")
      .update({
        structured_trace: trace,
        observability: {
          ...(observabilityPatch ?? {}),
          structuredTraceId: trace.traceId,
          traceEventCount: trace.events.length,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("turn_id", turnId);
  } catch (e) {
    console.warn("[TURN_TRACE] persist failed", e);
  }
}
