/**
 * Deterministic grounding checks for local FM answers.
 */

import type { TurnEvidence } from "./evidence.ts";
import { requiresExternalEvidence } from "./deterministic-triggers.ts";

const CLAIMED_BROWSE =
  /\b(i (visited|opened|read|checked)|according to (the )?(site|page|website)|on (their|the) (site|homepage|website))\b/i;

const DELEGATION =
  /\b(you (can|should)|try )?(check|visit|look up|search( online)?|go to)\b[\s\S]{0,40}\b(website|site|cnn|bbc|weather\.com)\b/i;

export type GroundingValidation = {
  valid: boolean;
  issues: string[];
  recommendedAction: "show" | "fail_closed" | "retry_tools";
};

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

  if (!answer) {
    return { valid: false, issues: ["EMPTY_ANSWER"], recommendedAction: "fail_closed" };
  }

  if (needsExternal && !opts.retrievalAttempted) {
    issues.push("MISSING_RETRIEVAL");
  }

  if (
    needsExternal &&
    opts.retrievalAttempted &&
    webEvidence.length === 0 &&
    !/couldn'?t (retrieve|open|find)|unable to (retrieve|open|find)|no (live )?sources/i.test(
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
    return "I couldn't retrieve live information for that request, so I won't guess. Check your connection or try again in a moment.";
  }
  return "I couldn't verify that answer against retrieved sources.";
}
