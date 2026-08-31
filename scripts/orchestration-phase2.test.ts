import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { applyHistoryTransform } from "../lib/ai/turn-environment/history-transform.ts";
import {
  ModelScheduler,
  categoryForFmRound,
  DEFAULT_MODEL_BUDGET,
} from "../lib/ai/orchestrator/model-scheduler.ts";
import { applyEgressPolicy } from "../lib/ai/orchestrator/egress-policy.ts";
import {
  classifyWriteTool,
  createWriteOperation,
  retryPolicyForWrite,
} from "../lib/ai/orchestrator/write-safety.ts";
import { runBoundedRecovery } from "../lib/ai/orchestrator/bounded-recovery.ts";

describe("history transform", () => {
  it("drops transcript on topic_switch", () => {
    const prompt = applyHistoryTransform({
      messages: [
        { role: "user", content: "Old food question" },
        { role: "assistant", content: "Old answer" },
      ],
      latestUserContent: "When is the BYU game?",
      turnRelation: "topic_switch",
    });
    assert.equal(prompt, "When is the BYU game?");
  });
});

describe("model scheduler", () => {
  it("budgets by category", () => {
    const s = new ModelScheduler({ ...DEFAULT_MODEL_BUDGET, generation: 1 });
    assert.equal(s.record("generation"), true);
    assert.equal(s.record("generation"), false);
    assert.equal(categoryForFmRound(0), "generation");
    assert.equal(categoryForFmRound(-1), "planning");
  });
});

describe("egress policy", () => {
  it("trims outbound query and strips internal keys", () => {
    const out = applyEgressPolicy({
      query: "x".repeat(600),
      debug: true,
      retrievalHints: { subject: "y".repeat(200), operation: "lookup" },
    });
    assert.equal((out.query as string).length, 512);
    assert.equal(out.debug, undefined);
    assert.ok((out.retrievalHints as { subject: string }).subject.length <= 120);
  });
});

describe("write safety", () => {
  it("blocks high-risk sends without confirmation", () => {
    const policy = classifyWriteTool("email.send");
    assert.ok(policy?.requiresConfirmation);
    const op = createWriteOperation("email.send");
    assert.equal(op?.status, "blocked");
    assert.equal(retryPolicyForWrite(op!), "never_auto_retry");
  });

  it("allows reconcilable calendar writes", () => {
    const op = createWriteOperation("calendar.create");
    assert.equal(op?.status, "pending");
    assert.equal(retryPolicyForWrite(op!), "reconcile");
  });
});

describe("bounded recovery", () => {
  it("stops at max rounds", async () => {
    let n = 0;
    const { result, roundsUsed, exhausted } = await runBoundedRecovery({
      maxRounds: 2,
      initial: 0,
      isComplete: (v) => v >= 3,
      runRound: async () => {
        n += 1;
        return n;
      },
    });
    assert.equal(result, 2);
    assert.equal(roundsUsed, 2);
    assert.equal(exhausted, true);
  });
});
