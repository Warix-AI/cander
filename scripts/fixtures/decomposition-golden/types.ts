/**
 * Golden decomposition fixtures for Phase 0 eval harness.
 * Expand toward 50–100 adversarial prompts; run via `decomposition-eval.test.ts`.
 */

import type { ConversationTurnState } from "../../lib/ai/turn-environment/conversation-types.ts";

export type DecompositionExpect = {
  /** Minimum ASK spans the request scanner should find. */
  minAsks?: number;
  /** Minimum CONSTRAINT spans. */
  minConstraints?: number;
  /** Expected turn relation when prior state is seeded. */
  turnRelation?: "continuation" | "related" | "reference" | "topic_switch";
  /** Research plan objective, or null if no plan expected. */
  researchObjective?: string | null;
  /** Expected subtask count when research plan applies. */
  subtaskCount?: number;
  /** Substrings each subtask query should match (one per subtask). */
  subtaskQueryIncludes?: string[];
  /** Expected RETRIEVE node count from TaskGraph (multi-ask). */
  retrieveNodeCount?: number;
  /** Each RETRIEVE query must be shorter than the full prompt. */
  retrieveQueriesAtomic?: boolean;
  /** AskExtractor escalation triggers expected. */
  askExtractorTriggers?: string[];
  /** Web retrieval query must NOT contain these (topic isolation). */
  queryMustNotInclude?: string[];
};

export type DecompositionGoldenCase = {
  id: string;
  category: string;
  tags: string[];
  prompt: string;
  seedState?: Partial<ConversationTurnState>;
  expect: DecompositionExpect;
};

export type DecompositionGoldenCatalog = {
  version: number;
  cases: DecompositionGoldenCase[];
};
