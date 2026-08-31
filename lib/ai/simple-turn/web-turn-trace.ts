/**
 * WEB turn comparison trace — find where facts are lost vs Exa playground.
 */

import type { BrowserMode, SimpleEvidence } from "./types.ts";
import type { KnowledgeRoute, SplitDecision } from "./knowledge-route.ts";

export type WebTurnTrace = {
  rawUserText: string;
  knowledgeRoute: KnowledgeRoute;
  browserMode: BrowserMode;
  allowWeb: boolean;
  routeReason: string;
  interpretedIntent: string;
  splitDecision: SplitDecision;
  exaQueries: string[];
  rawExaResponses: Array<{ query: string; preview: string; ok: boolean }>;
  acceptedEvidence: Array<{
    id: string;
    query: string;
    preview: string;
    url?: string | null;
  }>;
  rejectedEvidence: Array<{
    id: string;
    query: string;
    reason?: string;
  }>;
  finalAnswer: string;
  /** Where loss likely happened if Sprite/etc missing vs playground */
  lossHint?:
    | "before_exa"
    | "query_splitting"
    | "evidence_validation"
    | "final_rendering"
    | "none";
};

export function logWebTurnTrace(trace: WebTurnTrace): void {
  console.log("[WEB_TURN_TRACE]", {
    rawUserText: trace.rawUserText.slice(0, 500),
    knowledgeRoute: trace.knowledgeRoute,
    browserMode: trace.browserMode,
    allowWeb: trace.allowWeb,
    routeReason: trace.routeReason,
    interpretedIntent: trace.interpretedIntent.slice(0, 300),
    splitDecision: trace.splitDecision,
    exaQueries: trace.exaQueries.map((q) => q.slice(0, 400)),
    rawExaResponses: trace.rawExaResponses.map((r) => ({
      ...r,
      preview: r.preview.slice(0, 800),
    })),
    acceptedEvidence: trace.acceptedEvidence.map((a) => ({
      ...a,
      preview: a.preview.slice(0, 400),
    })),
    rejectedEvidence: trace.rejectedEvidence,
    finalAnswer: trace.finalAnswer.slice(0, 1500),
    lossHint: trace.lossHint ?? inferLossHint(trace),
  });
}

export function inferLossHint(trace: WebTurnTrace): WebTurnTrace["lossHint"] {
  if (!trace.allowWeb && /calories?|sprite|mcdonald/i.test(trace.rawUserText)) {
    return "before_exa";
  }
  if (
    trace.splitDecision === "multiple_queries" &&
    /calories?/.test(trace.rawUserText) &&
    /sprite|mcdonald|chick-fil/i.test(trace.rawUserText)
  ) {
    return "query_splitting";
  }
  if (
    trace.exaQueries.length > 0 &&
    trace.rawExaResponses.some((r) => r.ok) &&
    trace.acceptedEvidence.length === 0
  ) {
    return "evidence_validation";
  }
  if (
    trace.acceptedEvidence.length > 0 &&
    /sprite/i.test(trace.rawUserText) &&
    !/sprite/i.test(trace.finalAnswer) &&
    trace.acceptedEvidence.some((a) => /sprite/i.test(a.preview + a.query))
  ) {
    return "final_rendering";
  }
  if (
    trace.acceptedEvidence.length > 0 &&
    /sprite/i.test(trace.rawUserText) &&
    !trace.acceptedEvidence.some((a) => /sprite/i.test(a.preview + a.query)) &&
    !trace.exaQueries.some((q) => /sprite/i.test(q))
  ) {
    return "query_splitting";
  }
  return "none";
}

export function evidenceTraceRows(
  items: SimpleEvidence[],
  kind: "accepted" | "rejected",
): WebTurnTrace["acceptedEvidence"] | WebTurnTrace["rejectedEvidence"] {
  if (kind === "accepted") {
    return items.map((e) => ({
      id: e.id,
      query: e.query,
      preview: e.content.slice(0, 400),
      url: e.url,
    }));
  }
  return items.map((e) => ({
    id: e.id,
    query: e.query,
    reason: e.rejectReason ?? e.verify?.reasons?.join(",") ?? "rejected",
  }));
}
