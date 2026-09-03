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
        "Lead with the combined total. Then bullet each component with its value. End with a bold Total line. Add numbers deterministically from evidence — never invent. Prefer this breakdown over a paragraph.",
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
    decision: {
      kind: "decision",
      maxSentences: 10,
      preferBullets: true,
      preferTable: true,
      allowHeadings: false,
      maxEvidenceItems: 6,
      maxEvidenceChars: 3000,
      formatHint:
        "Frame a clear choice. Use criteria when useful (decision matrix or weighted comparison). End with a recommendation.",
    },
    process: {
      kind: "process",
      maxSentences: 12,
      preferBullets: false,
      preferTable: false,
      allowHeadings: false,
      maxEvidenceItems: 6,
      maxEvidenceChars: 2800,
      formatHint:
        "Explain the workflow as ordered stages. Prefer a process block with labeled steps over ASCII diagrams.",
    },
    timeline: {
      kind: "timeline",
      maxSentences: 12,
      preferBullets: true,
      preferTable: false,
      allowHeadings: false,
      maxEvidenceItems: 6,
      maxEvidenceChars: 2800,
      formatHint:
        "Present events in chronological order. Prefer a timeline presentation or numbered stages.",
    },
    ranking: {
      kind: "ranking",
      maxSentences: 10,
      preferBullets: true,
      preferTable: false,
      allowHeadings: false,
      maxEvidenceItems: 6,
      maxEvidenceChars: 2600,
      formatHint:
        "Rank options clearly (1, 2, 3…). Give a short reason per item. Prefer a ranking block when listing ordered recommendations.",
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
    /\b(decision\s+matrix|weighted\s+score|evaluate\s+(against|by)\s+criteria|multi[- ]criteria|which\s+should\s+i\s+(pick|choose)|help\s+me\s+decide)\b/i.test(
      lower,
    )
  ) {
    return shapeFor("decision");
  }

  if (
    /\b(workflow|pipeline|lifecycle|architecture\s+flow|process\s+flow|how\s+(does|do)\s+.+\s+work\s+end[- ]to[- ]end|stages?\s+of)\b/i.test(
      lower,
    )
  ) {
    return shapeFor("process");
  }

  if (
    /\b(timeline|chronolog|roadmap|history\s+of\s+events|sequence\s+of\s+events|over\s+time)\b/i.test(
      lower,
    )
  ) {
    return shapeFor("timeline");
  }

  if (
    /\b(rank(ing|ed)?\b|best\s+to\s+worst|from\s+best\s+to\s+worst|order\s+(these|them)|prioritiz(e|ing|ation))\b/i.test(
      lower,
    )
  ) {
    return shapeFor("ranking");
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
    ) ||
    (lower.includes(",") &&
      /\b(half|calories?|cal|bowl|combo|with)\b/i.test(lower) &&
      lower.split(/,/).length >= 2)
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
    /\b(list|top \d+|which of|options|examples of|names of|what are the|list\s+(every|all|each)|every\s+\w+|all\s+of\s+(them|it)|complete\s+(list|schedule)|full\s+(list|schedule)|show\s+(me\s+)?(all|every))\b/i.test(
      lower,
    ) ||
    /\bhow many (different|kinds|types)\b/i.test(lower)
  ) {
    return shapeFor("list");
  }

  if (
    /\b(table|tabular|in\s+a\s+table|as\s+a\s+table)\b/i.test(lower)
  ) {
    return shapeFor("comparison", {
      preferTable: true,
      formatHint:
        "Use a markdown table with a header row. One item per row.",
    });
  }

  if (
    /\b(paragraphs?|in\s+prose|explain\s+(that|it|this)|go\s+deeper|more\s+detail|expand|elaborate)\b/i.test(
      lower,
    )
  ) {
    return shapeFor("explanation", {
      maxSentences: /\b(go\s+deeper|more\s+detail|expand|elaborate|thorough)\b/i.test(
        lower,
      )
        ? 14
        : 8,
    });
  }

  if (
    /\b(explain|why |how (does|do|can|to) |what (causes|means|is the difference)|walk me through)\b/i.test(
      lower,
    )
  ) {
    return shapeFor("explanation");
  }

  // Short factual asks: who/what/when/where/how much/how many + short question
  // Prefer fact for pure counts; list patterns already handled above.
  const wordCount = q.split(/\s+/).filter(Boolean).length;
  if (
    wordCount <= 28 &&
    /\b(who|what|when|where|how much|how many|is |are |does |did |price|cost|calories?|population|founded|born|just the answer)\b/i.test(
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
