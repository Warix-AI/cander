/**
 * Conversation turn IR — Delta (what changed) vs State (accumulated).
 * ACTIVE / AVAILABLE / EXPIRED is per item, not conversation-wide.
 */

export type ContextClass = "ACTIVE" | "AVAILABLE" | "EXPIRED";

export type ResolutionConfidence = "high" | "medium" | "low";
export type ResolutionMethod = "deterministic" | "semantic" | "mixed";

export type AnswerShapeKind =
  | "brief"
  | "normal"
  | "detailed"
  | "key_points";

export type EntityRef = {
  id: string;
  type: string;
  label: string;
  contextClass: ContextClass;
};

export type EvidenceRef = {
  evidenceId: string;
  url?: string;
  sourceType?: string;
  title?: string;
  contextClass: ContextClass;
};

export type ResultItemRef = {
  itemId: string;
  ordinal: number;
  label: string;
};

export type ResultSetRef = {
  resultSetId: string;
  items: ResultItemRef[];
  contextClass: ContextClass;
};

export type TopicRef = {
  id: string;
  label: string;
  contextClass: ContextClass;
};

export type EntityChange =
  | { op: "set" | "add"; entity: EntityRef }
  | { op: "remove" | "replace"; from?: EntityRef; to?: EntityRef };

export type ConversationDelta = {
  intentChange?: string | null;
  entityChanges: EntityChange[];
  constraintAdds: Record<string, string>;
  constraintReplacements: Record<string, string>;
  exclusions: string[];
  answerShapeChange?: AnswerShapeKind | null;
  /** Per-turn operation (count/list/compare/…) — always re-resolved. */
  operationChange?: string | null;
  requestedFields?: string[];
  requestedItemCount?: number | null;
  presentationChange?: string | null;
  dissatisfaction?: boolean;
  freshness?: boolean;
  references?: {
    priorResults?: Array<{
      resultSetId: string;
      itemId: string;
      ordinal?: number;
    }>;
    evidence?: Array<{
      evidenceId: string;
      url?: string;
      sourceType?: string;
    }>;
  };
  topicSwitch?: {
    expireTopicIds?: string[];
    activateTopicId?: string;
    activateLabel?: string;
  };
  forgetAllActive?: boolean;
  internalDataRequired?: boolean;
  externalRetrievalRequired?: boolean;
  unresolvedAmbiguity?: boolean;
  resolutionConfidence: ResolutionConfidence;
  resolutionMethod: ResolutionMethod;
};

export type ConversationTurnState = {
  currentIntent: string | null;
  entities: EntityRef[];
  constraints: Record<string, string>;
  exclusions: string[];
  resultSets: ResultSetRef[];
  evidence: EvidenceRef[];
  topics: TopicRef[];
  desiredAnswerShape: AnswerShapeKind;
  /** Last resolved operation for this thread turn. */
  currentOperation: string | null;
  requestedFields: string[];
  requestedItemCount: number | null;
  presentation: string | null;
  freshnessRequirement: boolean;
  dissatisfactionSignal: boolean;
  clarificationRequired: boolean;
  internalDataRequired: boolean;
  externalRetrievalRequired: boolean;
  lastDelta?: ConversationDelta;
};

/** Structured observations emitted by assistant turns in trajectory fixtures. */
export type ConversationEmit = {
  intent?: string;
  entities?: Array<Partial<EntityRef> & { label: string }>;
  constraints?: Record<string, string>;
  resultSet?: {
    resultSetId?: string;
    items: Array<{ label: string; ordinal?: number; itemId?: string }>;
  };
  evidence?: Array<{
    evidenceId?: string;
    url?: string;
    title?: string;
    sourceType?: string;
  }>;
  topic?: { id?: string; label: string };
};

export function emptyConversationTurnState(): ConversationTurnState {
  return {
    currentIntent: null,
    entities: [],
    constraints: {},
    exclusions: [],
    resultSets: [],
    evidence: [],
    topics: [],
    desiredAnswerShape: "normal",
    currentOperation: null,
    requestedFields: [],
    requestedItemCount: null,
    presentation: null,
    freshnessRequirement: false,
    dissatisfactionSignal: false,
    clarificationRequired: false,
    internalDataRequired: false,
    externalRetrievalRequired: false,
  };
}

export function emptyDelta(
  confidence: ResolutionConfidence,
  method: ResolutionMethod,
): ConversationDelta {
  return {
    entityChanges: [],
    constraintAdds: {},
    constraintReplacements: {},
    exclusions: [],
    resolutionConfidence: confidence,
    resolutionMethod: method,
  };
}

let idSeq = 0;
export function nextConvId(prefix: string): string {
  idSeq += 1;
  return `${prefix}_${idSeq}`;
}

export function resetConvIdSeq(): void {
  idSeq = 0;
}
