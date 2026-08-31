/**
 * Stage 10 — Verification against policy + evidence quality.
 */

import type {
  Evidence,
  NormalizedRequest,
  RequestResult,
  SourcePlan,
} from "../types.ts";
import { getPolicy } from "../normalize/policies.ts";
import { authorityScore } from "./authority.ts";

export function verifyResult(
  n: NormalizedRequest,
  result: RequestResult,
  evidence: Evidence[],
  plan: SourcePlan,
): RequestResult {
  if (result.status === "policy_trusted") {
    const policy = getPolicy(n.property.canonicalKey);
    if (policy && !policy.modelAllowed) {
      return {
        ...result,
        status: "unresolved",
        reason: "model_not_allowed_by_policy",
      };
    }
    // Model-only never becomes verified
    return { ...result, status: "policy_trusted" };
  }

  if (result.status !== "verified") return result;

  const policy = getPolicy(plan.policyKey || n.property.canonicalKey);
  if (policy?.requiresExternalEvidence && evidence.length === 0) {
    if (plan.strategy === "deterministic") return result;
    return {
      ...result,
      status: "unresolved",
      reason: "missing_external_evidence",
    };
  }

  for (const ev of evidence) {
    const scores = ev.scores[n.request.id];
    if (!scores) continue;
    const auth =
      scores.authority ||
      authorityScore(ev.source?.url, ev.sourceType);
    if (auth < 30) {
      return {
        ...result,
        status: "unresolved",
        reason: "insufficient_authority",
      };
    }
    if (!scores.freshnessValid && policy?.volatility !== "stable") {
      return {
        ...result,
        status: "unresolved",
        reason: "stale_evidence",
      };
    }
  }

  return result;
}
