/**
 * Unified turn compile — parse intents and build TaskGraph before any tool call.
 */

import { scanRequest, type RequestLedger } from "./request-scanner.ts";
import {
  compileTaskGraph,
  ensureRetrievalNodes,
  type TaskGraph,
} from "./task-graph.ts";
import { isRetrievalRequiredForTurn } from "./retrieval-requirements.ts";
import { validateTaskPlan, type PlanValidationResult } from "./plan-validator.ts";
import {
  applyConversationDelta,
  classifyTurnRelation,
  compileResearchTurnPlan,
  compileTurnProfile,
  compileWebRetrievalPlan,
  resolveConversationDelta,
  resolveTurnTask,
  type TurnProfile,
} from "@/lib/ai/turn-environment";
import {
  emptyConversationTurnState,
  type ConversationTurnState,
} from "@/lib/ai/turn-environment/conversation-types.ts";
import type { TurnRelation } from "@/lib/ai/turn-environment/turn-relation.ts";
import type { TurnTaskResolution } from "@/lib/ai/turn-environment/turn-task.ts";
import type { ResearchTurnPlan } from "@/lib/ai/turn-environment/research-turn-plan.ts";
import type { CompileTurnOptions } from "@/lib/ai/turn-environment/compile.ts";
import { heuristicAskDecomposition } from "./ask-extractor.ts";
import {
  applyTemporalToTurnTask,
  resolveTemporalGrounding,
  type TemporalGrounding,
} from "./temporal-grounding.ts";

export type TurnRelationResult = {
  relation: TurnRelation;
  reactivateEntityLabel?: string;
};

export type TurnCompileResult = {
  conversationState: ConversationTurnState;
  turnRelation: TurnRelationResult;
  ledger: RequestLedger;
  graph: TaskGraph;
  planValidation: PlanValidationResult;
  turnTask: TurnTaskResolution;
  researchPlan: ResearchTurnPlan | null;
  profile: TurnProfile;
  webRetrievalPlan: ReturnType<typeof compileWebRetrievalPlan>;
  temporalGrounding: TemporalGrounding;
  retrievalRequired: boolean;
};

export type CompileTurnInput = {
  content: string;
  threadId?: string | null;
  priorConv: ConversationTurnState | null;
  profileOpts: Omit<CompileTurnOptions, "content" | "conversationState" | "turnRelation">;
};

/** Merge conversation entity hints into ledger metadata (for audit). */
function enrichLedgerFromConversation(
  ledger: RequestLedger,
  conv: ConversationTurnState | null,
): RequestLedger {
  if (!conv) return ledger;
  const entityLabels = conv.entities?.map((e) => e.label).filter(Boolean) ?? [];
  if (!entityLabels.length) return ledger;
  return {
    ...ledger,
    explicitApps: [...new Set([...ledger.explicitApps, ...entityLabels.slice(0, 5)])],
  };
}

export async function compileTurn(input: CompileTurnInput): Promise<TurnCompileResult> {
  const previous = input.priorConv ?? emptyConversationTurnState();
  const convDelta = await resolveConversationDelta({
    previous,
    userMessage: input.content,
  });
  const turnRelation = classifyTurnRelation({
    userMessage: input.content,
    previous: input.priorConv,
  });
  let conversationState = applyConversationDelta(input.priorConv, convDelta);
  conversationState = {
    ...conversationState,
    lastTurnRelation: turnRelation.relation,
  };

  const ledger = enrichLedgerFromConversation(
    scanRequest(input.content),
    conversationState,
  );

  const temporalGrounding = resolveTemporalGrounding({
    content: input.content,
    conv: conversationState,
  });

  let turnTask = resolveTurnTask({
    content: input.content,
    previous: conversationState,
    turnRelation: turnRelation.relation,
    reactivateEntityLabel: turnRelation.reactivateEntityLabel,
  });
  turnTask = applyTemporalToTurnTask(turnTask, temporalGrounding);

  if (temporalGrounding.freshnessRequired) {
    conversationState = {
      ...conversationState,
      freshnessRequirement: true,
      externalRetrievalRequired: true,
    };
  }

  const researchPlan = compileResearchTurnPlan({
    content: input.content,
    turnTask,
  });

  const retrieveSpecs =
    ledger.asks.length >= 2 && !researchPlan?.subtasks.length
      ? heuristicAskDecomposition(ledger, turnTask)
      : undefined;

  const retrievalRequired = isRetrievalRequiredForTurn({
    turnTask,
    temporalGrounding,
    conversationState,
    ledger,
  });

  let graph = compileTaskGraph({
    ledger,
    researchPlan,
    turnTask,
    retrieveSpecs,
    retrievalRequired,
  });

  const repair = ensureRetrievalNodes({
    graph,
    ledger,
    turnTask,
    researchPlan,
    retrievalRequired,
  });
  graph = repair.graph;

  let planValidation = validateTaskPlan({
    ledger,
    graph,
    researchPlan,
    retrievalRequired,
  });

  const webRetrievalPlan = compileWebRetrievalPlan({
    content: input.content,
    turnTask,
    conv: conversationState,
    turnRelation: turnRelation.relation,
    carrySubject: turnRelation.relation !== "topic_switch" && turnTask.subject != null,
    deeper: Boolean(conversationState.dissatisfactionSignal),
    temporalGrounding,
  });

  const profile = compileTurnProfile({
    content: input.content,
    ...input.profileOpts,
    conversationState,
    turnRelation: turnRelation.relation,
    reactivateEntityLabel: turnRelation.reactivateEntityLabel,
    evidence: undefined,
    temporalGrounding,
  });

  return {
    conversationState,
    turnRelation,
    ledger,
    graph,
    planValidation,
    turnTask,
    researchPlan,
    retrievalRequired,
    profile: {
      ...profile,
      researchPlan: researchPlan ?? undefined,
      webRetrievalPlan,
      /** Graph drives retrieval — deterministic URL/browser pre-run only. */
      preRunTasks: profile.preRunTasks.filter((t) => !t.name.startsWith("web.")),
    },
    webRetrievalPlan,
    temporalGrounding,
  };
}

export function mergeAskExtractorIntoGraph(
  graph: TaskGraph,
  ledger: RequestLedger,
  specs: Array<{
    id: string;
    label: string;
    query: string;
    capability?: "web.search" | "web.read" | "web.open" | "none";
    dependsOn?: string[];
    spanId?: string;
    askId?: string;
  }>,
  researchPlan?: ResearchTurnPlan | null,
): TaskGraph {
  const withoutRetrieve = graph.nodes.filter(
    (n) => n.kind !== "RETRIEVE" || n.id === "retrieve_primary",
  );
  const rebuilt = compileTaskGraph({
    ledger,
    researchPlan,
    retrieveSpecs: specs,
  });
  return {
    ...graph,
    nodes: [
      ...withoutRetrieve.filter((n) => n.kind !== "RETRIEVE"),
      ...rebuilt.nodes.filter((n) => n.kind === "RETRIEVE"),
    ],
    constraints: rebuilt.constraints,
  };
}
