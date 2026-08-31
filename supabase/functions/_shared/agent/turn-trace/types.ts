/**
 * Shared turn-trace schema (Edge + client compatible JSON).
 */

export type TraceStage =
  | "user_input"
  | "hydrate"
  | "interpret"
  | "plan"
  | "plan_validate"
  | "temporal_grounding"
  | "request_ledger"
  | "task_graph"
  | "route_capability"
  | "tool_request"
  | "tool_response_raw"
  | "verify"
  | "evidence_accept"
  | "evidence_reject"
  | "evidence_normalize"
  | "model_prompt"
  | "model_output"
  | "retry"
  | "validation_failure"
  | "fallback"
  | "coverage"
  | "answer_path"
  | "commit"
  | "final_response";

export type TraceFailureType =
  | "tool_error"
  | "validation_failed"
  | "coverage_blocked"
  | "evidence_rejected"
  | "max_retries"
  | "generation_failed"
  | "fail_closed"
  | "other";

export type TraceEvent = {
  id: string;
  traceId: string;
  taskId?: string;
  stage: TraceStage;
  startedAt: number;
  durationMs?: number;
  decision?: string;
  failureType?: TraceFailureType;
  input?: unknown;
  output?: unknown;
};

export type RetrievalChainStep =
  | "user_ask"
  | "exa_query"
  | "raw_tool_response"
  | "accepted_evidence"
  | "rejected_evidence"
  | "model_input"
  | "model_output"
  | "final_answer";

export type RetrievalChainLink = {
  step: RetrievalChainStep;
  taskId?: string;
  at: number;
  summary?: string;
  payload: unknown;
};

export type TurnTrace = {
  traceId: string;
  runtime: "local" | "cloud";
  threadId?: string;
  aiChatId?: string;
  turnId?: string;
  startedAt: number;
  finishedAt?: number;
  latencyMs?: number;
  userInput: string;
  temporal?: Record<string, unknown>;
  requestLedger?: Record<string, unknown>;
  taskGraph?: Record<string, unknown>;
  coverage?: Record<string, unknown>;
  events: TraceEvent[];
  retrievalChain: RetrievalChainLink[];
  finalResponse?: string;
  citationsUsed?: Array<{ id: string; url?: string; title?: string }>;
  finalSource?: string;
  failureReason?: string;
};

export type TurnTraceSummary = {
  traceId: string;
  runtime: "local" | "cloud";
  threadId?: string;
  aiChatId?: string;
  turnId?: string;
  startedAt: number;
  finishedAt?: number;
  latencyMs?: number;
  userInputPreview: string;
  eventCount: number;
  taskCount: number;
  failureReason?: string;
  hasRetrievalChain: boolean;
};

export function summarizeTrace(trace: TurnTrace): TurnTraceSummary {
  const taskIds = new Set<string>();
  for (const e of trace.events) {
    if (e.taskId) taskIds.add(e.taskId);
  }
  return {
    traceId: trace.traceId,
    runtime: trace.runtime,
    threadId: trace.threadId,
    aiChatId: trace.aiChatId,
    turnId: trace.turnId,
    startedAt: trace.startedAt,
    finishedAt: trace.finishedAt,
    latencyMs: trace.latencyMs,
    userInputPreview: trace.userInput.slice(0, 120),
    eventCount: trace.events.length,
    taskCount: taskIds.size,
    failureReason: trace.failureReason,
    hasRetrievalChain: trace.retrievalChain.length > 0,
  };
}
