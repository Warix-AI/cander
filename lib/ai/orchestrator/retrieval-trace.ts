/**
 * Developer-only retrieval trace — console logs, never user-visible UI.
 */

import type { ExaRetrievalMode } from "@/lib/ai/web-research/index.ts";

export type FinalAnswerSource =
  | "exa_search_output"
  | "deterministic_render"
  | "fm_verbalized"
  | "fm_synthesis"
  | "exa_agent"
  | "work_task";

export type TurnRetrievalTrace = {
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
