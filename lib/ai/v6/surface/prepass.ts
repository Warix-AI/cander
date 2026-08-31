/**
 * Stage 1 — Surface prepass.
 * Independent structural estimate of the user message (not full semantics).
 */

import type { SurfaceExpectation, SurfaceSpan } from "../types.ts";

const URL_RE = /https?:\/\/[^\s]+/gi;
const MATH_RE =
  /\b(\d+\s*[\+\-\*\/x×÷]\s*\d+|what(?:'| i)?s?\s+\d+\s*[\+\-\*\/x×÷]|calculate|how many|calories?|shares?\s+cost)\b/i;
const TEMPORAL_RE =
  /\b(today|yesterday|tomorrow|last\s+time|this\s+week|next\s+week|now|current|currently|ago|tonight)\b/i;
const PRIOR_CHAT_RE =
  /\b(we\s+talked\s+about|last\s+time|yesterday|that\s+company|the\s+one\s+from\s+before|what\s+did\s+i\s+decide|you\s+remember|earlier\s+(in\s+)?(our|this)\s+chat)\b/i;
const CONTEXT_RE =
  /\b(that|this|those|these|he|she|they|it|the\s+(same|one)|our\s+\w+)\b/i;
const FILE_RE =
  /\b(handbook|document|file|pdf|upload|attachment|knowledge\s*base|kb)\b/i;
const CONJ_RE = /\b(and|also|plus|as\s+well|then)\b/i;
const ENUM_RE = /(?:^|[;,\n])\s*(?:\d+[\.\)]\s+|[-•]\s+)/;

function splitClauses(text: string): string[] {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return [];

  // Prefer splitting before question/imperative clauses (comma or "and")
  const byAsk = cleaned
    .split(
      /(?:,\s*|\s+and\s+)(?=(?:how|what|who|where|when|why|explain|compare|summarize|research)\b)/i,
    )
    .map((s) => s.trim().replace(/^and\s+/i, "").trim())
    .filter(Boolean);

  if (byAsk.length > 1) return byAsk;

  // Multi-item lists: "... tacos and a medium Sprite"
  if (
    /\b(calories?|cost|price|how many)\b/i.test(cleaned) &&
    /\sand\s+(a|an|the|\d+)/i.test(cleaned)
  ) {
    const items = cleaned
      .split(/\s+and\s+(?=a\s+|an\s+|the\s+|\d+)/i)
      .map((s) => s.trim())
      .filter(Boolean);
    if (items.length > 1) return items;
  }

  // Split on ? or ; or newlines — not bare "and" (avoids "BYU and Utah")
  const parts: string[] = [];
  let buf = "";
  const tokens = cleaned.split(/(?<=\?)|(?:;\s+)|(?:\n+)/);

  for (const raw of tokens) {
    const t = raw.trim();
    if (!t) continue;
    if (buf) parts.push(buf);
    buf = t;
  }
  if (buf) parts.push(buf);

  return parts.length ? parts : [cleaned];
}

function classifySpan(text: string): SurfaceSpan["type"] {
  if (/^(if|when|unless|provided\s+that)\b/i.test(text)) return "condition";
  if (/^(only|without|except|must|should|don't|do not)\b/i.test(text)) {
    return "constraint";
  }
  if (
    /^(that|this|those|these|he|she|they|it)\b/i.test(text) &&
    text.split(/\s+/).length <= 4
  ) {
    return "reference";
  }
  return "probable_request";
}

export function surfacePrepass(input: string): SurfaceExpectation {
  const text = (input || "").trim();
  const clauses = splitClauses(text);
  const spans: SurfaceSpan[] = clauses.map((c, i) => ({
    id: `span_${i + 1}`,
    text: c.replace(/\?+$/, "").trim() || c,
    type: classifySpan(c),
  }));

  const probable = spans.filter((s) => s.type === "probable_request");
  const hasUrl = URL_RE.test(text);
  URL_RE.lastIndex = 0;

  return {
    spans,
    signals: {
      probableRequestCount: probable.length || (text ? 1 : 0),
      hasQuestionMarks: /\?/.test(text),
      hasConjunctions: CONJ_RE.test(text),
      hasEnumeration: ENUM_RE.test(text),
      hasUrl,
      hasFileReference: FILE_RE.test(text),
      hasMath: MATH_RE.test(text),
      hasTemporalReference: TEMPORAL_RE.test(text),
      hasContextReference: CONTEXT_RE.test(text),
      hasPriorChatReference: PRIOR_CHAT_RE.test(text),
    },
  };
}

/** Pure arithmetic like "what is 17*3?" */
export function isPureArithmetic(text: string): boolean {
  const t = text.trim();
  return (
    /^(what(?:'| i)?s?\s+)?\d+\s*[\+\-\*\/x×÷]\s*\d+\s*\??$/i.test(t) ||
    /^calculate\s+\d+\s*[\+\-\*\/x×÷]\s*\d+\s*\??$/i.test(t)
  );
}

/** Short greeting / thanks with no factual ask */
export function isSimpleConversational(text: string): boolean {
  const t = text.trim();
  if (t.length > 80) return false;
  return /^(hi|hello|hey|thanks|thank you|ok|okay|cool|got it|sounds good|bye|good morning|good night)[\s!.]*$/i.test(
    t,
  );
}

export function extractFirstUrl(text: string): string | null {
  const m = text.match(/https?:\/\/[^\s]+/i);
  return m?.[0]?.replace(/[.,;:!?)]+$/, "") ?? null;
}
