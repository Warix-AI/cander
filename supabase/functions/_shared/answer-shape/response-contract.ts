/**
 * Dynamic response contract — ties answer shape to output budget + completion.
 * Dependency-free for Deno Edge + Next.
 *
 * CURRENT TURN controls task and answer shape. Prior turns are context only.
 */

import type { AnswerShape, AnswerShapeKind } from "./types.ts";
import { inferAnswerShape } from "./infer.ts";

export type ResponseDepth = "brief" | "standard" | "detailed";

export type AnswerPresentation =
  | "short_answer"
  | "prose"
  | "bullet_list"
  | "numbered_steps"
  | "key_value"
  | "comparison"
  | "comparison_cards"
  | "table"
  | "list"
  | "checklist"
  | "timeline"
  | "hierarchy";

export type ResponseContract = {
  shape: AnswerShapeKind;
  presentation: AnswerPresentation;
  operation?: string;
  requestedFields: string[];
  requestedItemCount: number | null;
  depth: ResponseDepth;
  mustComplete: boolean;
  /** Soft output budget in approximate tokens (not a hard provider cap alone). */
  outputTokenBudget: number;
  maxSentences: number;
  preferBullets: boolean;
  preferTable: boolean;
  completionCriteria: string[];
};

export type InferResponseContractHints = {
  presentation?: AnswerPresentation;
  operation?: string;
  requestedFields?: string[];
  requestedItemCount?: number | null;
  depth?: ResponseDepth;
};

const ITEM_COUNT_RE =
  /\b(?:give\s+me\s+|list\s+|write\s+|share\s+|provide\s+|need\s+|want\s+)?(\d{1,2})\s+(?:\w+\s+){0,3}(?:bullet(?:\s*points?)?|points?|ideas?|examples?|tips?|reasons?|ways?|steps?|items?|suggestions?|options?|games?|entries|rows?)\b/i;

const DETAILED_RE =
  /\b(detailed|in[- ]depth|thorough|comprehensive|long(?:er)?\s+answer|explain\s+fully|walk\s+me\s+through|go\s+deeper|more\s+detail|expand|elaborate)\b/i;

const BRIEF_RE =
  /\b(brief|short|tl;?dr|one\s+sentence|in\s+a\s+nutshell|quickly|just\s+(the\s+)?answer)\b/i;

const LIST_ALL_RE =
  /\b(list\s+(every|all|each|the\s+full)|every\s+\w+|all\s+of\s+(them|it)|complete\s+(list|schedule|set)|full\s+(list|schedule)|show\s+(me\s+)?(all|every))\b/i;

export function extractRequestedItemCount(question: string): number | null {
  const m = question.match(ITEM_COUNT_RE);
  if (!m?.[1]) return null;
  const n = Number.parseInt(m[1], 10);
  if (!Number.isFinite(n) || n < 2 || n > 40) return null;
  return n;
}

export function inferResponseDepth(question: string): ResponseDepth {
  if (DETAILED_RE.test(question)) return "detailed";
  if (BRIEF_RE.test(question)) return "brief";
  return "standard";
}

function presentationFromQuestion(question: string): AnswerPresentation {
  const q = question.toLowerCase();
  if (/\b(org\s+chart|hierarchy|tree\s+structure|parent[- ]child|nested\s+structure)\b/.test(q)) {
    return "hierarchy";
  }
  if (/\b(timeline|chronolog|roadmap|over\s+time)\b/.test(q)) {
    return "timeline";
  }
  if (/\b(checklist|to[- ]?do\s+list|check\s+off)\b/.test(q)) {
    return "checklist";
  }
  if (
    /\b(comparison\s+cards?|side[- ]by[- ]side\s+cards?|option\s+cards?)\b/.test(q)
  ) {
    return "comparison_cards";
  }
  if (/\b(compare|versus|\bvs\.?\b|difference between)\b/.test(q)) {
    return "comparison";
  }
  if (/\b(table|tabular|columns?)\b/.test(q)) return "table";
  if (/\b(numbered|step[- ]by[- ]step|steps\b|workflow|pipeline|process)\b/.test(q)) {
    return "numbered_steps";
  }
  if (
    /\b(bullets?|bullet\s*points?|main\s+points|key\s+points)\b/.test(q) ||
    extractRequestedItemCount(question) != null
  ) {
    return "bullet_list";
  }
  if (/\b(paragraphs?|in\s+prose|explain)\b/.test(q)) return "prose";
  if (LIST_ALL_RE.test(question) || /\b(list|enumerate)\b/.test(q)) {
    return "list";
  }
  if (/\b(how\s+many|just\s+the\s+answer|one\s+sentence)\b/.test(q)) {
    return "short_answer";
  }
  return "short_answer";
}

