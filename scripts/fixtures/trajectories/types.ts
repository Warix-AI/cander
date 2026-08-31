/**
 * Trajectory fixture types for conversation eval suite.
 */

import type {
  ConversationEmit,
  ConversationTurnState,
  EntityRef,
} from "../../lib/ai/turn-environment/conversation-types.ts";

export type AnswerContract = {
  mustAnswerDirectly?: boolean;
  mustNotAskClarification?: boolean;
  mustUseFreshEvidence?: boolean;
  mustNotRepeatPreviousAnswer?: boolean;
};

export type TrajectoryExpect = {
  activeEntityLabels?: string[];
  constraints?: Record<string, string>;
  exclusions?: string[];
  freshnessRequirement?: boolean;
  dissatisfactionSignal?: boolean;
  clarificationRequired?: boolean;
  externalRetrievalRequired?: boolean;
  internalDataRequired?: boolean;
  desiredAnswerShape?: string;
  currentOperation?: string;
  presentation?: string;
  requestedFields?: string[];
  resolutionMethod?: string;
  referencedItemLabel?: string;
  route?: {
    toolMode?: string;
    preRunIncludes?: string[];
    unnecessaryClarify?: boolean;
    minOutputTokens?: number;
  };
  answerContract?: AnswerContract;
};

export type TrajectoryTurn =
  | {
      role: "user";
      content: string;
      candidates?: { entities?: EntityRef[] };
      expect?: TrajectoryExpect;
    }
  | {
      role: "assistant";
      content: string;
      emit?: ConversationEmit;
    };

export type TrajectoryFixture = {
  id: string;
  category: string;
  tags: string[];
  seeded?: boolean;
  seedState?: Partial<ConversationTurnState>;
  turns: TrajectoryTurn[];
};
