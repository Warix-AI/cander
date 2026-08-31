/**
 * V6 TurnTrace helpers.
 */

import type { TurnTrace } from "../types.ts";

export function emptyTrace(input: string): Partial<TurnTrace> {
  return { input };
}

export function logV6Trace(trace: TurnTrace): void {
  console.log("[V6_TURN_TRACE]", {
    input: trace.input.slice(0, 200),
    surfaceSpans: trace.surfaceExpectation.spans.length,
    parse: trace.parseOutcome.type,
    parseCoverage: trace.parseCoverage?.status,
    waves: trace.executionWaves.length,
    results: trace.requestResults.map((r) => ({
      id: r.requestId,
      status: r.status,
    })),
    coverageComplete: trace.userCoverage.complete,
    renderer: trace.renderer,
    failureStage: trace.failureStage,
    fastPath: trace.fastPath,
  });
}
