/**
 * Deterministic retrieval requirements — not prompt-dependent.
 */

import type { ConversationTurnState } from "@/lib/ai/turn-environment/conversation-types.ts";
import type { TurnTaskResolution } from "@/lib/ai/turn-environment/turn-task.ts";
import { requiresExternalEvidence } from "./deterministic-triggers.ts";
import type { RequestLedger } from "./request-scanner.ts";
import type { TemporalGrounding } from "./temporal-grounding.ts";
import type { TurnEvidence } from "./evidence.ts";

export type TurnTerminalState =
  | "ANSWERED_GROUNDED"
  | "ANSWERED_NO_RETRIEVAL_REQUIRED"
  | "PARTIAL"
  | "UNRESOLVED"
  | "FAILED";

export function isRetrievalRequiredForTurn(opts: {
  turnTask?: TurnTaskResolution;
  temporalGrounding?: TemporalGrounding | null;
  conversationState?: ConversationTurnState | null;
  ledger?: RequestLedger;
}): boolean {
  if (opts.turnTask?.retrievalNeeded) return true;
  if (opts.turnTask?.freshness) return true;
  if (opts.temporalGrounding?.freshnessRequired) return true;
  if (opts.temporalGrounding?.timeSensitive) return true;
  if (opts.conversationState?.externalRetrievalRequired) return true;
  if (opts.conversationState?.freshnessRequirement) return true;
  if (opts.conversationState?.dissatisfactionSignal) return true;
  if (opts.ledger) {
    if (
      opts.ledger.asks.some((a) => requiresExternalEvidence(a.text)) ||
      requiresExternalEvidence(opts.ledger.rawInput)
    ) {
      return true;
    }
  }
  return false;
}

export function acceptedEvidence(evidence: TurnEvidence[]): TurnEvidence[] {
  return evidence.filter((e) => e.ok && e.content.trim().length > 0);
}

export function hasAcceptedEvidence(evidence: TurnEvidence[]): boolean {
  return evidence.some(
    (e) =>
      e.ok &&
      e.content.trim().length >= 20 &&
      (e.kind === "web_page" ||
        e.kind === "search_result" ||
        e.kind === "exa_synthesis" ||
        e.kind === "browser" ||
        e.kind === "knowledge"),
  );
}

/** Block FM synthesis when live facts are required but retrieval produced nothing. */
export function shouldBlockSynthesisWithoutEvidence(opts: {
  retrievalRequired: boolean;
  evidence: TurnEvidence[];
  retrievalAttempted: boolean;
}): boolean {
  if (!opts.retrievalRequired) return false;
  if (hasAcceptedEvidence(opts.evidence)) return false;
  return true;
}

export function resolveTurnTerminalState(opts: {
  retrievalRequired: boolean;
  evidence: TurnEvidence[];
  retrievalAttempted: boolean;
  failed?: boolean;
  partial?: boolean;
  grounded?: boolean;
}): TurnTerminalState {
  if (opts.failed) return "FAILED";
  if (opts.retrievalRequired) {
    if (!opts.retrievalAttempted || !hasAcceptedEvidence(opts.evidence)) {
      return "UNRESOLVED";
    }
    if (opts.partial) return "PARTIAL";
    return opts.grounded === false ? "UNRESOLVED" : "ANSWERED_GROUNDED";
  }
  return "ANSWERED_NO_RETRIEVAL_REQUIRED";
}

/** Detect current-fact claims in prose (dates, scores, news) without evidence support. */
const CURRENT_FACT_MARKERS =
  /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}(?:,\s*\d{4})?\b|\b\d{4}\b|\btoday\b|\bthis year\b|\bthis season\b|\bcurrently\b|\blatest\b|\bscore\b|\bvs\.?\b/i;

export function answerClaimsUnsupportedCurrentFact(
  answer: string,
  evidence: TurnEvidence[],
): boolean {
  if (!CURRENT_FACT_MARKERS.test(answer)) return false;
  if (hasAcceptedEvidence(evidence)) return false;
  return true;
}
