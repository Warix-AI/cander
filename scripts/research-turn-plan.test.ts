import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("ResearchTurnPlan decomposition", () => {
  it("decomposes Taco Bell + McDonald's calorie ask into two subtasks", async () => {
    const { compileResearchTurnPlan } = await import(
      "../lib/ai/turn-environment/research-turn-plan.ts"
    );
    const { resolveTurnTask } = await import(
      "../lib/ai/turn-environment/turn-task.ts"
    );
    const q =
      "If I had three spicy potato soft tacos from Taco Bell and a large Sprite from McDonald's, how many calories would that be?";
    const turnTask = resolveTurnTask({ content: q, previous: null });
    const plan = compileResearchTurnPlan({ content: q, turnTask });
    assert.ok(plan);
    assert.equal(plan!.objective, "total_calories");
    assert.equal(plan!.calculation, "sum");
    assert.equal(plan!.subtasks.length, 2);
    assert.ok(
      plan!.subtasks.some((s) => /taco bell/i.test(s.query)),
    );
    assert.ok(
      plan!.subtasks.some((s) => /mcdonald|sprite/i.test(s.query)),
    );
    const taco = plan!.subtasks.find((s) => /taco/i.test(s.label));
    assert.equal(taco?.quantity, 3);
  });

  it("decomposes three-phone compare into per-entity subtasks", async () => {
    const { compileResearchTurnPlan } = await import(
      "../lib/ai/turn-environment/research-turn-plan.ts"
    );
    const { resolveTurnTask } = await import(
      "../lib/ai/turn-environment/turn-task.ts"
    );
    const q =
      "Compare iPhone 17, Pixel 11, and Galaxy S26 prices and battery sizes.";
    const turnTask = resolveTurnTask({ content: q, previous: null });
    const plan = compileResearchTurnPlan({ content: q, turnTask });
    assert.ok(plan);
    assert.equal(plan!.objective, "compare");
    assert.equal(plan!.subtasks.length, 3);
    assert.ok(plan!.subtasks.every((s) => s.fields?.includes("price")));
    assert.ok(plan!.subtasks.every((s) => s.fields?.includes("battery")));
  });

  it("validateResearchCompletion requires all subtask values for sum", async () => {
    const {
      compileResearchTurnPlan,
      validateResearchCompletion,
    } = await import("../lib/ai/turn-environment/research-turn-plan.ts");
    const { resolveTurnTask } = await import(
      "../lib/ai/turn-environment/turn-task.ts"
    );
    const q =
      "If I had three tacos from Taco Bell and a Sprite from McDonald's, how many calories total?";
    const turnTask = resolveTurnTask({ content: q, previous: null });
    const plan = compileResearchTurnPlan({ content: q, turnTask });
    assert.ok(plan && plan.subtasks.length >= 2);

    const partial = validateResearchCompletion(plan!, [
      {
        id: `st_${plan!.subtasks[0]!.id}_1`,
        kind: "search_result",
        title: "Taco Bell nutrition",
        content: "Spicy Potato Soft Taco 240 calories per taco",
        retrievedAt: new Date().toISOString(),
        sourceTool: "web.search",
        ok: true,
        subtaskId: plan!.subtasks[0]!.id,
      },
    ]);
    assert.equal(partial.complete, false);
    assert.ok(partial.unresolved.length >= 1);

    const full = validateResearchCompletion(plan!, [
      {
        id: `st_${plan!.subtasks[0]!.id}_1`,
        kind: "search_result",
        title: "Taco Bell nutrition",
        content: "Spicy Potato Soft Taco 240 calories",
        retrievedAt: new Date().toISOString(),
        sourceTool: "web.search",
        ok: true,
        subtaskId: plan!.subtasks[0]!.id,
      },
      {
        id: `st_${plan!.subtasks[1]!.id}_1`,
        kind: "search_result",
        title: "McDonald's Sprite",
        content: "Large Sprite 210 calories",
        retrievedAt: new Date().toISOString(),
        sourceTool: "web.search",
        ok: true,
        subtaskId: plan!.subtasks[1]!.id,
      },
    ]);
    assert.equal(full.complete, true);
    assert.ok(full.calculatedTotal != null && full.calculatedTotal > 0);
  });
});

describe("food to BYU topic switch isolation", () => {
  it("food calories → BYU/Utah question is topic_switch with no food in query", async () => {
    const { classifyTurnRelation } = await import(
      "../lib/ai/turn-environment/turn-relation.ts"
    );
    const { compileWebRetrievalPlan } = await import(
      "../lib/ai/turn-environment/web-retrieval-plan.ts"
    );
    const { resolveTurnTask } = await import(
      "../lib/ai/turn-environment/turn-task.ts"
    );
    const { compileTurnProfile } = await import(
      "../lib/ai/turn-environment/compile.ts"
    );
    const { filterEvidenceForCurrentTurn } = await import(
      "../lib/ai/orchestrator/evidence-hygiene.ts"
    );

    const conv = {
      entities: [
        {
          id: "f1",
          type: "food",
          label: "In-N-Out double double",
          contextClass: "ACTIVE" as const,
        },
      ],
      topics: [],
      constraints: { attribute: "calories", source: "FDA nutrition label" },
      exclusions: [],
      resultSets: [],
      evidence: [],
      currentIntent: "lookup",
      desiredAnswerShape: "normal" as const,
      currentOperation: "lookup",
      requestedFields: ["calories"],
      requestedItemCount: null,
      presentation: null,
      freshnessRequirement: false,
      dissatisfactionSignal: false,
      clarificationRequired: false,
      internalDataRequired: false,
      externalRetrievalRequired: false,
    };

    const msg =
      "When will Utah Utes and BYU football face off this year?";
    const rel = classifyTurnRelation({ userMessage: msg, previous: conv });
    assert.equal(rel.relation, "topic_switch");

    const turnTask = resolveTurnTask({
      content: msg,
      previous: conv,
      turnRelation: rel.relation,
    });
    assert.equal(turnTask.subject, null);

    const webPlan = compileWebRetrievalPlan({
      content: msg,
      turnTask,
      conv,
      turnRelation: rel.relation,
    });
    assert.ok(!/in-n-out|burger|calorie|fda|nutrition/i.test(webPlan.query));

    const profile = compileTurnProfile({
      content: msg,
      conversationState: { ...conv, lastTurnRelation: rel.relation },
      turnRelation: rel.relation,
    });
    assert.ok(
      !/FDA|nutrition label|In-N-Out/i.test(
        profile.contextPacket.pendingStateText,
      ),
    );
    assert.equal(profile.contextPacket.memorySnippets.length, 0);

    const { evidence, dropped } = filterEvidenceForCurrentTurn(
      [
        {
          id: "1",
          kind: "exa_synthesis",
          title: "FDA nutrition",
          content: "Double double has 670 calories per FDA label",
          retrievedAt: new Date().toISOString(),
          sourceTool: "web.search",
          ok: true,
        },
        {
          id: "2",
          kind: "exa_synthesis",
          title: "BYU schedule",
          content: "BYU plays Utah on November 29",
          retrievedAt: new Date().toISOString(),
          sourceTool: "web.search",
          ok: true,
        },
      ],
      {
        turnTask,
        conversationState: conv,
        userMessage: msg,
        turnRelation: rel.relation,
      },
    );
    assert.ok(dropped >= 1);
    assert.ok(
      !evidence.some((e) => /fda|670 calories/i.test(e.content)),
    );
  });
});
