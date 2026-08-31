/**
 * Exa search depth + outputSchema policy.
 * Dependency-free — shared by Edge provider and client tests.
 */

import {
  extractRequestedItemCount,
  inferResponseContract,
  inferResponseDepth,
} from "../answer-shape/response-contract.ts";
import { isFreshnessQuery } from "./types.ts";

export type ExaRetrievalMode =
  | "instant"
  | "fast"
  | "auto"
  | "deep-lite"
  | "deep"
  | "deep-reasoning";

/** Serializable hints from TurnTask / compiler — passed to Edge Exa provider. */
export type TurnRetrievalHints = {
  subject?: string | null;
  operation?: string;
  requestedFields?: string[];
  requestedItemCount?: number | null;
  freshness?: boolean;
  depth?: "brief" | "standard" | "detailed";
  presentation?: string;
  dissatisfaction?: boolean;
};

export type ExaOutputSchema =
  | { type: "text"; description: string }
  | {
      type: "object";
      description: string;
      properties: Record<string, unknown>;
      required?: string[];
    };

export type ExaRetrievalPolicy = {
  mode: ExaRetrievalMode;
  numResults: number;
  outputSchema: ExaOutputSchema;
  systemPrompt: string;
  startPublishedDate?: string;
  maxAgeHours?: number;
  useHighlightsOnly: boolean;
};

export const EXA_SEARCH_SYSTEM_PROMPT =
  "Answer the user's exact current question. Prefer authoritative or first-party sources when available. Resolve dates, entities, and requested fields precisely. Do not combine unrelated facts from different results. Do not speculate. If evidence conflicts or is insufficient, say so clearly.";

export const EXA_TEXT_OUTPUT_DESCRIPTION =
  "Give the direct factual answer to the user's current question using only the search evidence. Include all specifically requested fields. Do not add unsupported facts, and do not discuss the search process.";

const RESEARCH_RE =
  /\b(research|investigate|compare|analysis|report|deep dive|comprehensive|in[- ]depth|multi[- ]source|pros and cons|landscape)\b/i;

/** Long-running autonomous investigation — route to work task, not Search. */
const AUTONOMOUS_RE =
  /\b(research this for me|investigate thoroughly|do (the|a) (full )?research|comprehensive report|autonomous(ly)?|over (the )?next (few )?(hours|days)|full investigation|gather everything about|write me a (full )?report|monitor (this|the) (over|for))\b/i;

const ANALYTICAL_RE =
  /\b(why did|analyze|analysis|reasoning|tradeoffs|implications|evaluate|assess|reconcile|conflicting|which (one )?should|decision|recommend)\b/i;

const COMPARISON_RE =
  /\b(compare|versus|\bvs\.?\b|difference between|better than|which is)\b/i;

const LIST_ALL_RE =
  /\b(list\s+(every|all|each|the\s+full)|every\s+\w+|all\s+of\s+(them|it)|complete\s+(list|schedule|set)|full\s+(list|schedule)|show\s+(me\s+)?(all|every))\b/i;

const SCHEDULE_FIELDS_RE =
  /\b(when|what time|date|kickoff|schedule|game|match|opponent|location|venue|where)\b/i;

function isoDateDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function inferRequestedFields(question: string): string[] {
  const fields: string[] = [];
  const q = question.toLowerCase();
  if (/\b(opponent|vs\.?|against|play)\b/.test(q)) fields.push("opponent");
  if (/\b(date|when|sept|oct|nov|dec|jan|feb|mar|apr|may|jun|jul|aug)\b/.test(q)) {
    fields.push("date");
  }
  if (/\b(time|kickoff|start)\b/.test(q)) fields.push("time");
  if (/\b(where|location|venue|city|stadium|provo|home|away)\b/.test(q)) {
    fields.push("location");
  }
  if (/\b(price|cost|calories|nutrition|protein|fat|carbs)\b/.test(q)) {
    fields.push("value");
  }
  return [...new Set(fields)];
}

