/**
 * Semantic ConversationDelta resolver — tiny structured FM task.
 * Classifies what changed; never answers the user question.
 * `generate` is injectable so CI never needs live FM.
 */

import {
  emptyDelta,
  type ConversationDelta,
  type ConversationTurnState,
  type EntityRef,
} from "./conversation-types.ts";
import type { DeltaResolverInput } from "./deterministic-delta.ts";

export type SemanticDeltaGenerator = (opts: {
  system: string;
  prompt: string;
}) => Promise<string>;

const SYSTEM = `You classify conversation state changes only.
Return a single JSON object matching ConversationDelta fields.
Do NOT answer the user's question. Do NOT invent tools or prose.
Fields: intentChange, entityChanges, constraintAdds, constraintReplacements,
exclusions, answerShapeChange, dissatisfaction, freshness, references,
topicSwitch, forgetAllActive, internalDataRequired, externalRetrievalRequired,
unresolvedAmbiguity, resolutionConfidence, resolutionMethod.
Set resolutionMethod to "semantic". Prefer resolutionConfidence "medium" unless clear.`;

function summarizeState(state: ConversationTurnState): string {
  const ents = state.entities
    .filter((e) => e.contextClass !== "EXPIRED")
    .map((e) => `${e.id}:${e.label}[${e.contextClass}]`)
    .slice(0, 8);
  const rs = state.resultSets
    .filter((r) => r.contextClass !== "EXPIRED")
    .map(
      (r) =>
        `${r.resultSetId}:{${r.items.map((i) => `${i.ordinal}=${i.label}`).join(",")}}`,
    )
    .slice(0, 3);
  return JSON.stringify({
    intent: state.currentIntent,
    entities: ents,
    constraints: state.constraints,
    exclusions: state.exclusions,
    resultSets: rs,
    shape: state.desiredAnswerShape,
  });
}

function parseDeltaJson(raw: string): ConversationDelta | null {
  try {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    const obj = JSON.parse(raw.slice(start, end + 1)) as Partial<ConversationDelta>;
    return {
      ...emptyDelta(
        obj.resolutionConfidence === "high" ||
          obj.resolutionConfidence === "low"
          ? obj.resolutionConfidence
          : "medium",
        "semantic",
      ),
      ...obj,
      entityChanges: Array.isArray(obj.entityChanges) ? obj.entityChanges : [],
      constraintAdds: obj.constraintAdds ?? {},
      constraintReplacements: obj.constraintReplacements ?? {},
      exclusions: Array.isArray(obj.exclusions) ? obj.exclusions : [],
      resolutionMethod: "semantic",
      resolutionConfidence: obj.resolutionConfidence ?? "medium",
    };
  } catch {
    return null;
  }
}

/**
 * Heuristic fallback when no FM generate is provided (CI / offline).
 * Still not "answering" — only weak classification from candidates.
 */
export function resolveSemanticDeltaHeuristic(
  input: DeltaResolverInput,
): ConversationDelta {
  const content = input.userMessage.trim();
  const candidates = input.candidates?.entities ?? [];
  const active = input.previous.entities.filter(
    (e) => e.contextClass === "ACTIVE" || e.contextClass === "AVAILABLE",
  );

  // Two+ antecedents for "it" / "him" / "that"
  if (
    /\b(it|him|that|this)\b/i.test(content) &&
    (candidates.length >= 2 || active.length >= 2)
  ) {
    return {
      ...emptyDelta("low", "semantic"),
      unresolvedAmbiguity: true,
      resolutionConfidence: "low",
      resolutionMethod: "semantic",
    };
  }

  // Same name internal vs public — if candidates include both types
  const types = new Set(
    (candidates.length ? candidates : active).map((e) => e.type),
  );
  if (
    types.has("project") &&
    types.has("company") &&
    /\b(open|about|seo|competitor)/i.test(content)
  ) {
    return {
      ...emptyDelta("low", "semantic"),
      unresolvedAmbiguity: true,
      resolutionConfidence: "low",
      resolutionMethod: "semantic",
    };
  }

  // Soft correction / dissatisfaction without clear replace target
  if (/^(no|not that|wrong)\b/i.test(content)) {
    return {
      ...emptyDelta("medium", "semantic"),
      dissatisfaction: true,
      unresolvedAmbiguity: content.length < 24,
      resolutionConfidence: content.length < 24 ? "low" : "medium",
      resolutionMethod: "semantic",
    };
  }

  // Default: inherit intent, flag possible external need for question-like turns
  const q = /\?$|^(who|what|when|where|how|which)\b/i.test(content);
  const internalish =
    /my project|in build|workspace|edited most recently/i.test(content) ||
    input.previous.internalDataRequired ||
    input.previous.currentIntent === "list_projects";
  return {
    ...emptyDelta("medium", "semantic"),
    externalRetrievalRequired: q && !internalish,
    internalDataRequired: internalish,
    resolutionConfidence: "medium",
    resolutionMethod: "semantic",
  };
}

