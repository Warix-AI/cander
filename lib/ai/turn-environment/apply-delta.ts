/**
 * Apply ConversationDelta onto previous ConversationTurnState.
 */

import {
  emptyConversationTurnState,
  nextConvId,
  type ContextClass,
  type ConversationDelta,
  type ConversationEmit,
  type ConversationTurnState,
  type EntityRef,
  type EvidenceRef,
  type ResultSetRef,
  type TopicRef,
} from "./conversation-types.ts";

function demoteActive<T extends { contextClass: ContextClass }>(
  items: T[],
): T[] {
  return items.map((x) =>
    x.contextClass === "ACTIVE" ? { ...x, contextClass: "AVAILABLE" as const } : x,
  );
}

function activateById<T extends { id?: string; contextClass: ContextClass }>(
  items: T[],
  id: string,
): T[] {
  return items.map((x) => {
    const xid = "id" in x ? (x as { id: string }).id : "";
    if (xid === id) return { ...x, contextClass: "ACTIVE" as const };
    if (x.contextClass === "ACTIVE") {
      return { ...x, contextClass: "AVAILABLE" as const };
    }
    return x;
  });
}

export function applyConversationDelta(
  previous: ConversationTurnState | null | undefined,
  delta: ConversationDelta,
): ConversationTurnState {
  const prev = previous ?? emptyConversationTurnState();
  let entities = [...prev.entities];
  let constraints = { ...prev.constraints };
  let exclusions = [...prev.exclusions];
  let resultSets = [...prev.resultSets];
  let evidence = [...prev.evidence];
  let topics = [...prev.topics];

  if (delta.forgetAllActive) {
    entities = demoteActive(entities).map((e) =>
      e.contextClass === "AVAILABLE"
        ? { ...e, contextClass: "EXPIRED" as const }
        : e,
    );
    topics = demoteActive(topics).map((t) =>
      t.contextClass === "AVAILABLE"
        ? { ...t, contextClass: "EXPIRED" as const }
        : t,
    );
    resultSets = demoteActive(resultSets);
    evidence = demoteActive(evidence);
    constraints = {};
  }

  if (delta.topicSwitch?.expireTopicIds?.length) {
    const expire = new Set(delta.topicSwitch.expireTopicIds);
    topics = topics.map((t) =>
      expire.has(t.id) ? { ...t, contextClass: "EXPIRED" as const } : t,
    );
    evidence = evidence.map((ev) =>
      ev.contextClass === "ACTIVE"
        ? { ...ev, contextClass: "EXPIRED" as const }
        : ev,
    );
    resultSets = resultSets.map((rs) =>
      rs.contextClass === "ACTIVE"
        ? { ...rs, contextClass: "EXPIRED" as const }
        : rs,
    );
  }
  if (delta.topicSwitch?.activateTopicId) {
    const id = delta.topicSwitch.activateTopicId;
    const found = topics.find((t) => t.id === id);
    if (found) {
      topics = activateById(topics, id) as TopicRef[];
    } else if (delta.topicSwitch.activateLabel) {
      topics = demoteActive(topics);
      topics.push({
        id,
        label: delta.topicSwitch.activateLabel,
        contextClass: "ACTIVE",
      });
    }
  }

  for (const change of delta.entityChanges) {
    if (change.op === "set" || change.op === "add") {
      entities = demoteActive(entities);
      const existing = entities.findIndex((e) => e.id === change.entity.id);
      const next = { ...change.entity, contextClass: "ACTIVE" as const };
      if (existing >= 0) entities[existing] = next;
      else entities.push(next);
    } else if (change.op === "remove" && change.from) {
      entities = entities.map((e) =>
        e.id === change.from!.id || e.label === change.from!.label
          ? { ...e, contextClass: "EXPIRED" as const }
          : e,
      );
      evidence = evidence.map((ev) =>
        ev.contextClass === "ACTIVE"
          ? { ...ev, contextClass: "EXPIRED" as const }
          : ev,
      );
      resultSets = resultSets.map((rs) =>
        rs.contextClass === "ACTIVE"
          ? { ...rs, contextClass: "EXPIRED" as const }
          : rs,
      );
    } else if (change.op === "replace") {
      if (change.from) {
        entities = entities.map((e) =>
          e.id === change.from!.id || e.label === change.from!.label
            ? { ...e, contextClass: "EXPIRED" as const }
            : e,
        );
      }
      if (change.to) {
        entities = demoteActive(entities);
        entities.push({ ...change.to, contextClass: "ACTIVE" });
        // Topic/domain shift — expire prior web evidence refs.
        evidence = evidence.map((ev) =>
          ev.contextClass === "ACTIVE"
            ? { ...ev, contextClass: "EXPIRED" as const }
            : ev,
        );
      }
    }
  }

  for (const [k, v] of Object.entries(delta.constraintAdds)) {
    constraints[k] = v;
  }
  for (const [k, v] of Object.entries(delta.constraintReplacements)) {
    constraints[k] = v;
  }
  for (const ex of delta.exclusions) {
    if (!exclusions.includes(ex)) exclusions.push(ex);
  }

  if (delta.references?.priorResults?.length) {
    for (const ref of delta.references.priorResults) {
      resultSets = resultSets.map((rs) =>
        rs.resultSetId === ref.resultSetId
          ? { ...rs, contextClass: "ACTIVE" as const }
          : rs.contextClass === "ACTIVE"
            ? { ...rs, contextClass: "AVAILABLE" as const }
            : rs,
      );
    }
  }
  if (delta.references?.evidence?.length) {
    for (const ref of delta.references.evidence) {
      evidence = evidence.map((e) =>
        e.evidenceId === ref.evidenceId ||
        (ref.url && e.url === ref.url)
          ? { ...e, contextClass: "ACTIVE" as const }
          : e,
      );
    }
  }

  const clarificationRequired =
    Boolean(delta.unresolvedAmbiguity) &&
    (delta.resolutionConfidence === "low" ||
      delta.resolutionConfidence === "medium");

  const next: ConversationTurnState = {
    currentIntent:
      delta.intentChange !== undefined
        ? delta.intentChange
        : prev.currentIntent,
    entities,
    constraints,
    exclusions,
    resultSets,
    evidence,
    topics,
    // Answer shape / operation / presentation re-resolved each turn when present.
    // Sticky inheritance only when the delta did not re-specify (rare).
    desiredAnswerShape:
      delta.answerShapeChange !== undefined && delta.answerShapeChange !== null
        ? delta.answerShapeChange
        : delta.intentChange !== undefined
          ? "normal"
          : prev.desiredAnswerShape,
    currentOperation:
      delta.operationChange !== undefined
        ? delta.operationChange
        : prev.currentOperation,
    requestedFields:
      delta.requestedFields !== undefined
        ? [...delta.requestedFields]
        : delta.intentChange !== undefined
          ? []
          : [...prev.requestedFields],
    requestedItemCount:
      delta.requestedItemCount !== undefined
        ? delta.requestedItemCount
        : delta.intentChange !== undefined
          ? null
          : prev.requestedItemCount,
    presentation:
      delta.presentationChange !== undefined
        ? delta.presentationChange
        : delta.intentChange !== undefined
          ? null
          : prev.presentation,
    freshnessRequirement: Boolean(delta.freshness),
    dissatisfactionSignal: Boolean(delta.dissatisfaction),
    clarificationRequired,
    internalDataRequired: Boolean(
      delta.internalDataRequired ?? prev.internalDataRequired,
    ),
    externalRetrievalRequired: Boolean(
      delta.externalRetrievalRequired ||
        delta.freshness ||
        delta.dissatisfaction,
    ),
    lastDelta: delta,
  };

  // Fresh dissatisfaction/freshness turn: don't inherit stale external flag forever
  if (delta.internalDataRequired) {
    next.externalRetrievalRequired = false;
    next.internalDataRequired = true;
  } else if (!delta.freshness && !delta.dissatisfaction && !delta.externalRetrievalRequired) {
    next.externalRetrievalRequired = Boolean(delta.externalRetrievalRequired);
  }

  return next;
}

