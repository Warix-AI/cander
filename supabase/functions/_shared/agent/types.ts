/** Shared types for Edge Turn Orchestrator (and mirrored client tests). */

export type RouteKind =
  | "answer_direct"
  | "web_retrieve"
  | "knowledge_retrieve"
  | "client_action"
  | "planner";

export type DeterministicRoute = {
  kind: RouteKind;
  reason: string;
  /** Suggested client tools when kind === client_action */
  clientActions?: string[];
  needsWeb?: boolean;
  needsKnowledge?: boolean;
  ambiguous?: boolean;
};

export type ConversationState = {
  topics?: string[];
  entities?: string[];
  decisions?: string[];
  facts?: string[];
  unresolvedThreads?: string[];
  recentReferences?: string[];
  relevantSearchSessionIds?: string[];
};

export type RetrievalSource = {
  id: string;
  title: string;
  url?: string | null;
  snippet?: string;
  kind: "web" | "knowledge" | "history";
};

export type ModelMessage = {
  role: "system" | "user" | "assistant";
  content: string;
  images?: string[];
};

export type ModelPurpose = "plan" | "answer" | "rewrite" | "sufficiency";

export type ModelCapabilities = {
  structuredOutput: boolean;
  vision: boolean;
  streaming: boolean;
  maxContextTokens: number;
};

export type ModelCompleteRequest = {
  messages: ModelMessage[];
  purpose: ModelPurpose;
  jsonSchema?: Record<string, unknown>;
  signal?: AbortSignal;
  images?: string[];
};

export type ModelCompleteResult = {
  text: string;
  modelId: string;
};

export type TurnBudget = {
  maxPlannerCalls: number;
  maxWebSearches: number;
  maxRetrievalRounds: number;
  maxModelGenerations: number;
  timeoutMs: number;
};

export const NORMAL_TURN_BUDGET: TurnBudget = {
  maxPlannerCalls: 1,
  maxWebSearches: 3,
  maxRetrievalRounds: 3,
  maxModelGenerations: 5,
  timeoutMs: 90_000,
};

export const RESEARCH_TURN_BUDGET: TurnBudget = {
  maxPlannerCalls: 2,
  maxWebSearches: 6,
  maxRetrievalRounds: 5,
  maxModelGenerations: 8,
  timeoutMs: 150_000,
};

export type StatusEvent = {
  phase:
    | "thinking"
    | "routing"
    | "retrieving"
    | "searching"
    | "reading"
    | "generating"
    | "client_action"
    | "done"
    | "error";
  label: string;
  detail?: string;
};

export type ClientActionRequest = {
  name: string;
  arguments: Record<string, unknown>;
};

export type RunTurnResult = {
  turnId: string;
  chatId: string;
  userMessageId: string;
  assistantMessageId: string | null;
  content: string;
  status: "completed" | "failed" | "cancelled" | "paused_for_client";
  offline: boolean;
  condensationOccurred: boolean;
  citations: RetrievalSource[];
  clientActions: ClientActionRequest[];
  statusEvents: StatusEvent[];
  observability: Record<string, unknown>;
};

export function isInternalResultBlob(content: string): boolean {
  return /^\s*Internal result for\b/i.test(content.trim());
}
