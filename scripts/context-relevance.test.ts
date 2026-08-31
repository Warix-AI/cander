import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("turn relation + selective context", () => {
  it("food → unrelated website is topic_switch without food subject", async () => {
    const { classifyTurnRelation } = await import(
      "../lib/ai/turn-environment/turn-relation.ts"
    );
    const { compileWebRetrievalPlan } = await import(
      "../lib/ai/turn-environment/web-retrieval-plan.ts"
    );
    const { resolveTurnTask } = await import(
      "../lib/ai/turn-environment/turn-task.ts"
    );
    const { buildSelectiveDialoguePrompt } = await import(
      "../lib/ai/assistant-behavior.ts"
    );

    const conv = {
      entities: [
        {
          id: "e1",
          type: "food",
          label: "In-N-Out burger",
          contextClass: "ACTIVE" as const,
        },
      ],
      topics: [],
      constraints: {},
      exclusions: [],
      resultSets: [],
      evidence: [],
      currentIntent: "lookup",
      desiredAnswerShape: "normal" as const,
      currentOperation: "lookup",
      requestedFields: [],
      requestedItemCount: null,
      presentation: null,
      freshnessRequirement: false,
      dissatisfactionSignal: false,
      clarificationRequired: false,
      internalDataRequired: false,
      externalRetrievalRequired: false,
    };

    const msg = "Summarize https://example.com/docs/getting-started";
    const rel = classifyTurnRelation({ userMessage: msg, previous: conv });
    assert.equal(rel.relation, "topic_switch");
    assert.equal(rel.carrySubject, false);

    const turnTask = resolveTurnTask({
      content: msg,
      previous: conv,
      turnRelation: rel.relation,
    });
    assert.equal(turnTask.subject, null);

    const plan = compileWebRetrievalPlan({
      content: msg,
      turnTask,
      conv,
      turnRelation: rel.relation,
    });
    assert.ok(!plan.query.toLowerCase().includes("burger"));
    assert.ok(!plan.query.toLowerCase().includes("in-n-out"));

    const prompt = buildSelectiveDialoguePrompt(
      [
        { role: "user", content: "How many calories in a double double?" },
        { role: "assistant", content: "About 670 calories." },
      ],
      msg,
      { relation: rel.relation },
    );
    assert.equal(prompt, msg);
  });

  it("food → sports → sports follow-up keeps sports context", async () => {
    const { classifyTurnRelation, deltaHintsFromTurnRelation } = await import(
      "../lib/ai/turn-environment/turn-relation.ts"
    );
    const { applyConversationDelta, emptyConversationTurnState } = await import(
      "../lib/ai/turn-environment/index.ts"
    );
    const { resolveTurnTask } = await import(
      "../lib/ai/turn-environment/turn-task.ts"
    );

    let state = emptyConversationTurnState();
    state = {
      ...state,
      entities: [
        {
          id: "f1",
          type: "food",
          label: "In-N-Out burger",
          contextClass: "ACTIVE",
        },
      ],
    };

    const sportsMsg = "When is BYU's first football game?";
    const sportsRel = classifyTurnRelation({
      userMessage: sportsMsg,
      previous: state,
    });
    assert.equal(sportsRel.relation, "topic_switch");
    state = applyConversationDelta(state, {
      entityChanges: deltaHintsFromTurnRelation(sportsRel, state).entityChanges ?? [],
      topicSwitch: deltaHintsFromTurnRelation(sportsRel, state).topicSwitch,
      constraintAdds: {},
      constraintReplacements: {},
      exclusions: [],
      resolutionConfidence: "high",
      resolutionMethod: "deterministic",
    });
    state = {
      ...state,
      entities: [
        ...state.entities.filter((e) => e.contextClass !== "ACTIVE"),
        {
          id: "s1",
          type: "sports",
          label: "BYU football",
          contextClass: "ACTIVE",
        },
      ],
      lastTurnRelation: sportsRel.relation,
    };

    const followUp = "What time?";
    const followRel = classifyTurnRelation({
      userMessage: followUp,
      previous: state,
    });
    assert.equal(followRel.relation, "continuation");

    const task = resolveTurnTask({
      content: followUp,
      previous: state,
      turnRelation: followRel.relation,
    });
    assert.ok(task.subject?.includes("BYU"));
  });

  it("food → website → back to the burger reactivates reference", async () => {
    const { classifyTurnRelation } = await import(
      "../lib/ai/turn-environment/turn-relation.ts"
    );
    const { resolveTurnTask } = await import(
      "../lib/ai/turn-environment/turn-task.ts"
    );
    const { compileWebRetrievalPlan } = await import(
      "../lib/ai/turn-environment/web-retrieval-plan.ts"
    );

    const state = {
      entities: [
        {
          id: "f1",
          type: "food",
          label: "In-N-Out burger",
          contextClass: "AVAILABLE",
        },
        {
          id: "w1",
          type: "website",
          label: "example.com",
          contextClass: "ACTIVE",
        },
      ],
      topics: [],
      constraints: {},
      exclusions: [],
      resultSets: [],
      evidence: [],
      currentIntent: "lookup",
      desiredAnswerShape: "normal" as const,
      currentOperation: "lookup",
      requestedFields: [],
      requestedItemCount: null,
      presentation: null,
      freshnessRequirement: false,
      dissatisfactionSignal: false,
      clarificationRequired: false,
      internalDataRequired: false,
      externalRetrievalRequired: false,
    };

    const msg = "Back to the burger — how many calories?";
    const rel = classifyTurnRelation({ userMessage: msg, previous: state });
    assert.equal(rel.relation, "reference");
    assert.ok(rel.reactivateEntityLabel?.toLowerCase().includes("burger"));

    const task = resolveTurnTask({
      content: msg,
      previous: state,
      turnRelation: rel.relation,
      reactivateEntityLabel: rel.reactivateEntityLabel,
    });
    assert.ok(task.subject?.toLowerCase().includes("burger"));

    const plan = compileWebRetrievalPlan({
      content: msg,
      turnTask: task,
      conv: state,
      turnRelation: rel.relation,
    });
    assert.ok(plan.query.toLowerCase().includes("burger"));
  });

  it("website A → website B switches domains", async () => {
    const { classifyTurnRelation } = await import(
      "../lib/ai/turn-environment/turn-relation.ts"
    );
    const { compileWebRetrievalPlan } = await import(
      "../lib/ai/turn-environment/web-retrieval-plan.ts"
    );
    const { resolveTurnTask } = await import(
      "../lib/ai/turn-environment/turn-task.ts"
    );

    const state = {
      entities: [
        {
          id: "a",
          type: "website",
          label: "site-a.com",
          contextClass: "ACTIVE",
        },
      ],
      topics: [],
      constraints: {},
      exclusions: [],
      resultSets: [],
      evidence: [],
      currentIntent: "lookup",
      desiredAnswerShape: "normal" as const,
      currentOperation: "lookup",
      requestedFields: [],
      requestedItemCount: null,
      presentation: null,
      freshnessRequirement: false,
      dissatisfactionSignal: false,
      clarificationRequired: false,
      internalDataRequired: false,
      externalRetrievalRequired: false,
    };

    const msg = "What's on https://site-b.com/pricing?";
    const rel = classifyTurnRelation({ userMessage: msg, previous: state });
    assert.equal(rel.relation, "topic_switch");

    const task = resolveTurnTask({
      content: msg,
      previous: state,
      turnRelation: rel.relation,
    });
    const plan = compileWebRetrievalPlan({
      content: msg,
      turnTask: task,
      conv: state,
      turnRelation: rel.relation,
    });
    assert.ok(plan.domains?.some((d) => d.includes("site-b")));
    assert.ok(!plan.query.includes("site-a"));
  });
});

