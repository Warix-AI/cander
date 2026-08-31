/**
 * Evidence helpers — per-request quality scores.
 */

import type { Evidence, EvidenceScores } from "../types.ts";
import { authorityScore } from "./authority.ts";

export function scoreEvidenceForRequest(args: {
  requestId: string;
  subjectMatch: number;
  propertyMatch: number;
  relevance: number;
  url?: string;
  sourceType?: Evidence["sourceType"];
  freshnessValid?: boolean;
}): EvidenceScores {
  return {
    subjectMatch: clamp01(args.subjectMatch),
    propertyMatch: clamp01(args.propertyMatch),
    relevance: clamp01(args.relevance),
    authority: authorityScore(args.url, args.sourceType),
    freshnessValid: args.freshnessValid ?? true,
  };
}

export function attachScores(
  evidence: Evidence,
  requestId: string,
  scores: EvidenceScores,
): Evidence {
  return {
    ...evidence,
    scores: {
      ...evidence.scores,
      [requestId]: scores,
    },
  };
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
