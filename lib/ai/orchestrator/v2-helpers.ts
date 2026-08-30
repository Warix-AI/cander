/**
 * Client mirrors of V2 helpers for unit tests.
 */

const GREETING =
  /^(hi|hey|hello|yo|sup|howdy|good (morning|afternoon|evening))[.!]?$/i;
const THANKS = /^(thanks|thank you|thx|ty)[.!]?$/i;
const SIMPLE_MATH = /^(what('?s| is)\s+)?\d+\s*[\+\-\*\/x×]\s*\d+\s*\??$/i;

export function tryFastPathAction(
  content: string,
): "answer" | null {
  const t = content.trim();
  if (GREETING.test(t) || THANKS.test(t) || SIMPLE_MATH.test(t)) return "answer";
  return null;
}

export function liveInfoHint(content: string): boolean {
  return /\b(latest|current|today|tonight|now|news|weather|forecast|price|score|ceo|announc|going on|happening|this week|out yet|released|yesterday|this morning|right now|internet|online|search the web|look up online|calories?|calorie|nutrition|nutritional|menu|protein\s+style|in-?n-?out)\b/i.test(
    content,
  );
}

export type WorkingMemoryLite = {
  activeEntity?: string;
  activeTopic?: string;
  recentLists?: Array<{
    id: string;
    items: Array<{ ordinal: number; label: string }>;
  }>;
  recentReferences?: string[];
  entities?: string[];
  references?: Array<{ phrase: string; resolvesTo: string }>;
};

export {
  detectReferenceIntent,
  extractEntityFromDomain,
  resolveReference,
} from "./memory-retrieval.ts";

export function validateAnswerLite(opts: {
  answer: string;
  liveLikely: boolean;
  webAvailable: boolean;
  webAttempted: boolean;
  evidenceCount: number;
}): { valid: boolean; issues: string[]; recommendedAction: string } {
  const issues: string[] = [];
  if (/\bknowledge cutoff\b/i.test(opts.answer) || /\bi don'?t have real[- ]?time\b/i.test(opts.answer)) {
    issues.push("PROVIDER_LIMITATION_LEAK");
  }
  if (
    /\bcheck\b[\s\S]{0,30}\b(weather\.com|cnn|bbc)\b/i.test(opts.answer) &&
    opts.webAvailable
  ) {
    issues.push("UNNECESSARY_USER_DELEGATION");
  }
  if (opts.liveLikely && opts.webAvailable && !opts.webAttempted) {
    issues.push("MISSING_RETRIEVAL");
  }
  if (issues.includes("MISSING_RETRIEVAL")) {
    return { valid: false, issues, recommendedAction: "retrieve_more" };
  }
  if (issues.length) {
    return {
      valid: false,
      issues,
      recommendedAction: opts.evidenceCount > 0 ? "regenerate" : "retrieve_more",
    };
  }
  return { valid: true, issues: [], recommendedAction: "accept" };
}

/** Simulated controller loop for tests (no network). */
export function simulateControllerLoop(steps: Array<{ action: string }>): {
  webSearches: number;
  webOpens: number;
  answered: boolean;
} {
  let webSearches = 0;
  let webOpens = 0;
  let answered = false;
  const max = 8;
  for (let i = 0; i < Math.min(steps.length, max); i++) {
    const a = steps[i].action;
    if (a === "web_search") webSearches++;
    if (a === "web_open") webOpens++;
    if (a === "answer") {
      answered = true;
      break;
    }
  }
  return { webSearches, webOpens, answered };
}
