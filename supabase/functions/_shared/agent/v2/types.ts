/**
 * Turn Orchestrator V2 — bounded autonomous loop types.
 */

import type {
  ConversationState,
  ModelMessage,
  RetrievalSource,
  RunTurnResult,
  StatusEvent,
} from "../types.ts";
import type { TurnRetrievalState } from "./web-retrieval.ts";

export type ControllerAction =
  | "answer"
  | "web_search"
  | "web_open"
  | "knowledge_search"
  | "history_search"
  | "client_action"
  | "clarify";

export type AvailableTool = {
  name: string;
  description: string;
  category: string;
  execution: "server" | "client";
  readWrite: "read" | "write";
};

export type TurnCapabilities = {
  webSearch: boolean;
  webRead: boolean;
  workspaceKnowledge: boolean;
  historyRetrieval: boolean;
  clientTools: AvailableTool[];
  vision: boolean;
  locationContext: boolean;
  /** ISO date string for "today" awareness */
  serverNowIso: string;
  userTimezone?: string | null;
  locationHint?: string | null;
};

export type EvidenceItem = {
  id: string;
  kind: "web_search" | "web_page" | "knowledge" | "tool" | "history";
  title?: string;
  url?: string | null;
  content: string;
  publishedAt?: string | null;
  retrievedAt: string;
  sourceSessionId?: string | null;
  metadata?: Record<string, unknown>;
};

export type InformationNeed = {
  id: string;
  description: string;
  status: "open" | "resolved" | "failed";
};

export type ToolExecutionSummary = {
  name: string;
  ok: boolean;
  summary: string;
  at: string;
};

export type SearchSessionSummary = {
  id: string;
  queries: string[];
  resultIds: string[];
  at: string;
};

export type ComplexityClass = "trivial" | "normal" | "research";

export type TurnBudgetState = {
  complexity: ComplexityClass;
  maxControllerCycles: number;
  maxWebSearches: number;
  maxWebOpens: number;
  maxModelGenerations: number;
  maxKnowledgeSearches: number;
  controllerCycles: number;
  webSearches: number;
  webOpens: number;
  modelGens: number;
  knowledgeSearches: number;
};

export type ControllerDecision = {
  action: ControllerAction;
  reasonCode: string;
  informationNeeds?: string[];
  queries?: string[];
  sourceIdsToRead?: string[];
  toolName?: string | null;
  toolArguments?: Record<string, unknown> | null;
  canAnswerNow?: boolean;
  clarificationQuestion?: string | null;
  complexity?: ComplexityClass;
};

export type EvidenceBriefing = {
  facts: Array<{
    claim: string;
    sourceIds: string[];
    confidence: "high" | "medium" | "low";
    date?: string | null;
  }>;
  conflicts: string[];
  unresolved: string[];
  recommendedFollowups: string[];
};

export type AnswerValidation = {
  valid: boolean;
  issues: string[];
  recommendedAction:
    | "accept"
    | "regenerate"
    | "retrieve_more"
    | "clarify"
    | "fail";
};

export type ConversationWorkingMemory = ConversationState & {
  /** Primary entity/topic the conversation is currently about */
  activeEntity?: string;
  activeTopic?: string;
  recentLists?: Array<{
    id: string;
    items: Array<{
      ordinal: number;
      label: string;
      entityId?: string;
      sourceIds?: string[];
    }>;
  }>;
  references?: Array<{
    phrase: string;
    resolvesTo: string;
    sourceTurnId?: string;
  }>;
};

export type TurnState = {
  turnId: string;
  chatId: string;
  ownerId: string;
  userRequest: string;
  userMessageId: string;
  nextSortOrder: number;
  images?: string[];
  capabilities: TurnCapabilities;
  workingMemory: ConversationWorkingMemory;
  recentMessages: Array<{
    id?: string;
    role: string;
    content: string;
    sort_order?: number;
  }>;
  retrievedHistory: Array<{
    id: string;
    role: string;
    content: string;
    sort_order: number;
  }>;
  /** Snippets from other chats (workspace/Space scoped) */
  crossChatMemory: Array<{
    chatId: string;
    chatTitle: string;
    summary: string;
    snippet: string;
    scope: "chat" | "workspace" | "project" | "owner";
    score: number;
  }>;
  evidence: EvidenceItem[];
  toolHistory: ToolExecutionSummary[];
  searchSessions: SearchSessionSummary[];
  unresolved: InformationNeed[];
  completedNeeds: InformationNeed[];
  budgets: TurnBudgetState;
  briefing: EvidenceBriefing | null;
  statusEvents: StatusEvent[];
  clientActionsQueued: Array<{
    name: string;
    arguments: Record<string, unknown>;
  }>;
  /** Pending knowledge search request for client */
  knowledgeQuery?: string | null;
  clarifyText?: string | null;
  failureStage: string;
  /** Per-turn web retrieval tracking (dedup, exact URL, session reuse). */
  retrieval: TurnRetrievalState;
};

export type V2RunResult = RunTurnResult & {
  orchestratorVersion: "v2";
  evidenceCount?: number;
  controllerCycles?: number;
};

export type { ModelMessage, RetrievalSource, StatusEvent, RunTurnResult };
