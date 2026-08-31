/**
 * Deterministic grounding checks for local FM answers.
 */

import type { TurnEvidence } from "./evidence.ts";
import { requiresExternalEvidence } from "./deterministic-triggers.ts";
import {
  answerClaimsUnsupportedCurrentFact,
  isRetrievalRequiredForTurn,
} from "./retrieval-requirements.ts";
import type { ConversationTurnState } from "@/lib/ai/turn-environment/conversation-types.ts";
import type { TurnTaskResolution } from "@/lib/ai/turn-environment/turn-task.ts";
import type { TemporalGrounding } from "./temporal-grounding.ts";

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
        e.kind === "exa_synthesis" ||
        e.kind === "browser" ||
        e.kind === "knowledge"),
  );
}

function findExaDirectEvidence(
  evidence: TurnEvidence[],
): TurnEvidence | undefined {
  return evidence.find(
    (e) => e.ok && e.kind === "exa_synthesis" && e.content.trim().length >= 8,
  );
}

/** Detect FM substituting facts from a grounded Exa direct answer. */
function answerContradictsDirectAnswer(answer: string, direct: string): boolean {
  const a = answer.toLowerCase();
  const d = direct.toLowerCase();

  const entities = (text: string) =>
    (text.match(/\b[a-z]+(?:\s+[a-z]+){0,2}\b/g) ?? []).filter(
      (phrase) =>
        phrase.length >= 5 &&
        !/^(opens|against|first|football|season|game|september|october|november|december|january|february|march|april|may|june|july|august)$/.test(
          phrase,
        ),
    );

  const directEntities = [...new Set(entities(d))];
  const answerEntities = [...new Set(entities(a))];

  const directInAnswer = directEntities.filter((e) => a.includes(e));
  const foreignInAnswer = answerEntities.filter((e) => !d.includes(e));

  if (directEntities.length >= 1 && directInAnswer.length === 0 && foreignInAnswer.length >= 1) {
    return true;
  }

  const monthDay =
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})\b/gi;
  const directDates = [...direct.matchAll(monthDay)].map((m) => m[0].toLowerCase());
  const answerDates = [...answer.matchAll(monthDay)].map((m) => m[0].toLowerCase());
  if (
    directDates.length > 0 &&
    answerDates.length > 0 &&
    !answerDates.some((ad) => directDates.includes(ad))
  ) {
    return true;
  }

  return false;
}

export function validateLocalGrounding(opts: {
  answer: string;
  userRequest: string;
  evidence: TurnEvidence[];
  retrievalAttempted: boolean;
  retrievalRequired?: boolean;
  turnTask?: TurnTaskResolution;
  temporalGrounding?: TemporalGrounding | null;
  conversationState?: ConversationTurnState | null;
}): GroundingValidation {
  const issues: string[] = [];
  const answer = opts.answer.trim();
  const needsExternal =
    opts.retrievalRequired ??
    (isRetrievalRequiredForTurn({
      turnTask: opts.turnTask,
      temporalGrounding: opts.temporalGrounding,
      conversationState: opts.conversationState,
    }) ||
      requiresExternalEvidence(opts.userRequest));
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
    !usable &&
    answerClaimsUnsupportedCurrentFact(answer, opts.evidence)
  ) {
    issues.push("UNGROUNDED_CURRENT_FACT");
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

  const direct = findExaDirectEvidence(opts.evidence);
  if (direct && answerContradictsDirectAnswer(answer, direct.content)) {
    issues.push("ALTERED_DIRECT_ANSWER");
    return {
      valid: false,
      issues,
      recommendedAction: "use_evidence_fallback",
    };
  }

  if (
    issues.includes("MISSING_RETRIEVAL") ||
    issues.includes("UNRESOLVED_EXTERNAL_FACT") ||
    issues.includes("UNGROUNDED_CURRENT_FACT")
  ) {
    return { valid: false, issues, recommendedAction: "fail_closed" };
  }

  if (issues.includes("FALSE_BROWSE_CLAIM")) {
    return { valid: false, issues, recommendedAction: "retry_tools" };
  }

  return { valid: issues.length === 0, issues, recommendedAction: "show" };
}

export function failClosedMessage(issues: string[]): string {
  if (
    issues.includes("MISSING_RETRIEVAL") ||
    issues.includes("UNRESOLVED_EXTERNAL_FACT") ||
    issues.includes("UNGROUNDED_CURRENT_FACT")
  ) {
    return "I couldn't retrieve live information for that question, so I won't guess. Please try again in a moment.";
  }
  return "I couldn't verify that answer against retrieved sources.";
}