function shapeFromPresentation(
  presentation: AnswerPresentation,
  fallback: AnswerShape,
): AnswerShapeKind {
  switch (presentation) {
    case "comparison":
    case "comparison_cards":
    case "table":
      return "comparison";
    case "prose":
      return "explanation";
    case "bullet_list":
    case "numbered_steps":
    case "list":
    case "checklist":
      return presentation === "numbered_steps" &&
        fallback.kind === "process"
        ? "process"
        : "list";
    case "timeline":
      return "timeline";
    case "hierarchy":
      return fallback.kind === "process" ? "process" : "explanation";
    case "key_value":
    case "short_answer":
      return fallback.kind === "calculation" ? "calculation" : "fact";
    default:
      return fallback.kind;
  }
}

function outputBudgetFor(opts: {
  shape: AnswerShape;
  itemCount: number | null;
  depth: ResponseDepth;
  presentation: AnswerPresentation;
  operation?: string;
}): number {
  const base =
    opts.depth === "detailed" ? 900 : opts.depth === "brief" ? 220 : 420;
  if (opts.itemCount) {
    const perItem =
      opts.depth === "detailed" ? 90 : opts.depth === "brief" ? 35 : 55;
    return Math.max(base, opts.itemCount * perItem + 80);
  }
  if (opts.operation === "list" || opts.presentation === "list") {
    return Math.max(base, 1000);
  }
  if (opts.presentation === "table") return Math.max(base, 900);
  if (opts.presentation === "prose" && opts.depth === "detailed") {
    return Math.max(base, 1100);
  }
  if (opts.shape.kind === "research") return Math.max(base, 1100);
  if (opts.shape.kind === "comparison") return Math.max(base, 560);
  if (opts.shape.kind === "list") return Math.max(base, 480);
  return base;
}

function maxSentencesFor(opts: {
  shape: AnswerShape;
  itemCount: number | null;
  depth: ResponseDepth;
  presentation: AnswerPresentation;
}): number {
  if (opts.itemCount) {
    return Math.max(opts.shape.maxSentences, opts.itemCount + 1);
  }
  if (opts.presentation === "list" || opts.presentation === "table") {
    return Math.max(opts.shape.maxSentences, 16);
  }
  if (opts.depth === "detailed") {
    return Math.max(opts.shape.maxSentences, 14);
  }
  if (opts.depth === "brief" || opts.presentation === "short_answer") {
    return Math.min(opts.shape.maxSentences, 4);
  }
  return opts.shape.maxSentences;
}

function formatHintFor(
  presentation: AnswerPresentation,
  itemCount: number | null,
  depth: ResponseDepth,
  fields: string[],
  baseHint: string,
): string {
  const fieldBit = fields.length
    ? ` Include these fields when available: ${fields.join(", ")}.`
    : "";
  switch (presentation) {
    case "short_answer":
      return `Lead with the direct answer in 1–2 sentences.${fieldBit}`;
    case "prose":
      return depth === "detailed"
        ? `Use clear paragraphs. Go deeper than a summary.${fieldBit}`
        : `Use short paragraphs. Explain only what was asked.${fieldBit}`;
    case "bullet_list":
      return itemCount != null
        ? `Provide exactly ${itemCount} complete bullet points. Each item must be finished.${fieldBit}`
        : `Use a short bullet list. One idea per bullet.${fieldBit}`;
    case "numbered_steps":
      return itemCount != null
        ? `Provide exactly ${itemCount} numbered steps, each complete.${fieldBit}`
        : `Use a numbered step list.${fieldBit}`;
    case "key_value":
      return `Use compact key–value lines or short labeled facts.${fieldBit}`;
    case "comparison":
      return `Use a compact comparison (bullets or a small markdown table).${fieldBit}`;
    case "comparison_cards":
      return `Use compact comparison cards for each option (label + key differences). Prefer a comparison_card block.${fieldBit}`;
    case "table":
      return `Use a markdown table with a header row when listing structured items.${fieldBit}`;
    case "checklist":
      return `Use a checklist with clear actionable items.${fieldBit}`;
    case "timeline":
      return `Present items in chronological order as a timeline or ordered stages.${fieldBit}`;
    case "hierarchy":
      return `Show parent/child structure as a hierarchy (indented tree). Prefer a hierarchy block.${fieldBit}`;
    case "list":
      return `Provide a complete list of matching items — do not stop at a count or summary.${fieldBit}`;
    default:
      return `${baseHint}${fieldBit}`;
  }
}

