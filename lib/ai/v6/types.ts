/**
 * Cander AI Runtime V6 — schema.
 * Completeness is checked against user-language surface spans, not the model alone.
 */

export type SurfaceSpanType =
  | "probable_request"
  | "condition"
  | "constraint"
  | "reference";

export type SurfaceSpan = {
  id: string;
  text: string;
  type: SurfaceSpanType;
};

export type SurfaceExpectation = {
  spans: SurfaceSpan[];
  signals: {
    probableRequestCount: number;
    hasQuestionMarks: boolean;
    hasConjunctions: boolean;
    hasEnumeration: boolean;
    hasUrl: boolean;
    hasFileReference: boolean;
    hasMath: boolean;
    hasTemporalReference: boolean;
    hasContextReference: boolean;
    hasPriorChatReference: boolean;
  };
};

export type ContextGate = {
  currentThread: true;
  searchMemory: boolean;
  searchPriorChats: boolean;
  inspectKnowledgeBaseMetadata: boolean;
};

export type RetrievalScope = {
  userId: string;
  tenantId: string;
  workspaceId?: string;
  threadId?: string;
};

export type CompactTurn = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type ContextEntity = {
  id: string;
  name: string;
  kind?: string;
};

export type ContextItem = {
  id: string;
  text: string;
  score?: number;
  source?: string;
};

export type KnowledgeBaseHint = {
  id: string;
  title: string;
  score?: number;
};

export type ResolvedReference = {
  phrase: string;
  status: "resolved" | "ambiguous" | "unresolved";
  target?: { id: string; name: string };
  candidates?: { id: string; name: string; score: number }[];
};

export type ContextPacket = {
  now: string;
  recentTurns: CompactTurn[];
  activeEntities: ContextEntity[];
  relevantMemories: ContextItem[];
  priorChatMatches: ContextItem[];
  knowledgeBaseHints: KnowledgeBaseHint[];
  resolvedReferences: ResolvedReference[];
};

export type RequestKind =
  | "fact"
  | "explain"
  | "compare"
  | "summarize"
  | "calculate"
  | "research";

export type SubjectRef =
  | { type: "named"; value: string }
  | { type: "context"; ref: string }
  | { type: "request_result"; requestId: string; field?: string };

export type Dependency =
  | { type: "scalar"; requestId: string }
  | { type: "map"; requestId: string; as: string };

export type InputRef =
  | { literal: unknown }
  | { requestId: string };

export type Request = {
  id: string;
  kind: RequestKind;
  subject?: SubjectRef;
  property?: string;
  qualifiers?: Record<string, unknown>;
  dependencies?: Dependency[];
  inputs?: InputRef[];
  surfaceSpanIds?: string[];
  /** Code-side expression for calculate nodes (never from model arithmetic). */
  expression?: Expression;
};

export type ResponseSpec = {
  ordering: "request_order" | "synthesized";
  detail: "short" | "normal" | "deep";
};

export type TurnSpec = {
  requests: Request[];
  response: ResponseSpec;
};

export type ParseOutcome =
  | { type: "ready"; spec: TurnSpec }
  | {
      type: "clarification_required";
      ambiguity: {
        phrase: string;
        candidates?: string[];
        question: string;
      };
    };

export type ParseCoverage = {
  surfaceSpanCount: number;
  coveredSpanIds: string[];
  uncoveredSpanIds: string[];
  status: "complete" | "incomplete" | "ambiguous";
};

export type NormalizedRequest = {
  request: Request;
  subjectType?: string;
  property: {
    raw?: string;
    canonicalKey?: string;
    status: "exact" | "mapped" | "unmatched";
  };
};

export type SourceType =
  | "deterministic"
  | "context"
  | "memory"
  | "chat_history"
  | "knowledge_base"
  | "web"
  | "model"
  | "hybrid";

export type KnowledgePolicy = {
  key: string;
  volatility: "stable" | "changing" | "live";
  allowedSources: SourceType[];
  preferredSources: SourceType[];
  requiresExternalEvidence: boolean;
  modelAllowed: boolean;
  maxAge?: number;
};

