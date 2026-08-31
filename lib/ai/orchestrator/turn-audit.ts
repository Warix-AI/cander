/**
 * Unified turn audit — Phase 0 instrumentation for v4 orchestration.
 * Developer-only logs; never user-visible. Consolidates retrieval trace + request ledger.
 */

import type { TurnRelation } from "@/lib/ai/turn-environment/turn-relation.ts";
import type { ResearchTurnPlan } from "@/lib/ai/turn-environment/research-turn-plan.ts";
import type { WebRetrievalPlan } from "@/lib/ai/turn-environment/web-retrieval-plan.ts";
import {
  emptyRetrievalTrace,
  getRetrievalTrace,
  patchRetrievalTrace,
  resetRetrievalTrace,
  type FinalAnswerSource,
  type TurnRetrievalTrace,
} from "./retrieval-trace.ts";
import { scanRequest, type RequestLedger } from "./request-scanner.ts";

export type AuditStage =
  | "request_scan"
  | "delta"
  | "compile"
  | "pre_run"
  | "evidence_gate"
  | "completion_loop"
  | "model_synthesis"
  | "finalize";

export type AuditToolCall = {
  name: string;
  ok?: boolean;
  durationMs?: number;
  reason?: string;
  subtaskId?: string;
  deterministic?: boolean;
  round?: number;
};

export type AuditModelCall = {
  stage: "delta" | "plan" | "synthesis" | "tool_round";
  round?: number;
  inputChars?: number;
  outputChars?: number;
  durationMs?: number;
  structured?: boolean;
};

export type AuditEvidenceRecord = {
  id: string;
  action: "accepted" | "rejected" | "quarantined";
  reason?: string;
  kind?: string;
  subtaskId?: string;
};

export type TurnAudit = {
  turnId?: string;
  threadId?: string;
  startedAt: number;
  finishedAt?: number;
  latencyMs?: number;

  request: RequestLedger;
  turnRelation?: TurnRelation;
  turnIntent?: string;

  researchPlan?: {
    objective: string;
    calculation: string;
    subtaskCount: number;
    subtaskIds: string[];
  };
  webPlan?: Pick<
    WebRetrievalPlan,
    "mode" | "output" | "query" | "resultCount" | "freshness" | "contentNeeded"
  >;

  toolCalls: AuditToolCall[];
  modelCalls: AuditModelCall[];
  evidence: AuditEvidenceRecord[];

  coverage?: {
    complete: boolean;
    unresolved: string[];
    calculatedTotal?: number;
  };

  stages: Partial<Record<AuditStage, { startedAt: number; durationMs?: number }>>;

  retrieval: TurnRetrievalTrace;

  finalSource?: FinalAnswerSource;
  failureReason?: string;
  answerChars?: number;
};

let activeAudit: TurnAudit | null = null;
const stageStarts = new Map<AuditStage, number>();

export function emptyTurnAudit(): TurnAudit {
  return {
    startedAt: Date.now(),
    request: scanRequest(""),
    toolCalls: [],
    modelCalls: [],
    evidence: [],
    stages: {},
    retrieval: emptyRetrievalTrace(),
  };
}

export function resetTurnAudit(opts?: {
  turnId?: string;
  threadId?: string;
  userMessage?: string;
}): TurnAudit {
  resetRetrievalTrace();
  stageStarts.clear();
  activeAudit = {
    ...emptyTurnAudit(),
    turnId: opts?.turnId,
    threadId: opts?.threadId,
    startedAt: Date.now(),
    request: scanRequest(opts?.userMessage ?? ""),
  };
  markStageStart("request_scan");
  markStageEnd("request_scan");
  return activeAudit;
}

export function getTurnAudit(): TurnAudit | null {
  if (!activeAudit) return null;
  return {
    ...activeAudit,
    retrieval: getRetrievalTrace(),
  };
}

export function markStageStart(stage: AuditStage): void {
  stageStarts.set(stage, Date.now());
  if (activeAudit) {
    activeAudit.stages[stage] = { startedAt: stageStarts.get(stage)! };
  }
}

export function markStageEnd(stage: AuditStage): void {
  const start = stageStarts.get(stage);
  if (!activeAudit || start == null) return;
  const durationMs = Date.now() - start;
  activeAudit.stages[stage] = {
    startedAt: start,
    durationMs,
  };
  stageStarts.delete(stage);
}