describe("WebRetrievalPlan", () => {
  it("defaults factual questions to fast mode with synthesized text output", async () => {
    const { compileWebRetrievalPlan } = await import(
      "../lib/ai/turn-environment/web-retrieval-plan.ts"
    );
    const { resolveTurnTask } = await import(
      "../lib/ai/turn-environment/turn-task.ts"
    );
    const q = "Who is BYU playing in their first game?";
    const task = resolveTurnTask({ content: q, previous: null });
    const plan = compileWebRetrievalPlan({ content: q, turnTask: task });
    assert.equal(plan.mode, "fast");
    assert.equal(plan.output, "text");
    assert.ok(plan.escalationChain.includes("auto"));
  });

  it("uses object output for list/table field requests", async () => {
    const { compileWebRetrievalPlan } = await import(
      "../lib/ai/turn-environment/web-retrieval-plan.ts"
    );
    const { resolveTurnTask } = await import(
      "../lib/ai/turn-environment/turn-task.ts"
    );
    const q = "List every BYU football game with date and opponent";
    const task = resolveTurnTask({ content: q, previous: null });
    const plan = compileWebRetrievalPlan({ content: q, turnTask: task });
    assert.equal(plan.output, "object");
    assert.ok(["deep-lite", "auto", "deep"].includes(plan.mode));
  });
});
