/**
 * Per-turn task resolution.
 *
 * CORE RULE: carry forward SUBJECT/ENTITY/CONSTRAINT context.
 * Re-resolve INTENT, OPERATION, DEPTH, FIELDS, ANSWER SHAPE every turn.
 * Previous answers are CONTEXT, not instructions for the next answer.
 */

import type { ConversationTurnState } from "./conversation-types.ts";
import type { AnswerShapeKind as ConvAnswerShape } from "./conversation-types.ts";
import { activeEntities } from "./apply-delta.ts";
import {
  extractRequestedItemCount,
  inferResponseDepth,
  type ResponseDepth,
} from "../answer-shape/index.ts";

export type TurnOperation =
  | "count"
  | "list"
  | "detail"
  | "compare"
  | "filter"
  | "add_fields"
  | "summarize"
  | "deepen"
  | "reformat"
  | "answer"
  | "calculate"
  | "lookup";

/** Presentation form requested for this turn (orthogonal to density). */
export type AnswerPresentation =
  | "short_answer"
  | "prose"
  | "bullet_list"
  | "numbered_steps"
  | "key_value"
  | "comparison"
  | "table"
  | "list";

export type TurnTaskResolution = {
  subject: string | null;
  intent: string;
  operation: TurnOperation;
  requestedFields: string[];
  requestedItemCount: number | null;
  depth: ResponseDepth;
  /** Conversation density shape (brief/normal/detailed/key_points). */
  answerShape: ConvAnswerShape;
  presentation: AnswerPresentation;
  freshness: boolean;
  retrievalNeeded: boolean;
  completionCriteria: string[];
};

