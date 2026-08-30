/**
 * Deterministic grounding checks for local FM answers.
 */

import type { TurnEvidence } from "./evidence.ts";
import { requiresExternalEvidence } from "./deterministic-triggers.ts";

const CLAIMED_BROWSE =
  /\b(i (visited|opened|read|checked)|according to (the )?(site|page|website)|on (their|the) (site|homepage|website))\b/i;

const DELEGATION =
  /\b(you (can|should)|try )?(check|visit|look up|search( online)?|go to)\b[\s\S]{0,40}\b(website|site|cnn|bbc|weather\.com)\b/i;

/** FM hedges as if no data despite usable retrieved snippets. */
const HEDGE_NO_DATA =
  /\b(don'?t have|do not have|no (live )?calorie|no (live )?nutrition|couldn'?t (find|retrieve|get)|unable to (find|retrieve)|check the .{0,40}(nutrition|website|page|calculator)|use their online calculator|i don'?t have live)\b/i;

export type GroundingValidation = {
  valid: boolean;
  issues: string[];
  recommendedAction: "show" | "fail_closed" | "retry_tools" | "use_evidence_fallback";
};

export function hasUsableEvidenceSnippets(evidence: TurnEvidence[]): boolean {
  return evidence.some(
    (e) =>
      e.ok &&
      e.content.trim().length >= 20 &&
      (e.kind === "web_page" ||
        e.kind === "search_result" ||
        e.kind === "browser" ||
        e.kind === "knowledge"),
  );
}

export function validateLocalGrounding(opts: {
  answer: string;
  userRequest: string;
  evidence: TurnEvidence[];
  retrievalAttempted: boolean;
}): GroundingValidation {
  const issues: string[] = [];
  const answer = opts.answer.trim();
  const needsExternal = requiresExternalEvidence(opts.userRequest);
  const okEvidence = opts.evidence.filter((e) => e.ok && e.content.trim());
  const webEvidence = okEvidence.filter(
    (e) =>
      e.kind === "web_page" ||
      e.kind === "search_result" ||
      e.kind === "browser",
  );
  const retrievalDone = opts.retrievalAttempted || webEvidence.length > 0;
  const usable = hasUsableEvidenceSnippets(opts.evidence);

  if (!answer) {
    return { valid: false, issues: ["EMPTY_ANSWER"], recommendedAction: "fail_closed" };
  }

  if (needsExternal && !retrievalDone) {
    issues.push("MISSING_RETRIEVAL");
  }

  if (
    needsExternal &&
    retrievalDone &&
    webEvidence.length === 0 &&
    !/couldn'?t (retrieve|open|find|read)|unable to (retrieve|open|find|read|view)|no (live )?sources|no active browser/i.test(
      answer,
    )
  ) {
    issues.push("UNRESOLVED_EXTERNAL_FACT");
  }

  if (CLAIMED_BROWSE.test(answer) && webEvidence.length === 0) {
    issues.push("FALSE_BROWSE_CLAIM");
  }

  if (DELEGATION.test(answer) && needsExternal) {
    issues.push("UNNECESSARY_DELEGATION");
  }

  if (usable && HEDGE_NO_DATA.test(answer)) {
    issues.push("HEDGE_DESPITE_EVIDENCE");
    return {
      valid: false,
      issues,
      recommendedAction: "use_evidence_fallback",
    };
  }

  if (issues.includes("MISSING_RETRIEVAL") || issues.includes("UNRESOLVED_EXTERNAL_FACT")) {
    return { valid: false, issues, recommendedAction: "fail_closed" };
  }

  if (issues.includes("FALSE_BROWSE_CLAIM")) {
    return { valid: false, issues, recommendedAction: "retry_tools" };
  }

  return { valid: issues.length === 0, issues, recommendedAction: "show" };
}

export function failClosedMessage(issues: string[]): string {
  if (issues.includes("MISSING_RETRIEVAL") || issues.includes("UNRESOLVED_EXTERNAL_FACT")) {
    return "I couldn't read the active page or retrieve live information for that, so I won't guess. Select a tab in the right panel and try again.";
  }
  return "I couldn't verify that answer against retrieved sources.";
}
