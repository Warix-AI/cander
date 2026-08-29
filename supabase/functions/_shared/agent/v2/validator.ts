import type { AnswerValidation, EvidenceBriefing, TurnCapabilities } from "./types.ts";
import { isModelLimitationDeflection } from "../policy.ts";

const DELEGATION =
  /\b(you (can|should|could)|try )?(check|visit|look up|search( online)?|go to)\b[\s\S]{0,40}\b(website|site|cnn|bbc|weather\.com|accuweather|google)\b/i;

/**
 * Deterministic validator first; structured model validator is optional complement.
 */
export function validateAnswerDeterministic(opts: {
  answer: string;
  userRequest: string;
  capabilities: TurnCapabilities;
  evidenceCount: number;
  webAttempted: boolean;
  liveLikely: boolean;
  briefing: EvidenceBriefing | null;
}): AnswerValidation {
  const issues: string[] = [];
  const a = opts.answer.trim();

  if (!a) {
    return {
      valid: false,
      issues: ["EMPTY_ANSWER"],
      recommendedAction: "regenerate",
    };
  }

  if (isModelLimitationDeflection(a)) {
    issues.push("PROVIDER_LIMITATION_LEAK");
  }
  if (DELEGATION.test(a) && opts.capabilities.webSearch) {
    issues.push("UNNECESSARY_USER_DELEGATION");
  }
  if (opts.liveLikely && opts.capabilities.webSearch && !opts.webAttempted) {
    issues.push("MISSING_RETRIEVAL");
  }
  if (
    opts.liveLikely &&
    opts.webAttempted &&
    opts.evidenceCount === 0 &&
    !/couldn'?t (retrieve|find)|unable to (retrieve|find)|no (reliable )?live/i.test(
      a,
    )
  ) {
    issues.push("UNRESOLVED_CURRENT_FACT");
  }
  if (
    opts.briefing &&
    opts.briefing.unresolved.length > 0 &&
    opts.briefing.facts.length === 0 &&
    opts.capabilities.webSearch &&
    opts.webAttempted
  ) {
    issues.push("UNRESOLVED_CURRENT_FACT");
  }

  if (issues.includes("MISSING_RETRIEVAL")) {
    return {
      valid: false,
      issues,
      recommendedAction: "retrieve_more",
    };
  }
  if (
    issues.includes("PROVIDER_LIMITATION_LEAK") ||
    issues.includes("UNNECESSARY_USER_DELEGATION")
  ) {
    return {
      valid: false,
      issues,
      recommendedAction: opts.evidenceCount > 0 ? "regenerate" : "retrieve_more",
    };
  }
  if (issues.includes("UNRESOLVED_CURRENT_FACT")) {
    return {
      valid: false,
      issues,
      recommendedAction: "retrieve_more",
    };
  }

  return { valid: true, issues: [], recommendedAction: "accept" };
}
