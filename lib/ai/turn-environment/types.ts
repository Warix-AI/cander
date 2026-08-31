/**
 * Turn environment IR — compiled before every Apple FM request.
 * Runtime owns executive function; FM owns semantics.
 */

import type { TurnEvidence } from "../orchestrator/evidence.ts";

export type ToolMode = "disallowed" | "allowed" | "required";

export type ResponseDensity = "brief" | "normal" | "detailed";

export type BudgetProfileName =
  | "on_device_small"
  | "on_device_large"
  | "pcc";

export type TurnBudgets = {
  profile: BudgetProfileName;
  contextTokens: number;
  maxToolRounds: number;
  concurrency: number;
  toolTimeoutMs: number;
  earlySynthesizeWhenSufficient: boolean;
  /** Soft char budget for prompt assembly (derived from contextTokens). */
  maxPromptChars: number;
  /** Soft generation budget — raised dynamically for N-item / detailed asks. */
  maxOutputTokens: number;
};

export type ToolCard = {
  name: string;
  purpose: string;
  argsHint: string;
};

export type PreRunTask = {
  name: string;
  arguments: Record<string, unknown>;
  reason: string;
};

export type ClarificationPolicy = {
  /** Gate: FM may not open clarification UI unless true. */
  clarificationRequired: boolean;
  reason?: string;
  allowedInteractionTypes?: string[];
};

/** Phase 1 output: reply or tool. Phase 2 adds semantic blocks. */
export type OutputSchemaKind = "reply_or_tool" | "semantic_blocks_v1";

export type SemanticBlockType =
  | "short_answer"
  | "prose"
  | "bullet_list"
  | "numbered_steps"
  | "key_value"
  | "comparison"
  | "warning"
  | "source_list";

export type SemanticBlock =
  | { type: "short_answer"; text: string }
  | { type: "prose"; text: string }
  | { type: "bullet_list"; items: string[] }
  | { type: "numbered_steps"; items: string[] }
  | { type: "key_value"; pairs: Array<{ key: string; value: string }> }
  | {
      type: "comparison";
      columns: string[];
      rows: Array<{ label: string; values: string[] }>;
    }
  | { type: "warning"; text: string }
  | { type: "source_list"; sourceIds: string[] };

export type SemanticResponse = {
  blocks: SemanticBlock[];
};

export type ContextPacket = {
  currentRequest: string;
  recentTurns: Array<{ role: string; content: string }>;
  pendingStateText: string;
  attachmentSummaries: string[];
  /** Auto-retrieved memory snippets (not a model-visible tool). */
  memorySnippets: string[];
  evidence: TurnEvidence[];
  activeBrowserMeta: string;
  /**
   * Compact BuildSpec slice — only when Build capabilities are gated on.
   * Normal chat/research turns leave this undefined.
   */
  buildSpecSlice?: string;
};

export type ResolvedTurnState = {
  /** Deterministic follow-up handled without FM. */
  handled?: {
    kind: "cancel" | "confirm_yes" | "confirm_no" | "retry" | "ordinal" | "resume";
    content?: string;
    ordinal?: number;
    selectedLabel?: string;
  };
  pendingKind?: "clarification" | "confirm" | "action" | null;
  correctionNote?: string;
  attachmentRef?: string;
};

export type TurnProfile = {
  contextPacket: ContextPacket;
  tools: ToolCard[];
  toolMode: ToolMode;
  preRunTasks: PreRunTask[];
  clarificationPolicy: ClarificationPolicy;
  density: ResponseDensity;
  outputSchema: OutputSchemaKind;
  budgets: TurnBudgets;
  /** Domains unlocked this turn (for logging/tests). */
  domains: string[];
};

export const MAX_TOOLS_PER_TURN = 5;
export const PREFERRED_MAX_TOOLS = 3;

export const SEMANTIC_BLOCK_TYPES_V1: readonly SemanticBlockType[] = [
  "short_answer",
  "prose",
  "bullet_list",
  "numbered_steps",
  "key_value",
  "comparison",
  "warning",
  "source_list",
] as const;