/** Infer contract from the user question + optional turn-task hints. */
export function inferResponseContract(
  question: string,
  hints?: InferResponseContractHints,
): ResponseContract {
  const shape = inferAnswerShape(question);
  const requestedItemCount =
    hints?.requestedItemCount !== undefined
      ? hints.requestedItemCount
      : extractRequestedItemCount(question);
  const depth = hints?.depth ?? inferResponseDepth(question);
  const presentation = hints?.presentation ?? presentationFromQuestion(question);
  const requestedFields = hints?.requestedFields ?? [];
  const operation = hints?.operation;
  const kind = shapeFromPresentation(presentation, shape);
  const mustComplete =
    requestedItemCount != null ||
    depth === "detailed" ||
    presentation === "list" ||
    presentation === "table" ||
    operation === "list" ||
    operation === "add_fields";

  const completionCriteria = [
    "answers_current_question",
    `presentation:${presentation}`,
    `depth:${depth}`,
  ];
  if (requestedItemCount != null) {
    completionCriteria.push(`item_count:${requestedItemCount}`);
  }
  if (requestedFields.length) {
    completionCriteria.push(`fields:${requestedFields.join(",")}`);
  }
  if (presentation === "list" || operation === "list") {
    completionCriteria.push("complete_list");
  }

  return {
    shape: kind,
    presentation,
    operation,
    requestedFields,
    requestedItemCount,
    depth,
    mustComplete,
    outputTokenBudget: outputBudgetFor({
      shape: { ...shape, kind },
      itemCount: requestedItemCount,
      depth,
      presentation,
      operation,
    }),
    maxSentences: maxSentencesFor({
      shape: { ...shape, kind },
      itemCount: requestedItemCount,
      depth,
      presentation,
    }),
    preferBullets:
      presentation === "bullet_list" ||
      presentation === "numbered_steps" ||
      presentation === "list" ||
      requestedItemCount != null,
    preferTable: presentation === "table" || presentation === "comparison",
    completionCriteria,
  };
}

/** Merge contract fields onto AnswerShape for synthesis / evidence budgets. */
export function answerShapeFromContract(
  question: string,
  contract?: ResponseContract,
): AnswerShape {
  const shape = inferAnswerShape(question);
  const c = contract ?? inferResponseContract(question);
  return {
    ...shape,
    kind: c.shape,
    maxSentences: c.maxSentences,
    preferBullets: c.preferBullets,
    preferTable: c.preferTable,
    formatHint: formatHintFor(
      c.presentation,
      c.requestedItemCount,
      c.depth,
      c.requestedFields,
      shape.formatHint,
    ),
  };
}

export function countListItems(text: string): number {
  const lines = text.split(/\n/);
  let bullets = 0;
  let numbered = 0;
  let tableRows = 0;
  for (const line of lines) {
    if (/^\s*[-*•]\s+\S/.test(line)) bullets += 1;
    else if (/^\s*\d+[.)]\s+\S/.test(line)) numbered += 1;
    else if (/^\s*\|.+\|\s*$/.test(line) && !/^\s*\|?\s*:?-{3,}/.test(line)) {
      tableRows += 1;
    }
  }
  // Header row doesn't count as an item
  if (tableRows > 0) tableRows = Math.max(0, tableRows - 1);
  return Math.max(bullets, numbered, tableRows);
}

export type ResponseValidation = {
  complete: boolean;
  foundCount: number;
  issues: string[];
};