const COUNT_RE =
  /\b(how\s+many|what('?s|\s+is)\s+the\s+(total\s+)?(number|count)|number\s+of|count\s+of)\b/i;

const LIST_ALL_RE =
  /\b(list\s+(every|all|each|the\s+full|them\s+all)|every\s+\w+|all\s+of\s+(them|it|the)|complete\s+(list|schedule|set)|full\s+(list|schedule)|name\s+(them|every|all)|what\s+are\s+(all\s+)?(they|them|the)|show\s+(me\s+)?(all|every|the\s+full))\b/i;

const LIST_SOFT_RE =
  /\b(list|enumerate|which\s+(ones|of)|options|examples\s+of|names\s+of)\b/i;

const COMPARE_RE =
  /\b(compare|comparison|versus|\bvs\.?\b|difference\s+between|pros\s+and\s+cons|which\s+is\s+better|side[- ]by[- ]side)\b/i;

const DEEPEN_RE =
  /\b(go\s+deeper|more\s+detail|in\s+more\s+detail|expand|elaborate|explain\s+(further|more)|longer|walk\s+me\s+through|thorough|in[- ]depth)\b/i;

const BULLETS_RE =
  /\b(bullets?|bullet\s*points?|main\s+points|key\s+points|as\s+a\s+list)\b/i;

const PROSE_RE =
  /\b(paragraphs?|in\s+prose|explain\s+(that|it|this)|write\s+(it\s+)?out|as\s+(a\s+)?narrative)\b/i;

const TABLE_RE =
  /\b(table|tabular|spreadsheet|columns?)\b/i;

const NUMBERED_RE =
  /\b(numbered|step[- ]by[- ]step|steps\b|in\s+order)\b/i;

const SHORT_RE =
  /\b(just\s+(give\s+me\s+)?(the\s+)?answer|only\s+the\s+(number|answer|total)|one\s+sentence|tl;?dr|briefly|in\s+a\s+nutshell)\b/i;

const WORD_COUNT: Record<string, number> = {
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  twelve: 12,
};

const FILTER_RE =
  /\b(only\s+(the|those|ones)|just\s+the\s+ones|filter|excluding|without\s+the|narrow\s+(to|it))\b/i;

const ADD_FIELDS_RE =
  /\b(when\s+(are|is|do)|what\s+time|where\s+(are|is|do)|and\s+(also\s+)?(when|where|what|who)|including\s+(the\s+)?(dates?|times?|locations?|prices?)|with\s+(dates?|times?|locations?))\b/i;

const FRESH_RE =
  /\b(now|current(ly)?|today|this\s+year|latest|updated|as\s+of\s+(now|today)|look\s+again|check\s+again)\b/i;

const CALC_RE =
  /\b(total|sum|add(?:\s+up)?|calculate|combined|how\s+much\s+(in\s+total|altogether))\b/i;

/** Generic field hints extracted from the utterance (not domain-specific). */
export function extractRequestedFields(text: string): string[] {
  const fields: string[] = [];
  const t = text.toLowerCase();
  if (/\b(when|date|dates|schedule|day|days)\b/.test(t)) fields.push("date");
  if (/\b(time|times|o'?clock|am\b|pm\b|kickoff|start)\b/.test(t)) {
    fields.push("time");
  }
  if (/\b(where|location|venue|place|address)\b/.test(t)) fields.push("location");
  if (/\b(price|cost|fee|how\s+much)\b/.test(t)) fields.push("price");
  if (/\b(who|name|names|player|author|founder)\b/.test(t)) fields.push("name");
  if (/\b(why|reason|because)\b/.test(t)) fields.push("reason");
  if (/\b(how\s+(long|far|often)|duration|distance)\b/.test(t)) {
    fields.push("measure");
  }
  return [...new Set(fields)];
}

function subjectFromState(prev: ConversationTurnState | null | undefined): string | null {
  if (!prev) return null;
  const actives = activeEntities(prev);
  if (actives.length) return actives.map((e) => e.label).join(", ");
  const topic = prev.topics.find((t) => t.contextClass === "ACTIVE");
  if (topic) return topic.label;
  return null;
}

function subjectForRelation(opts: {
  content: string;
  previous?: ConversationTurnState | null;
  turnRelation?: import("./turn-relation.ts").TurnRelation;
  reactivateLabel?: string;
}): string | null {
  const rel = opts.turnRelation;
  if (rel === "topic_switch") return null;
  if (rel === "reference" && opts.reactivateLabel?.trim()) {
    return opts.reactivateLabel.trim();
  }
  if (rel === "continuation" || rel === "related" || !rel) {
    return subjectFromState(opts.previous);
  }
  return subjectFromState(opts.previous);
}

function presentationToConvShape(
  presentation: AnswerPresentation,
  depth: ResponseDepth,
): ConvAnswerShape {
  if (presentation === "bullet_list" || presentation === "numbered_steps") {
    return depth === "brief" ? "key_points" : "key_points";
  }
  if (presentation === "short_answer") return "brief";
  if (depth === "detailed") return "detailed";
  if (depth === "brief") return "brief";
  return "normal";
}

function completionCriteriaFor(task: Omit<TurnTaskResolution, "completionCriteria">): string[] {
  const c: string[] = ["answers_current_question"];
  if (task.requestedFields.length) {
    c.push(`includes_fields:${task.requestedFields.join(",")}`);
  }
  if (task.requestedItemCount != null) {
    c.push(`item_count:${task.requestedItemCount}`);
  }
  if (task.operation === "list" && LIST_ALL_RE.test(task.intent)) {
    c.push("complete_list");
  }
  c.push(`presentation:${task.presentation}`);
  c.push(`depth:${task.depth}`);
  if (task.retrievalNeeded) c.push("fresh_or_expanded_retrieval");
  return c;
}

/**
 * Resolve the CURRENT turn's task.
 * Subject may inherit; operation / shape / fields / depth always re-derived.
 */
export function resolveTurnTask(opts: {
  content: string;
  previous?: ConversationTurnState | null;
  turnRelation?: import("./turn-relation.ts").TurnRelation;
  reactivateEntityLabel?: string;
}): TurnTaskResolution {
  const content = (opts.content || "").trim();
  const prev = opts.previous ?? null;
  const subject = subjectForRelation({
    content,
    previous: prev,
    turnRelation: opts.turnRelation,
    reactivateLabel: opts.reactivateEntityLabel,
  });
  let itemCount = extractRequestedItemCount(content);
  if (itemCount == null) {
    const wm = content.match(
      /\b(two|three|four|five|six|seven|eight|nine|ten|twelve)\s+(?:bullets?(?:\s*points?)?|points?|ideas?|examples?|tips?|reasons?|ways?|steps?|items?)\b/i,
    );
    if (wm?.[1]) itemCount = WORD_COUNT[wm[1].toLowerCase()] ?? null;
  }
  let depth = inferResponseDepth(content);
  if (
    SHORT_RE.test(content) &&
    content.split(/\s+/).length <= 8 &&
    !/\b(what|who|where|when|how|why)\b/i.test(content)
  ) {
    depth = "brief";
  }
  const fields = extractRequestedFields(content);
  const freshness = FRESH_RE.test(content);

  let operation: TurnOperation = "answer";
  let presentation: AnswerPresentation = "short_answer";
  let intent = content.slice(0, 120) || "answer";
  let retrievalNeeded = false;

  if (COMPARE_RE.test(content)) {
    operation = "compare";
    presentation = "comparison";
    intent = "compare";
    retrievalNeeded = true;
  } else if (CALC_RE.test(content) && !COUNT_RE.test(content)) {
    operation = "calculate";
    presentation = "short_answer";
    intent = "calculate";
  } else if (COUNT_RE.test(content) && !LIST_ALL_RE.test(content)) {
    operation = "count";
    presentation = "short_answer";
    intent = "count";
    // Count often needs retrieval when subject is carried but no live count in context
    retrievalNeeded = Boolean(subject) || content.length > 12;
  } else if (LIST_ALL_RE.test(content) || (LIST_SOFT_RE.test(content) && itemCount == null)) {
    operation = "list";
    presentation = TABLE_RE.test(content)
      ? "table"
      : NUMBERED_RE.test(content)
        ? "numbered_steps"
        : "list";
    intent = LIST_ALL_RE.test(content) ? "list_all" : "list";
    retrievalNeeded = true;
    if (depth === "brief") depth = "standard";
  } else if (itemCount != null || BULLETS_RE.test(content)) {
    operation = itemCount != null ? "list" : "reformat";
    presentation = NUMBERED_RE.test(content) ? "numbered_steps" : "bullet_list";
    intent = itemCount != null ? `list_${itemCount}` : "reformat_bullets";
    if (itemCount != null) retrievalNeeded = true;
  } else if (TABLE_RE.test(content)) {
    operation = "reformat";
    presentation = "table";
    intent = "reformat_table";
  } else if (PROSE_RE.test(content) || DEEPEN_RE.test(content)) {
    operation = DEEPEN_RE.test(content) ? "deepen" : "detail";
    presentation = "prose";
    intent = DEEPEN_RE.test(content) ? "deepen" : "explain";
    depth = "detailed";
    retrievalNeeded = DEEPEN_RE.test(content);
  } else if (
    SHORT_RE.test(content) &&
    content.split(/\s+/).length <= 8 &&
    !/\b(what|who|where|when|how|why)\b/i.test(content)
  ) {
    // Pure reformat asks ("just the answer") — not "what is X in one sentence?"
    operation = "reformat";
    presentation = "short_answer";
    intent = "short_answer";
    depth = "brief";
  } else if (FILTER_RE.test(content) && prev) {
    operation = "filter";
    presentation = prev.desiredAnswerShape === "key_points" ? "bullet_list" : "list";
    intent = "filter";
    retrievalNeeded = true;
  } else if (ADD_FIELDS_RE.test(content) && (subject || prev?.currentIntent)) {
    operation = "add_fields";
    presentation =
      prev?.currentIntent === "count" || prev?.currentIntent === "list_all"
        ? "list"
        : "key_value";
    intent = "add_fields";
    retrievalNeeded = true;
  } else if (
    /\b(explain|why\b|how\s+(does|do|can|to)\b|what\s+(causes|means))\b/i.test(content)
  ) {
    operation = "detail";
    presentation = "prose";
    intent = "explain";
  } else if (
    /\b(who|what|when|where|how\s+much|is\b|are\b|does\b|did\b)\b/i.test(content) &&
    content.split(/\s+/).length <= 28
  ) {
    operation = "lookup";
    presentation = "short_answer";
    intent = "lookup";
    retrievalNeeded = true;
  }

  // Follow-up with inherited subject: "list every…" after count must list, not repeat count
  if (
    subject &&
    prev?.currentIntent &&
    /^(count|lookup|answer)$/i.test(prev.currentIntent) &&
    (LIST_ALL_RE.test(content) || LIST_SOFT_RE.test(content))
  ) {
    operation = "list";
    presentation = fields.includes("date") || fields.includes("time") ? "table" : "list";
    intent = "list_all";
    retrievalNeeded = true;
  }

  // "When are they and what time?" after a count/list → add fields + retrieve
  if (subject && fields.length && operation === "lookup" && prev?.currentIntent) {
    operation = "add_fields";
    presentation = "list";
    intent = "add_fields";
    retrievalNeeded = true;
  }

  if (freshness) retrievalNeeded = true;

  // New fields or complete list relative to a prior short answer → must retrieve
  if (
    prev &&
    (operation === "list" || operation === "add_fields" || operation === "deepen") &&
    !retrievalNeeded
  ) {
    retrievalNeeded = true;
  }

  const answerShape = presentationToConvShape(presentation, depth);
  const task: TurnTaskResolution = {
    subject,
    intent,
    operation,
    requestedFields: fields,
    requestedItemCount: itemCount,
    depth,
    answerShape,
    presentation,
    freshness,
    retrievalNeeded,
    completionCriteria: [],
  };
  task.completionCriteria = completionCriteriaFor(task);
  return task;
}

/** Map presentation → synthesis AnswerShape kind string used by ResponseContract. */
export function presentationToSynthesisKind(
  presentation: AnswerPresentation,
):
  | "fact"
  | "list"
  | "calculation"
  | "comparison"
  | "explanation"
  | "recommendation"
  | "research" {
  switch (presentation) {
    case "short_answer":
    case "key_value":
      return "fact";
    case "prose":
      return "explanation";
    case "bullet_list":
    case "numbered_steps":
    case "list":
      return "list";
    case "comparison":
      return "comparison";
    case "table":
      return "comparison";
    default:
      return "fact";
  }
}

export function formatTurnTaskForPrompt(task: TurnTaskResolution): string {
  return [
    "## Current turn task (controls THIS answer — prior turns are context only)",
    `subject=${task.subject ?? "(none)"}; intent=${task.intent}; operation=${task.operation}`,
    `presentation=${task.presentation}; depth=${task.depth}; itemCount=${task.requestedItemCount ?? "n/a"}`,
    task.requestedFields.length
      ? `requestedFields=${task.requestedFields.join(",")}`
      : null,
    `retrievalNeeded=${task.retrievalNeeded}; freshness=${task.freshness}`,
    `completionCriteria=${task.completionCriteria.join("; ")}`,
    "Do not repeat a previous answer if the operation or presentation changed.",
  ]
    .filter(Boolean)
    .join("\n");
}
