import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  deterministicRenderPriority,
  renderComponentBreakdown,
  renderExaDirectAnswer,
  tryDeterministicRender,
} from "../lib/ai/orchestrator/deterministic-render.ts";
import {
  evaluatePccEscalation,
} from "../lib/ai/orchestrator/pcc-escalation.ts";
import { emitContentDelta } from "../lib/ai/orchestrator/stream-content.ts";
import {
  invalidateFmSessionsForThread,
  resetFmSessionRegistry,
  resolveFmSession,
} from "../lib/ai/runtime/native/fm-session.ts";
import {
  DEFAULT_PCC_REASONING_MATRIX,
  type PccReasoningLevel,
} from "../lib/ai/intelligence/pcc.ts";
import type { TurnEvidence } from "../lib/ai/orchestrator/evidence.ts";

const exaEvidence: TurnEvidence[] = [
  {
    id: "e1",
    ok: true,
    kind: "exa_synthesis",
    title: "Source",
    content: "The answer is 42 for this factual question.",
    groundingConfidence: "high",
  },
];

describe("deterministic render", () => {
  it("renders exa direct for simple factual turns", () => {
    const out = renderExaDirectAnswer("What is the answer?", exaEvidence);
    assert.ok(out?.includes("42"));
  });

  it("skips exa direct for explicit list requests", () => {
    const out = renderExaDirectAnswer("List every planet", exaEvidence);
    assert.equal(out, null);
  });

  it("priority orders research before exa", () => {
    const priority = deterministicRenderPriority({
      question: "calories?",
      evidence: exaEvidence,
      researchPlan: {
        subtasks: [
          { id: "a", label: "A", query: "a" },
          { id: "b", label: "B", query: "b" },
        ],
        unresolved: [],
        retrievalRound: 0,
        maxRetrievalRounds: 2,
      },
      researchCompletion: {
        complete: true,
        unresolved: [],
        calculatedTotal: 500,
        calculatedBreakdown: "a: 200\nb: 300",
        facts: [],
      },
    });
    assert.equal(priority, "research");
    const rendered = tryDeterministicRender({
      question: "calories?",
      evidence: exaEvidence,
      researchPlan: {
        subtasks: [
          { id: "a", label: "A", query: "a" },
          { id: "b", label: "B", query: "b" },
        ],
        unresolved: [],
        retrievalRound: 0,
        maxRetrievalRounds: 2,
      },
      researchCompletion: {
        complete: true,
        unresolved: [],
        calculatedTotal: 500,
        calculatedBreakdown: null,
        facts: [],
      },
    });
    assert.ok(rendered?.includes("500"));
  });

  it("component breakdown requires multi-part question", () => {
    const out = renderComponentBreakdown("single item", exaEvidence);
    assert.equal(out, null);
  });
});

describe("fm session registry", () => {
  it("reuses session for same thread profile and instructions", () => {
    resetFmSessionRegistry();
    const a = resolveFmSession({
      threadId: "t1",
      profile: "synthesis",
      instructions: "same instructions",
    });
    const b = resolveFmSession({
      threadId: "t1",
      profile: "synthesis",
      instructions: "same instructions",
    });
    assert.equal(a.sessionId, b.sessionId);
    assert.equal(b.reused, true);
  });

  it("invalidates all sessions for a thread", () => {
    resetFmSessionRegistry();
    resolveFmSession({
      threadId: "t2",
      profile: "synthesis",
      instructions: "x",
    });
    invalidateFmSessionsForThread("t2");
    const after = resolveFmSession({
      threadId: "t2",
      profile: "synthesis",
      instructions: "x",
    });
    assert.equal(after.reused, false);
  });
});

describe("pcc escalation", () => {
  it("escalates when model budget exhausted", () => {
    const d = evaluatePccEscalation({
      question: "Explain this in detail",
      modelBudgetExhausted: true,
      multiSubtaskResearch: true,
    });
    assert.ok(d);
    assert.equal(d!.level, "high");
    assert.equal(d!.profile, "plan");
  });

  it("reasoning matrix covers all levels", () => {
    const levels: PccReasoningLevel[] = ["none", "low", "medium", "high"];
    for (const level of levels) {
      assert.ok(DEFAULT_PCC_REASONING_MATRIX[level].maxTokens > 0);
    }
  });
});

describe("stream content", () => {
  it("emits content delta progress", () => {
    const events: string[] = [];
    emitContentDelta(
      (p) => {
        if (p.contentDelta) events.push(p.contentDelta);
      },
      "Hello world",
      true,
    );
    assert.deepEqual(events, ["Hello world"]);
  });
});