const VOLATILE_FRESH_RE =
  /\b(score|scores|weather|stock|price|game|match|live|breaking|tonight|today'?s)\b/i;

const ESCALATION_CHAIN: ExaRetrievalMode[] = [
  "instant",
  "fast",
  "auto",
  "deep-lite",
  "deep",
  "deep-reasoning",
];

export function nextEscalationMode(
  current: ExaRetrievalMode,
): ExaRetrievalMode | null {
  const idx = ESCALATION_CHAIN.indexOf(current);
  if (idx < 0 || idx >= ESCALATION_CHAIN.length - 1) return null;
  return ESCALATION_CHAIN[idx + 1]!;
}

export function buildRetrievalQuery(opts: {
  content: string;
  subject?: string | null;
  requestedFields?: string[];
  operation?: string;
}): string {
  const parts: string[] = [];
  if (opts.subject?.trim()) parts.push(opts.subject.trim());
  parts.push(opts.content.trim());
  if (
    opts.operation === "add_fields" &&
    opts.requestedFields?.length
  ) {
    parts.push(opts.requestedFields.join(" "));
  }
  return parts.filter(Boolean).join(" ").slice(0, 400);
}

function fieldsFromHints(
  question: string,
  hints?: TurnRetrievalHints,
): string[] {
  if (hints?.requestedFields?.length) return hints.requestedFields;
  return inferRequestedFields(question);
}

export function buildExaOutputSchema(
  question: string,
  hints?: TurnRetrievalHints,
): ExaOutputSchema {
  const contract = inferResponseContract(question, hints?.requestedFields?.length
    ? {
        requestedFields: hints.requestedFields,
        operation: hints.operation,
        presentation: hints.presentation as
          | import("../answer-shape/response-contract.ts").AnswerPresentation
          | undefined,
        requestedItemCount: hints.requestedItemCount,
        depth: hints.depth,
      }
    : undefined);
  const fields = fieldsFromHints(question, hints);

  const wantsList =
    hints?.operation === "list" ||
    LIST_ALL_RE.test(question) ||
    contract.presentation === "list" ||
    contract.presentation === "bullet_list" ||
    hints?.requestedItemCount != null ||
    extractRequestedItemCount(question) != null;

  if (
    wantsList ||
    (fields.length >= 3 && SCHEDULE_FIELDS_RE.test(question))
  ) {
    const props: Record<string, unknown> = {
      answer: { type: "string" },
    };
    for (const f of fields.slice(0, 6)) {
      props[f] = { type: "string" };
    }
    if (wantsList) {
      props.items = {
        type: "array",
        items: {
          type: "object",
          properties: Object.fromEntries(
            fields.slice(0, 5).map((f) => [f, { type: "string" }]),
          ),
          required: fields.slice(0, 2),
        },
      };
    }
    return {
      type: "object",
      description: EXA_TEXT_OUTPUT_DESCRIPTION,
      properties: props,
      required: ["answer"],
    };
  }

  if (fields.length >= 2) {
    const props: Record<string, unknown> = {
      answer: { type: "string" },
    };
    for (const f of fields.slice(0, 5)) {
      props[f] = { type: "string" };
    }
    return {
      type: "object",
      description: EXA_TEXT_OUTPUT_DESCRIPTION,
      properties: props,
      required: ["answer"],
    };
  }

  return {
    type: "text",
    description: EXA_TEXT_OUTPUT_DESCRIPTION,
  };
}

export function wantsAutonomousResearch(question: string): boolean {
  const q = question.trim();
  if (!q) return false;
  if (AUTONOMOUS_RE.test(q)) return true;
  return (
    RESEARCH_RE.test(q) &&
    /\b(hours|days|week|comprehensive|full report|write (me )?a report|monitor)\b/i.test(
      q,
    )
  );
}

export function wantsDeepReasoningSearch(
  question: string,
  hints?: TurnRetrievalHints,
): boolean {
  const q = question.trim();
  if (hints?.dissatisfaction && (hints.operation === "compare" || COMPARISON_RE.test(q))) {
    return true;
  }
  if (ANALYTICAL_RE.test(q) && (hints?.depth === "detailed" || RESEARCH_RE.test(q))) {
    return true;
  }
  if (hints?.operation === "compare" && hints.depth === "detailed") return true;
  return false;
}

export function resolveExaRetrievalPolicy(
  question: string,
  opts?: {
    deeper?: boolean;
    escalate?: ExaRetrievalMode | null;
    hints?: TurnRetrievalHints;
  },
): ExaRetrievalPolicy {
  const q = question.trim();
  const hints = opts?.hints;
  const depth = hints?.depth ?? inferResponseDepth(q);
  const fresh =
    Boolean(hints?.freshness) || isFreshnessQuery(q) || VOLATILE_FRESH_RE.test(q);
  const components = (q.match(/\band\b/gi) ?? []).length + 1;
  const itemCount =
    hints?.requestedItemCount ?? extractRequestedItemCount(q);

  let mode: ExaRetrievalMode = "fast";

  if (opts?.escalate) {
    mode = opts.escalate;
  } else if (wantsDeepReasoningSearch(q, hints)) {
    mode = "deep-reasoning";
  } else if (opts?.deeper || hints?.dissatisfaction) {
    mode = RESEARCH_RE.test(q) ? "deep" : "auto";
  } else if (
    hints?.operation === "deepen" ||
    RESEARCH_RE.test(q) ||
    depth === "detailed"
  ) {
    mode = "deep-lite";
  } else if (
    hints?.operation === "compare" ||
    COMPARISON_RE.test(q) ||
    components >= 3
  ) {
    mode = "auto";
  } else if (
    hints?.operation === "list" ||
    LIST_ALL_RE.test(q) ||
    itemCount != null
  ) {
    mode = "deep-lite";
  } else if (/\b(quick|right now|asap)\b/i.test(q)) {
    mode = "instant";
  } else if (hints?.operation === "lookup" || hints?.operation === "answer") {
    mode = "fast";
  } else {
    mode = "fast";
  }

  let numResults = 5;
  if (mode === "instant") numResults = 3;
  if (mode === "fast") numResults = 4;
  if (mode === "auto") numResults = 6;
  if (mode === "deep-lite") numResults = 6;
  if (mode === "deep" || mode === "deep-reasoning") numResults = 8;
  if (itemCount != null) {
    numResults = Math.min(8, Math.max(numResults, itemCount + 2));
  }

  const policy: ExaRetrievalPolicy = {
    mode,
    numResults,
    outputSchema: buildExaOutputSchema(q, hints),
    systemPrompt: EXA_SEARCH_SYSTEM_PROMPT,
    useHighlightsOnly: true,
  };

  if (fresh) {
    policy.startPublishedDate = isoDateDaysAgo(VOLATILE_FRESH_RE.test(q) ? 7 : 14);
    policy.maxAgeHours = VOLATILE_FRESH_RE.test(q) ? 48 : 72;
  }

  return policy;
}

export function exaDirectAnswerText(
  content: string | Record<string, unknown> | undefined | null,
): string {
  if (!content) return "";
  if (typeof content === "string") return content.trim();
  if (typeof content.answer === "string") return content.answer.trim();
  try {
    return JSON.stringify(content);
  } catch {
    return "";
  }
}

export function exaGroundingConfidence(
  grounding: Array<{ confidence?: string }> | undefined,
): "low" | "medium" | "high" | "none" {
  if (!grounding?.length) return "none";
  const ranks = { low: 1, medium: 2, high: 3 };
  let best = 0;
  for (const g of grounding) {
    const c = String(g.confidence ?? "").toLowerCase();
    best = Math.max(best, ranks[c as keyof typeof ranks] ?? 0);
  }
  if (best >= 3) return "high";
  if (best >= 2) return "medium";
  if (best >= 1) return "low";
  return "none";
}
