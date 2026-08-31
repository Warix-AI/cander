/**
 * Per-turn task resolution — subject inherits; task/shape re-resolve every turn.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  applyConversationDelta,
  emptyConversationTurnState,
  resolveConversationDelta,
  resolveTurnTask,
  compileTurnProfile,
} from "../lib/ai/turn-environment/index.ts";
import {
  inferResponseContract,
  validateResponseContract,
} from "../lib/ai/answer-shape/index.ts";

describe("resolveTurnTask — current turn owns the task", () => {
  it("count → list inherits subject but changes operation", () => {
    let state = emptyConversationTurnState();
    state = {
      ...state,
      currentIntent: "count",
      currentOperation: "count",
      entities: [
        {
          id: "e1",
          type: "org",
          label: "Acme",
          contextClass: "ACTIVE",
        },
      ],
    };
    const task = resolveTurnTask({
      content: "List every open role and when they were posted.",
      previous: state,
    });
    assert.equal(task.subject, "Acme");
    assert.equal(task.operation, "list");
    assert.ok(task.presentation === "list" || task.presentation === "table");
    assert.ok(task.requestedFields.includes("date"));
    assert.equal(task.retrievalNeeded, true);
  });

  it("summary → deepen increases depth and prose presentation", () => {
    const task = resolveTurnTask({
      content: "Go deeper and explain it in paragraphs.",
      previous: {
        ...emptyConversationTurnState(),
        currentIntent: "lookup",
        entities: [
          {
            id: "t1",
            type: "topic",
            label: "photosynthesis",
            contextClass: "ACTIVE",
          },
        ],
      },
    });
    assert.equal(task.operation, "deepen");
    assert.equal(task.presentation, "prose");
    assert.equal(task.depth, "detailed");
  });

  it("answer → five bullets sets item count", () => {
    const task = resolveTurnTask({
      content: "Give me five bullets.",
      previous: emptyConversationTurnState(),
    });
    assert.equal(task.requestedItemCount, 5);
    assert.equal(task.presentation, "bullet_list");
  });

  it("compare presentation", () => {
    const task = resolveTurnTask({
      content: "Compare them.",
      previous: emptyConversationTurnState(),
    });
    assert.equal(task.operation, "compare");
    assert.equal(task.presentation, "comparison");
  });

  it("short answer presentation", () => {
    const task = resolveTurnTask({
      content: "Just give me the answer.",
      previous: emptyConversationTurnState(),
    });
    assert.equal(task.presentation, "short_answer");
    assert.equal(task.depth, "brief");
  });
});

describe("delta merge re-resolves intent/shape each turn", () => {
  it("does not stick count shape onto a list follow-up", async () => {
    let state = emptyConversationTurnState();
    const d1 = await resolveConversationDelta({
      previous: state,
      userMessage: "How many tickets are left?",
    });
    state = applyConversationDelta(state, d1);
    assert.equal(state.currentOperation, "count");

    state = {
      ...state,
      entities: [
        {
          id: "e1",
          type: "event",
          label: "Spring concert",
          contextClass: "ACTIVE",
        },
      ],
    };

    const d2 = await resolveConversationDelta({
      previous: state,
      userMessage: "List every remaining show date and time.",
    });
    state = applyConversationDelta(state, d2);
    assert.equal(state.currentOperation, "list");
    assert.notEqual(state.currentIntent, "count");
    assert.equal(state.externalRetrievalRequired, true);
    assert.ok(state.requestedFields.includes("date"));
    assert.ok(state.requestedFields.includes("time"));

    const profile = compileTurnProfile({
      content: "List every remaining show date and time.",
      conversationState: state,
    });
    assert.ok(profile.budgets.maxOutputTokens >= 800);
    assert.ok(
      profile.contextPacket.pendingStateText.includes("operation=list"),
    );
    assert.ok(
      profile.preRunTasks.some((t) => t.name === "web.search"),
      "list follow-up should schedule retrieval",
    );
  });
});

describe("response contract validates list completeness", () => {
  it("flags a one-line answer when a complete list was requested", () => {
    const contract = inferResponseContract("List every item.", {
      presentation: "list",
      operation: "list",
      depth: "standard",
    });
    assert.equal(contract.mustComplete, true);
    const bad = validateResponseContract("There are 12.", contract);
    assert.equal(bad.complete, false);
    assert.ok(bad.issues.includes("EXPECTED_LIST_OR_TABLE"));
  });

  it("expands token budget for N bullets", () => {
    const contract = inferResponseContract("Give me 12 detailed tips.");
    assert.equal(contract.requestedItemCount, 12);
    assert.ok(contract.outputTokenBudget >= 12 * 35);
  });
});