/** Validate generated text against the response contract before display. */
export function validateResponseContract(
  text: string,
  contract: ResponseContract,
): ResponseValidation {
  const trimmed = text.trim();
  const issues: string[] = [];
  const foundCount = countListItems(trimmed);

  if (!trimmed) {
    issues.push("EMPTY_ANSWER");
  }

  if (contract.requestedItemCount != null) {
    if (foundCount < contract.requestedItemCount) {
      issues.push("INCOMPLETE_ITEM_LIST");
    }
  }

  // Complete-list presentations should not be a single short sentence
  if (
    (contract.presentation === "list" ||
      contract.presentation === "table" ||
      contract.operation === "list") &&
    foundCount < 2 &&
    trimmed.split(/\s+/).length < 40 &&
    !/\n/.test(trimmed)
  ) {
    issues.push("EXPECTED_LIST_OR_TABLE");
  }

  if (
    contract.presentation === "prose" &&
    contract.depth === "detailed" &&
    trimmed.split(/\s+/).length < 60
  ) {
    issues.push("INSUFFICIENT_DEPTH");
  }

  if (
    contract.mustComplete &&
    /(?:…|\.\.\.)\s*$/.test(trimmed) &&
    trimmed.length < contract.outputTokenBudget * 3
  ) {
    issues.push("TRAILING_ELLIPSIS");
  }

  if (
    contract.mustComplete &&
    /\b(more on request|let me know if you want (more|the rest)|i can continue)\b/i.test(
      trimmed,
    )
  ) {
    issues.push("DEFERRED_COMPLETION");
  }

  // Count-shaped answers that are clearly lists of many items when short_answer was requested — ok
  // Missing requested fields is soft: only flag when answer is extremely short
  if (
    contract.requestedFields.length &&
    trimmed.split(/\s+/).length < 12 &&
    (contract.operation === "add_fields" || contract.presentation === "list")
  ) {
    issues.push("MISSING_REQUESTED_FIELDS");
  }

  return {
    complete: contract.mustComplete
      ? issues.filter((i) => i !== "TRAILING_ELLIPSIS").length === 0 &&
        !issues.includes("INCOMPLETE_ITEM_LIST") &&
        !issues.includes("EMPTY_ANSWER") &&
        !issues.includes("DEFERRED_COMPLETION") &&
        !issues.includes("EXPECTED_LIST_OR_TABLE") &&
        !issues.includes("INSUFFICIENT_DEPTH")
      : !issues.includes("EMPTY_ANSWER"),
    foundCount,
    issues,
  };
}

export function buildCompletionRepairInstruction(opts: {
  question: string;
  contract: ResponseContract;
  partial: string;
}): string {
  const need = opts.contract.requestedItemCount;
  const found = countListItems(opts.partial);
  const remaining = need != null ? Math.max(0, need - found) : null;
  const issues: string[] = [];
  if (need != null) {
    issues.push(
      `The user asked for ${need} items; ${found} were present. Add the remaining ${remaining ?? 0} complete items and keep all prior complete items.`,
    );
  }
  if (
    opts.contract.presentation === "list" ||
    opts.contract.operation === "list"
  ) {
    issues.push(
      "Provide the complete list for the current request — do not repeat a prior count-only answer.",
    );
  }
  if (opts.contract.requestedFields.length) {
    issues.push(
      `Include these fields when available: ${opts.contract.requestedFields.join(", ")}.`,
    );
  }
  if (opts.contract.presentation === "table") {
    issues.push("Prefer a markdown table with a header row.");
  }
  if (opts.contract.presentation === "prose") {
    issues.push("Expand into clear paragraphs at the requested depth.");
  }
  return [
    "## Completion repair",
    "The previous draft did not satisfy the current turn's response contract.",
    "Return ONE complete final answer only — merge prior content with the missing pieces.",
    "Do not apologize. Do not mention truncation or continuation.",
    `Presentation required: ${opts.contract.presentation}; depth: ${opts.contract.depth}.`,
    ...issues,
    "",
    "## User question",
    opts.question,
    "",
    "## Incomplete draft",
    opts.partial,
  ].join("\n");
}

/** Merge a continuation into one answer (prefer continuation if it already includes prior items). */
export function mergeCompletionDraft(partial: string, continuation: string): string {
  const a = partial.trim();
  const b = continuation.trim();
  if (!a) return b;
  if (!b) return a;
  if (b.includes(a.slice(0, Math.min(80, a.length))) || countListItems(b) >= countListItems(a)) {
    return b;
  }
  return `${a}\n${b}`;
}