export function recordRequestScan(userMessage: string): RequestLedger {
  if (!activeAudit) return scanRequest(userMessage);
  activeAudit.request = scanRequest(userMessage);
  return activeAudit.request;
}

export function recordTurnRelation(relation: TurnRelation): void {
  if (!activeAudit) return;
  activeAudit.turnRelation = relation;
  patchRetrievalTrace({ turnRelation: relation });
}

export function recordTurnCompile(opts: {
  intent: string;
  relation: TurnRelation;
  webPlan?: WebRetrievalPlan;
  researchPlan?: ResearchTurnPlan | null;
}): void {
  if (!activeAudit) return;
  activeAudit.turnIntent = opts.intent;
  activeAudit.turnRelation = opts.relation;
  if (opts.webPlan) {
    activeAudit.webPlan = {
      mode: opts.webPlan.mode,
      output: opts.webPlan.output,
      query: opts.webPlan.query,
      resultCount: opts.webPlan.resultCount,
      freshness: opts.webPlan.freshness,
      contentNeeded: opts.webPlan.contentNeeded,
    };
    patchRetrievalTrace({
      turnIntent: opts.intent,
      turnRelation: opts.relation,
      webPlan: activeAudit.webPlan,
      mode: opts.webPlan.mode === "agent" ? "agent" : (opts.webPlan.exaMode ?? "none"),
      outputSchema: opts.webPlan.output,
      numResults: opts.webPlan.resultCount,
    });
  }
  if (opts.researchPlan) {
    activeAudit.researchPlan = {
      objective: opts.researchPlan.objective,
      calculation: opts.researchPlan.calculation,
      subtaskCount: opts.researchPlan.subtasks.length,
      subtaskIds: opts.researchPlan.subtasks.map((s) => s.id),
    };
  }
}

export function recordAuditToolCall(call: AuditToolCall): void {
  activeAudit?.toolCalls.push(call);
}

export function recordAuditModelCall(call: AuditModelCall): void {
  activeAudit?.modelCalls.push(call);
}

export function recordAuditEvidence(record: AuditEvidenceRecord): void {
  activeAudit?.evidence.push(record);
}

export function recordAuditCoverage(coverage: TurnAudit["coverage"]): void {
  if (!activeAudit || !coverage) return;
  activeAudit.coverage = coverage;
  if (coverage.unresolved.length) {
    patchRetrievalTrace({ validationIssues: coverage.unresolved });
  }
}

export function finalizeTurnAudit(opts: {
  finalSource: FinalAnswerSource;
  answerChars?: number;
  failureReason?: string;
}): TurnAudit | null {
  if (!activeAudit) return null;
  activeAudit.finishedAt = Date.now();
  activeAudit.latencyMs = activeAudit.finishedAt - activeAudit.startedAt;
  activeAudit.finalSource = opts.finalSource;
  activeAudit.answerChars = opts.answerChars;
  activeAudit.failureReason = opts.failureReason;
  activeAudit.retrieval = getRetrievalTrace();
  patchRetrievalTrace({ finalSource: opts.finalSource });
  return getTurnAudit();
}

/** Emit structured audit log (dev-only). */
export function logTurnAudit(extra?: Record<string, unknown>): void {
  const audit = getTurnAudit();
  if (!audit) return;
  console.log("[TURN_AUDIT]", {
    turnId: audit.turnId,
    threadId: audit.threadId,
    latencyMs: audit.latencyMs,
    turnRelation: audit.turnRelation,
    turnIntent: audit.turnIntent,
    request: {
      askCount: audit.request.asks.length,
      constraintCount: audit.request.constraints.length,
      contextCount: audit.request.context.length,
      spans: audit.request.spans.map((s) => ({
        id: s.id,
        kind: s.kind,
        rule: s.rule,
        text: s.text.slice(0, 120),
      })),
      urls: audit.request.urls,
      explicitApps: audit.request.explicitApps,
      askExtractorTriggers: audit.request.askExtractorTriggers,
    },
    researchPlan: audit.researchPlan,
    webPlan: audit.webPlan,
    toolCalls: audit.toolCalls,
    modelCalls: audit.modelCalls,
    evidence: audit.evidence,
    coverage: audit.coverage,
    stages: audit.stages,
    retrieval: audit.retrieval,
    finalSource: audit.finalSource,
    failureReason: audit.failureReason,
    answerChars: audit.answerChars,
    ...extra,
    ts: Date.now(),
  });
}