/** Apply assistant emit observations into state (trajectory harness). */
export function applyConversationEmit(
  previous: ConversationTurnState,
  emit: ConversationEmit,
): ConversationTurnState {
  let state = { ...previous };
  if (emit.intent) state = { ...state, currentIntent: emit.intent };
  if (emit.constraints) {
    state = {
      ...state,
      constraints: { ...state.constraints, ...emit.constraints },
    };
  }
  if (emit.entities?.length) {
    let entities = demoteActive(state.entities);
    for (const e of emit.entities) {
      entities.push({
        id: e.id || nextConvId("ent"),
        type: e.type || "entity",
        label: e.label,
        contextClass: "ACTIVE",
      });
    }
    state = { ...state, entities };
  }
  if (emit.resultSet?.items?.length) {
    const resultSets = demoteActive(state.resultSets);
    const rs: ResultSetRef = {
      resultSetId: emit.resultSet.resultSetId || nextConvId("rs"),
      contextClass: "ACTIVE",
      items: emit.resultSet.items.map((it, i) => ({
        itemId: it.itemId || nextConvId("item"),
        ordinal: it.ordinal ?? i + 1,
        label: it.label,
      })),
    };
    resultSets.push(rs);
    state = { ...state, resultSets };
  }
  if (emit.evidence?.length) {
    let evidence = demoteActive(state.evidence);
    for (const e of emit.evidence) {
      evidence.push({
        evidenceId: e.evidenceId || nextConvId("ev"),
        url: e.url,
        title: e.title,
        sourceType: e.sourceType,
        contextClass: "ACTIVE",
      } satisfies EvidenceRef);
    }
    state = { ...state, evidence };
  }
  if (emit.topic) {
    let topics = demoteActive(state.topics);
    topics.push({
      id: emit.topic.id || nextConvId("topic"),
      label: emit.topic.label,
      contextClass: "ACTIVE",
    });
    state = { ...state, topics };
  }
  return state;
}

export function activeEntities(state: ConversationTurnState): EntityRef[] {
  return state.entities.filter((e) => e.contextClass === "ACTIVE");
}

export function activeResultSet(
  state: ConversationTurnState,
): ResultSetRef | null {
  return (
    state.resultSets.find((r) => r.contextClass === "ACTIVE") ??
    state.resultSets.find((r) => r.contextClass === "AVAILABLE") ??
    null
  );
}
