/**
 * Developer-only retrieval trace — console logs, never user-visible UI.
 */

import type { ExaRetrievalMode } from "@/lib/ai/web-research/index.ts";
import type { TurnRelation } from "@/lib/ai/turn-environment/turn-relation.ts";
import type { WebRetrievalPlan } from "@/lib/ai/turn-environment/web-retrieval-plan.ts";

export type FinalAnswerSource =
  | "exa_search_output"
  | "deterministic_render"
  | "fm_verbalized"
  | "fm_synthesis"
  | "exa_agent"
  | "work_task"
  | "research_incomplete"
  | "pcc_synthesis";

export type TurnRetrievalTrace = {
  turnIntent?: string;
  turnRelation?: TurnRelation;
  webPlan?: Pick<
    WebRetrievalPlan,
    "mode" | "output" | "query" | "resultCount" | "freshness" | "contentNeeded"
  >;
  provider: "exa" | "none";
  mode: ExaRetrievalMode | "agent" | "none";
  outputSchema: "text" | "object" | "none";
  numResults?: number;
  directOutputPresent: boolean;
  groundingCount: number;
  latencyMs?: number;
  costDollars?: number;
  escalatedFrom?: ExaRetrievalMode | null;
  escalations?: number;
  staleEvidenceDropped?: number;
  fmInputChars?: number;
  validationIssues?: string[];
  finalSource?: FinalAnswerSource;
};

let activeTrace: TurnRetrievalTrace = emptyRetrievalTrace();

export function emptyRetrievalTrace(): TurnRetrievalTrace {
  return {
    provider: "none",
    mode: "none",
    outputSchema: "none",
    directOutputPresent: false,
    groundingCount: 0,
    escalations: 0,
    staleEvidenceDropped: 0,
  };
}

export function resetRetrievalTrace(): void {
  activeTrace = emptyRetrievalTrace();
}

export function getRetrievalTrace(): TurnRetrievalTrace {
  return { ...activeTrace };
}

export function patchRetrievalTrace(
  patch: Partial<TurnRetrievalTrace>,
): TurnRetrievalTrace {
  activeTrace = { ...activeTrace, ...patch };
  return activeTrace;
}

export function recordTurnIntent(opts: {
  intent: string;
  relation: TurnRelation;
  plan: WebRetrievalPlan;
}): void {
  patchRetrievalTrace({
    turnIntent: opts.intent,
    turnRelation: opts.relation,
    webPlan: {
      mode: opts.plan.mode,
      output: opts.plan.output,
      query: opts.plan.query,
      resultCount: opts.plan.resultCount,
      freshness: opts.plan.freshness,
      contentNeeded: opts.plan.contentNeeded,
    },
    mode: opts.plan.mode === "agent" ? "agent" : (opts.plan.exaMode ?? "none"),
    outputSchema: opts.plan.output,
    numResults: opts.plan.resultCount,
  });
}

export function recordSearchTrace(opts: {
  mode: ExaRetrievalMode | string;
  outputSchemaType?: "text" | "object" | "none";
  numResults?: number;
  directOutputPresent: boolean;
  groundingCount: number;
  latencyMs?: number;
  escalatedFrom?: ExaRetrievalMode | null;
}): void {
  const mode = (opts.mode || "fast") as ExaRetrievalMode;
  patchRetrievalTrace({
    provider: "exa",
    mode,
    outputSchema: opts.outputSchemaType ?? "text",
    numResults: opts.numResults,
    directOutputPresent: opts.directOutputPresent,
    groundingCount: opts.groundingCount,
    latencyMs: opts.latencyMs,
    escalatedFrom: opts.escalatedFrom ?? activeTrace.escalatedFrom,
  });
}

export function recordEscalation(from: ExaRetrievalMode, to: ExaRetrievalMode): void {
  patchRetrievalTrace({
    escalatedFrom: activeTrace.escalatedFrom ?? from,
    mode: to,
    escalations: (activeTrace.escalations ?? 0) + 1,
  });
}

export function recordFmInput(chars: number): void {
  patchRetrievalTrace({ fmInputChars: chars });
}

export function recordValidationIssues(issues: string[]): void {
  if (!issues.length) return;
  patchRetrievalTrace({ validationIssues: issues });
}

export function setFinalSource(source: FinalAnswerSource): void {
  patchRetrievalTrace({ finalSource: source });
}

export function logRetrievalTrace(extra?: Record<string, unknown>): void {
  console.log("[RETRIEVAL_TRACE]", {
    ...activeTrace,
    ...extra,
    ts: Date.now(),
  });
}
