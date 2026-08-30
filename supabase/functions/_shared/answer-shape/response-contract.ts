/**
 * Dynamic response contract — ties answer shape to output budget + completion.
 * Dependency-free for Deno Edge + Next.
 */

import type { AnswerShape, AnswerShapeKind } from "./types.ts";
import { inferAnswerShape } from "./infer.ts";

export type ResponseDepth = "brief" | "standard" | "detailed";

export type ResponseContract = {
  shape: AnswerShapeKind;
  requestedItemCount: number | null;
  depth: ResponseDepth;
  mustComplete: boolean;
  /** Soft output budget in approximate tokens (not a hard provider cap alone). */
  outputTokenBudget: number;
  maxSentences: number;
  preferBullets: boolean;
};

const ITEM_COUNT_RE =
  /\b(?:give\s+me\s+|list\s+|write\s+|share\s+|provide\s+|need\s+|want\s+)?(\d{1,2})\s*(?:bullet(?:\s*points?)?|points?|ideas?|examples?|tips?|reasons?|ways?|steps?|items?|suggestions?|options?)\b/i;

const DETAILED_RE =
  /\b(detailed|in[- ]depth|thorough|comprehensive|long(?:er)?\s+answer|explain\s+fully|walk\s+me\s+through)\b/i;

const BRIEF_RE =
  /\b(brief|short|tl;?dr|one\s+sentence|in\s+a\s+nutshell|quickly)\b/i;

export function extractRequestedItemCount(question: string): number | null {
  const m = question.match(ITEM_COUNT_RE);
  if (!m?.[1]) return null;
  const n = Number.parseInt(m[1], 10);
  if (!Number.isFinite(n) || n < 2 || n > 20) return null;
  return n;
}

export function inferResponseDepth(question: string): ResponseDepth {
  if (DETAILED_RE.test(question)) return "detailed";
  if (BRIEF_RE.test(question)) return "brief";
  return "standard";
}

function outputBudgetFor(opts: {
  shape: AnswerShape;
  itemCount: number | null;
  depth: ResponseDepth;
}): number {
  const base =
    opts.depth === "detailed" ? 900 : opts.depth === "brief" ? 220 : 420;
  if (opts.itemCount) {
    // ~45–70 tokens per complete bullet/idea depending on depth
    const perItem = opts.depth === "detailed" ? 90 : opts.depth === "brief" ? 35 : 55;
    return Math.max(base, opts.itemCount * perItem + 80);
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
}): number {
  if (opts.itemCount) {
    return Math.max(opts.shape.maxSentences, opts.itemCount + 1);
  }
  if (opts.depth === "detailed") {
    return Math.max(opts.shape.maxSentences, 14);
  }
  if (opts.depth === "brief") {
    return Math.min(opts.shape.maxSentences, 4);
  }
  return opts.shape.maxSentences;
}

/** Infer contract from the user question + answer-shape heuristics. */
export function inferResponseContract(question: string): ResponseContract {
  const shape = inferAnswerShape(question);
  const requestedItemCount = extractRequestedItemCount(question);
  const depth = inferResponseDepth(question);
  const mustComplete = requestedItemCount != null || depth === "detailed";
  return {
    shape: shape.kind,
    requestedItemCount,
    depth,
    mustComplete,
    outputTokenBudget: outputBudgetFor({ shape, itemCount: requestedItemCount, depth }),
    maxSentences: maxSentencesFor({ shape, itemCount: requestedItemCount, depth }),
    preferBullets: shape.preferBullets || requestedItemCount != null,
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
    formatHint:
      c.requestedItemCount != null
        ? `Provide exactly ${c.requestedItemCount} complete ${
            c.preferBullets ? "bullet points" : "items"
          }. Each item must be finished — do not stop early or truncate the list.`
        : c.depth === "detailed"
          ? `${shape.formatHint} Give a complete detailed answer — do not cut off mid-thought.`
          : shape.formatHint,
  };
}

export function countListItems(text: string): number {
  const lines = text.split(/\n/);
  let bullets = 0;
  let numbered = 0;
  for (const line of lines) {
    if (/^\s*[-*•]\s+\S/.test(line)) bullets += 1;
    else if (/^\s*\d+[.)]\s+\S/.test(line)) numbered += 1;
  }
  return Math.max(bullets, numbered);
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

  const complete =
    issues.length === 0 ||
    (!contract.mustComplete && !issues.includes("EMPTY_ANSWER"));

  return {
    complete: contract.mustComplete
      ? issues.filter((i) => i !== "TRAILING_ELLIPSIS").length === 0 &&
        !issues.includes("INCOMPLETE_ITEM_LIST") &&
        !issues.includes("EMPTY_ANSWER") &&
        !issues.includes("DEFERRED_COMPLETION")
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
  const remaining =
    need != null ? Math.max(0, need - found) : null;
  return [
    "## Completion repair",
    "The previous draft was incomplete. Continue from where it stopped.",
    "Return ONE complete final answer only — merge prior content with the missing pieces.",
    "Do not apologize. Do not mention truncation or continuation.",
    need != null
      ? `The user asked for ${need} items; ${found} were present. Add the remaining ${remaining ?? 0} complete items and keep all prior complete items.`
      : "Finish the detailed answer fully.",
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
