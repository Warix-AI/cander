/**
 * Infer answer shape from the user question — generic heuristics only.
 * No domain-specific templates (nutrition, prices, etc.).
 */

import type { AnswerShape, AnswerShapeKind } from "./types.ts";

function shapeFor(
  kind: AnswerShapeKind,
  overrides: Partial<AnswerShape> = {},
): AnswerShape {
  const defaults: Record<AnswerShapeKind, AnswerShape> = {
    fact: {
      kind: "fact",
      maxSentences: 3,
      preferBullets: false,
      preferTable: false,
      allowHeadings: false,
      maxEvidenceItems: 4,
      maxEvidenceChars: 1800,
      formatHint: "Lead with the direct answer in 1–3 sentences. No preamble.",
    },
    list: {
      kind: "list",
      maxSentences: 8,
      preferBullets: true,
      preferTable: false,
      allowHeadings: false,
      maxEvidenceItems: 6,
      maxEvidenceChars: 2400,
      formatHint: "Use a short bullet list. One idea per bullet. Keep each bullet to one line when possible.",
    },
    calculation: {
      kind: "calculation",
      maxSentences: 5,
      preferBullets: true,
      preferTable: false,
      allowHeadings: false,
      maxEvidenceItems: 5,
      maxEvidenceChars: 2000,
      formatHint:
        "State the relevant values briefly, then the calculated result. Show arithmetic only when it clarifies the answer.",
    },
    comparison: {
      kind: "comparison",
      maxSentences: 8,
      preferBullets: true,
      preferTable: true,
      allowHeadings: false,
      maxEvidenceItems: 6,
      maxEvidenceChars: 2800,
      formatHint:
        "Use a compact comparison (bullets or a small markdown table). Highlight differences that matter to the question.",
    },
    explanation: {
      kind: "explanation",
      maxSentences: 8,
      preferBullets: false,
      preferTable: false,
      allowHeadings: false,
      maxEvidenceItems: 5,
      maxEvidenceChars: 2600,
      formatHint: "Use short paragraphs. Explain only what the question asks — no essay.",
    },
    recommendation: {
      kind: "recommendation",
      maxSentences: 6,
      preferBullets: true,
      preferTable: false,
      allowHeadings: false,
      maxEvidenceItems: 5,
      maxEvidenceChars: 2400,
      formatHint:
        "Lead with the recommendation, then 2–4 brief supporting bullets. Mention uncertainty if evidence conflicts.",
    },
    research: {
      kind: "research",
      maxSentences: 16,
      preferBullets: true,
      preferTable: false,
      allowHeadings: true,
      maxEvidenceItems: 8,
      maxEvidenceChars: 4200,
      formatHint:
        "Use a structured response with short sections only if needed. Still lead with the bottom line.",
    },
  };
  return { ...defaults[kind], ...overrides, kind };
}

/**
 * Infer how to shape the final answer from the user's question alone.
 * Completely domain-agnostic.
 */
export function inferAnswerShape(userQuestion: string): AnswerShape {
  const q = userQuestion.trim();
  const lower = q.toLowerCase();

  if (
    /\b(deep\s+research|thorough\s+(analysis|research|review)|comprehensive|in[- ]depth|literature\s+review)\b/i.test(
      q,
    )
  ) {
    return shapeFor("research");
  }

  if (
    /\b(compare|comparison|versus|\bvs\.?\b|difference between|pros and cons|which is better)\b/i.test(
      lower,
    )
  ) {
    return shapeFor("comparison");
  }

  if (
    /\b(total|sum|add(?:\s+up)?|calculate|how much (in total|altogether)|combined|times |multipl|divid|percent|% of)\b/i.test(
      lower,
    )
  ) {
    return shapeFor("calculation");
  }

  if (
    /\b(recommend|should i|best (option|choice|way)|what (should|would) you|advise|suggest)\b/i.test(
      lower,
    )
  ) {
    return shapeFor("recommendation");
  }

  if (
    /\b(list|top \d+|which of|options|examples of|names of|what are the)\b/i.test(
      lower,
    ) ||
    /\bhow many (different|kinds|types)\b/i.test(lower)
  ) {
    return shapeFor("list");
  }

  if (
    /\b(explain|why |how (does|do|can|to) |what (causes|means|is the difference)|walk me through)\b/i.test(
      lower,
    )
  ) {
    return shapeFor("explanation");
  }

  // Short factual asks: who/what/when/where/how much/how many + short question
  const wordCount = q.split(/\s+/).filter(Boolean).length;
  if (
    wordCount <= 28 &&
    /\b(who|what|when|where|how much|how many|is |are |does |did |price|cost|calories?|population|founded|born)\b/i.test(
      lower,
    )
  ) {
    return shapeFor("fact");
  }

  if (wordCount > 40 || /\b(background|overview|history of|tell me about)\b/i.test(lower)) {
    return shapeFor("explanation", { maxSentences: 10, allowHeadings: false });
  }

  return shapeFor("fact");
}
