/**
 * Central semantic response-block registry.
 * Shared by schema validation, ChatBlock mapping, and UI renderers so types
 * do not drift across the answer-shape / response-format pipeline.
 */

export const RESPONSE_FORMAT_VERSION = 2 as const;

/** Legacy + current rich block types (allowlist). */
export const RESPONSE_BLOCK_TYPES = [
  // Core prose / structure
  "text",
  "markdown",
  "heading",
  "callout",
  "summary",
  "numbered_steps",
  "checklist",
  "table",
  "comparison_card",
  "metric",
  "insight",
  "citation",
  "source_link",
  "review_draft",
  "image_result",
  "image_gallery",
  "code",
  "file_changes",
  "sandbox_preview",
  "job_progress",
  "approval",
  "error_recovery",
  "follow_up",
  // Answer-shape v2 structured blocks
  "process",
  "hierarchy",
  "decision_matrix",
  "pros_cons",
  "ranking",
  "status",
  "before_after",
  "faq",
] as const;

export type ResponseBlockType = (typeof RESPONSE_BLOCK_TYPES)[number];

/** @deprecated Prefer RESPONSE_BLOCK_TYPES */
export const RESPONSE_BLOCK_TYPES_V2 = RESPONSE_BLOCK_TYPES;
/** @deprecated Prefer ResponseBlockType */
export type ResponseBlockTypeV2 = ResponseBlockType;

export type ProcessStep = {
  id: string;
  label: string;
  description?: string;
  status?: string;
  next?: string[];
};

export type HierarchyNode = {
  id: string;
  label: string;
  description?: string;
  parentId?: string;
};

export type DecisionCriterion = {
  name: string;
  weight?: number;
};

export type DecisionScore = {
  option: string;
  criterion: string;
  score: number;
  explanation?: string;
};

export type RankingItem = {
  rank: number;
  label: string;
  score?: number;
  reason?: string;
};

export type StatusItem = {
  label: string;
  status: "pending" | "in_progress" | "complete" | "blocked";
  detail?: string;
  blocker?: string;
  nextAction?: string;
};

export type FaqItem = {
  question: string;
  answer: string;
};

export type RichResponseBlock =
  | { type: "text"; text: string }
  | { type: "markdown"; markdown: string }
  | { type: "heading"; level: 1 | 2 | 3; text: string }
  | {
      type: "callout";
      tone: "info" | "success" | "warning" | "danger";
      title?: string;
      body: string;
    }
  | { type: "summary"; title?: string; body: string }
  | { type: "numbered_steps"; steps: string[] }
  | { type: "checklist"; items: Array<{ label: string; done?: boolean }> }
  | { type: "table"; columns: string[]; rows: string[][] }
  | {
      type: "comparison_card";
      title?: string;
      columns: string[];
      rows: Array<{ label: string; values: string[] }>;
    }
  | { type: "metric"; label: string; value: string; hint?: string }
  | { type: "insight"; title: string; body: string }
  | { type: "citation"; label: string; url?: string; sourceId?: string }
  | { type: "source_link"; title: string; url: string }
  | {
      type: "review_draft";
      title: string;
      body: string;
      copyLabel?: string;
    }
  | { type: "image_result"; url: string; alt?: string; caption?: string }
  | {
      type: "image_gallery";
      images: Array<{ url: string; alt?: string; caption?: string }>;
    }
  | { type: "code"; language?: string; code: string }
  | {
      type: "file_changes";
      title?: string;
      files: Array<{ path: string; summary: string }>;
    }
  | {
      type: "sandbox_preview";
      title: string;
      previewUrl: string;
      status?: "ready" | "building" | "failed";
    }
  | {
      type: "job_progress";
      title: string;
      status: "queued" | "running" | "completed" | "failed";
      detail?: string;
      percent?: number;
    }
  | {
      type: "approval";
      title: string;
      body: string;
      actionId: string;
      actionLabel: string;
      destructive?: boolean;
    }
  | { type: "error_recovery"; title: string; body: string; steps?: string[] }
  | {
      type: "follow_up";
      prompt: string;
      options: Array<{ id: string; label: string }>;
    }
  | { type: "process"; title?: string; steps: ProcessStep[] }
  | { type: "hierarchy"; title?: string; nodes: HierarchyNode[] }
  | {
      type: "decision_matrix";
      title?: string;
      options: string[];
      criteria: DecisionCriterion[];
      scores: DecisionScore[];
      recommendation?: string;
    }
  | {
      type: "pros_cons";
      title?: string;
      pros: string[];
      cons: string[];
      conclusion?: string;
    }
  | { type: "ranking"; title?: string; items: RankingItem[] }
  | { type: "status"; title?: string; items: StatusItem[] }
  | {
      type: "before_after";
      title?: string;
      before: { title?: string; items: string[] };
      after: { title?: string; items: string[] };
    }
  | { type: "faq"; title?: string; items: FaqItem[] };

/** @deprecated Prefer RichResponseBlock */
export type RichResponseBlockV2 = RichResponseBlock;

export type RichResponse = {
  version: typeof RESPONSE_FORMAT_VERSION;
  blocks: RichResponseBlock[];
};

/** @deprecated Prefer RichResponse */
export type RichResponseV2 = RichResponse;

export function isKnownResponseBlockType(type: string): type is ResponseBlockType {
  return (RESPONSE_BLOCK_TYPES as readonly string[]).includes(type);
}

export function richResponseFormatInstruction(): string {
  return [
    "## Answer shape vs presentation",
    "- answerShape = the kind of reasoning (fact, calculation, explanation, list, comparison, recommendation, research, decision, process, timeline, ranking).",
    "- presentation = how to render (short_answer, prose, bullet_list, numbered_steps, key_value, table, comparison_cards, checklist, timeline, hierarchy).",
    "- Prefer simple answers for simple questions. Do not force rich blocks.",
    "- Use tables for dense row/column data; comparison_cards for small option comparisons.",
    "- Use process for workflows/pipelines; hierarchy for parent/child structure; decision_matrix only for criteria-based choices.",
    "- Never invent Mermaid or ASCII diagrams.",
    "",
    "## Structured rich response (optional)",
    "When structured blocks improve comprehension, you may return JSON:",
    '{"version":2,"blocks":[...]}',
    `Allowed block types: ${RESPONSE_BLOCK_TYPES.join(", ")}.`,
    "You may combine short prose with one or more semantic blocks.",
  ].join("\n");
}