export async function resolveSemanticDelta(
  input: DeltaResolverInput,
  generate?: SemanticDeltaGenerator,
): Promise<ConversationDelta> {
  if (!generate) {
    return resolveSemanticDeltaHeuristic(input);
  }
  const prompt = [
    "## Previous state",
    summarizeState(input.previous),
    "",
    "## Candidates",
    JSON.stringify(
      (input.candidates?.entities ?? []).map((e: EntityRef) => ({
        id: e.id,
        type: e.type,
        label: e.label,
      })),
    ),
    "",
    "## User message",
    input.userMessage,
    "",
    "Return ConversationDelta JSON only.",
  ].join("\n");

  try {
    const raw = await generate({ system: SYSTEM, prompt });
    const parsed = parseDeltaJson(raw);
    if (parsed) return parsed;
  } catch {
    // fall through
  }
  return resolveSemanticDeltaHeuristic(input);
}

/**
 * Deterministic-first, semantic-second.
 * Always merges per-turn task resolution so intent/operation/shape
 * are re-derived even when subject context is inherited.
 */
export async function resolveConversationDelta(
  input: DeltaResolverInput,
  generate?: SemanticDeltaGenerator,
): Promise<ConversationDelta> {
  const { resolveDeterministicDelta } = await import(
    "./deterministic-delta.ts"
  );
  const { classifyTurnRelation, deltaHintsFromTurnRelation } = await import(
    "./turn-relation.ts"
  );
  const relationResult = classifyTurnRelation({
    userMessage: input.userMessage,
    previous: input.previous,
  });
  const { resolveTurnTask } = await import("./turn-task.ts");
  const task = resolveTurnTask({
    content: input.userMessage,
    previous: input.previous,
    turnRelation: relationResult.relation,
    reactivateEntityLabel: relationResult.reactivateEntityLabel,
  });

  const taskOverlay: Partial<ConversationDelta> = {
    intentChange: task.intent,
    operationChange: task.operation,
    answerShapeChange: task.answerShape,
    presentationChange: task.presentation,
    requestedFields: task.requestedFields,
    requestedItemCount: task.requestedItemCount,
    freshness: task.freshness || undefined,
    externalRetrievalRequired: task.retrievalNeeded || undefined,
  };

  const mergeTask = (base: ConversationDelta): ConversationDelta => {
    // Short constraint / reference follow-ups must keep shopping (or other) intent.
    // Overlaying task.intent would wipe e.g. find_laptop → lookup and break constraint stacks.
    const constraintOnlyFollowUp =
      base.resolutionConfidence === "high" &&
      base.intentChange === undefined &&
      !base.forgetAllActive &&
      (Object.keys(base.constraintAdds).length > 0 ||
        Object.keys(base.constraintReplacements).length > 0 ||
        (base.exclusions?.length ?? 0) > 0 ||
        Boolean(base.references?.priorResults?.length) ||
        Boolean(base.references?.evidence?.length));

    return {
      ...base,
      ...taskOverlay,
      freshness: base.freshness || task.freshness || undefined,
      dissatisfaction: base.dissatisfaction,
      forgetAllActive: base.forgetAllActive,
      externalRetrievalRequired: Boolean(
        base.externalRetrievalRequired || task.retrievalNeeded,
      ),
      answerShapeChange: base.answerShapeChange ?? task.answerShape,
      intentChange: constraintOnlyFollowUp
        ? undefined
        : base.intentChange !== undefined && base.intentChange !== null
          ? base.intentChange
          : task.intent,
      operationChange: task.operation,
      presentationChange: task.presentation,
      requestedFields: task.requestedFields,
      requestedItemCount: task.requestedItemCount,
      entityChanges: base.entityChanges,
      constraintAdds: {
        ...base.constraintAdds,
        ...(task.requestedFields.length
          ? { requestedFields: task.requestedFields.join(",") }
          : {}),
      },
      constraintReplacements: base.constraintReplacements,
      exclusions: base.exclusions,
    };
  };
  const relationHints = deltaHintsFromTurnRelation(relationResult, input.previous);
  const mergeRelation = (base: ConversationDelta): ConversationDelta => {
    if (
      !relationHints.entityChanges?.length &&
      !relationHints.topicSwitch
    ) {
      return base;
    }
    if (base.entityChanges?.length || base.topicSwitch) return base;
    return {
      ...base,
      entityChanges: [
        ...(base.entityChanges ?? []),
        ...(relationHints.entityChanges ?? []),
      ],
      topicSwitch: base.topicSwitch ?? relationHints.topicSwitch,
    };
  };

  const det = resolveDeterministicDelta(input);
  if (det && det.resolutionConfidence === "high") {
    return mergeRelation(mergeTask(det));
  }
  if (det && det.unresolvedAmbiguity && det.resolutionConfidence === "low") {
    return mergeRelation(mergeTask(det));
  }
  const sem = await resolveSemanticDelta(input, generate);
  if (det) {
    return mergeRelation(
      mergeTask({
        ...sem,
        ...det,
        entityChanges: [...(det.entityChanges || []), ...(sem.entityChanges || [])],
        constraintAdds: { ...sem.constraintAdds, ...det.constraintAdds },
        constraintReplacements: {
          ...sem.constraintReplacements,
          ...det.constraintReplacements,
        },
        exclusions: [...new Set([...(det.exclusions || []), ...(sem.exclusions || [])])],
        resolutionMethod: "mixed",
        resolutionConfidence:
          det.resolutionConfidence === "high"
            ? "high"
            : sem.resolutionConfidence,
      }),
    );
  }
  return mergeRelation(mergeTask(sem));
}