export type ResolutionStatus =
  | "verified"
  | "policy_trusted"
  | "unresolved"
  | "conflicting"
  | "blocked_upstream";

export type SourcePlan = {
  strategy: SourceType;
  reason: string;
  policyKey?: string;
  matchedPolicy: boolean;
};

export type ExecutionState =
  | "pending"
  | "ready"
  | "running"
  | "complete"
  | "blocked";

export type ExecutionNode = {
  requestId: string;
  sourcePlan: SourcePlan;
  dependencies: Dependency[];
  executionState: ExecutionState;
};

export type RequestGraph = {
  nodes: ExecutionNode[];
};

export type EvidenceScores = {
  subjectMatch: number;
  propertyMatch: number;
  relevance: number;
  authority: number;
  freshnessValid: boolean;
};

export type Evidence = {
  id: string;
  sourceType:
    | "context"
    | "memory"
    | "chat_history"
    | "knowledge_base"
    | "web";
  value?: unknown;
  excerpt?: string;
  source?: {
    title?: string;
    url?: string;
    documentId?: string;
    chatId?: string;
  };
  observedAt?: string;
  scores: Record<string, EvidenceScores>;
};

export type RequestResult = {
  requestId: string;
  status: ResolutionStatus;
  value?: unknown;
  evidenceIds: string[];
  reason?: string;
};

export type ExpressionInput =
  | { literal: number }
  | { requestId: string; field?: string }
  | Expression;

export type Expression = {
  op:
    | "add"
    | "subtract"
    | "multiply"
    | "divide"
    | "sum"
    | "average"
    | "compare";
  args: ExpressionInput[];
};

export type UserCoverageSpanStatus =
  | "answered"
  | "clarification_needed"
  | "unresolved"
  | "blocked"
  | "non_request";

export type UserCoverage = {
  surfaceSpans: {
    spanId: string;
    status: UserCoverageSpanStatus;
    requestIds: string[];
  }[];
  complete: boolean;
};

export type AnswerBundle = {
  spec: TurnSpec;
  surfaceExpectation: SurfaceExpectation;
  results: RequestResult[];
  evidence: Evidence[];
  coverage: UserCoverage;
};

export type CachedFact = {
  key: string;
  value: unknown;
  observedAt: string;
  ttlMs?: number;
};

export type ActiveCalculation = {
  subject: string;
  unit?: string;
  perItem?: number;
  quantity?: number;
};

export type MemoryDelta = {
  activeEntities?: ContextEntity[];
  verifiedFacts?: CachedFact[];
  activeCalculation?: ActiveCalculation;
  topic?: string;
};

export type TurnTrace = {
  input: string;
  surfaceExpectation: SurfaceExpectation;
  contextGate: ContextGate;
  contextResolution: {
    currentThreadHits: number;
    memoryHits: number;
    priorChatHits: number;
    kbHints: number;
  };
  parseOutcome: ParseOutcome;
  parseCoverage?: ParseCoverage;
  normalization: {
    requestId: string;
    rawProperty?: string;
    canonicalKey?: string;
    status: string;
  }[];
  sourcePlans: SourcePlan[];
  executionWaves: string[][];
  requestResults: RequestResult[];
  userCoverage: UserCoverage;
  renderer: "deterministic" | "apple" | "cloud";
  /** How many requests planned a web strategy (whether or not fetch ran). */
  webPlannedCount: number;
  /** How many web provider invocations actually ran. */
  webExecutedCount: number;
  evidenceCount: number;
  failureStage?:
    | "surface"
    | "context"
    | "parse"
    | "parse_coverage"
    | "normalization"
    | "routing"
    | "retrieval"
    | "verification"
    | "conflict"
    | "dependency"
    | "derivation"
    | "coverage"
    | "render";
  fastPath?: "arithmetic" | "conversational" | "url" | "file";
};

export const MAX_MAP_EXPANSION = 25;
