/**
 * Deterministic fast paths — greetings / math / rewrite only.
 * Everything else goes through the controller loop.
 */

import type { ControllerDecision } from "./types.ts";

const GREETING =
  /^(hi|hey|hello|yo|sup|howdy|good (morning|afternoon|evening))[.!]?$/i;
const THANKS = /^(thanks|thank you|thx|ty)[.!]?$/i;
const SIMPLE_MATH = /^(what('?s| is)\s+)?\d+\s*[\+\-\*\/x×]\s*\d+\s*\??$/i;
const REWRITE_ONLY =
  /^(please\s+)?(rewrite|rephrase|summarize|shorten|expand|proofread)\b/i;

export function tryFastPath(content: string): ControllerDecision | null {
  const t = content.trim();
  if (!t) {
    return {
      action: "answer",
      reasonCode: "EMPTY",
      canAnswerNow: true,
      complexity: "trivial",
    };
  }
  if (GREETING.test(t) || THANKS.test(t) || SIMPLE_MATH.test(t)) {
    return {
      action: "answer",
      reasonCode: "TRIVIAL_DIRECT",
      canAnswerNow: true,
      complexity: "trivial",
    };
  }
  if (REWRITE_ONLY.test(t) && t.length < 400) {
    return {
      action: "answer",
      reasonCode: "REWRITE_DIRECT",
      canAnswerNow: true,
      complexity: "trivial",
    };
  }
  return null;
}

/** High-recall hints for controller (not exclusive routing). */
export function liveInfoHint(content: string): boolean {
  return /\b(latest|current|today|tonight|now|news|weather|forecast|price|score|ceo|announc|going on|happening|this week|out yet|released|yesterday|this morning|right now|internet|online|search the web|look up online)\b/i.test(
    content,
  );
}

export function internalKnowledgeHint(content: string): boolean {
  return /\b(our|we|workspace|knowledge|max plan|pro plan|pricing|policy|internal)\b/i.test(
    content,
  );
}
