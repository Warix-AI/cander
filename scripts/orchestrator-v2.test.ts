/**
 * Orchestrator V2 behavioral helpers + loop simulation.
 * Run: npm run test:orchestrator
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  liveInfoHint,
  resolveReference,
  simulateControllerLoop,
  tryFastPathAction,
  validateAnswerLite,
} from "../lib/ai/orchestrator/v2-helpers.ts";
import { preferOrchestratorV2 } from "../lib/ai/orchestrator/flags.ts";

describe("orchestrator v2 fast path", () => {
  it("greetings answer directly", () => {
    assert.equal(tryFastPathAction("hello"), "answer");
    assert.equal(tryFastPathAction("whats the weather today"), null);
  });
});

describe("orchestrator v2 live hints", () => {
  it("detects weather and world news without requiring search keyword", () => {
    assert.equal(liveInfoHint("What's the weather today?"), true);
    assert.equal(liveInfoHint("What's going on in the world today?"), true);
    assert.equal(liveInfoHint("explain recursion"), false);
  });
});

describe("orchestrator v2 reference resolution", () => {
  it("resolves the second one from recentLists", () => {
    const label = resolveReference("Tell me more about the second one", {
      recentLists: [
        {
          id: "l1",
          items: [
            { ordinal: 1, label: "Story A" },
            { ordinal: 2, label: "Story B" },
            { ordinal: 3, label: "Story C" },
          ],
        },
      ],
    });
    assert.equal(label, "Story B");
  });

  it("resolves that from recentReferences", () => {
    const label = resolveReference("Has that changed?", {
      recentReferences: ["Netflix subscription price"],
    });
    assert.equal(label, "Netflix subscription price");
  });
});

describe("orchestrator v2 answer validator", () => {
  it("blocks knowledge-cutoff when web unused", () => {
    const v = validateAnswerLite({
      answer:
        "I don't have real-time access. My knowledge cutoff is December 2023. Check CNN.",
      liveLikely: true,
      webAvailable: true,
      webAttempted: false,
      evidenceCount: 0,
    });
    assert.equal(v.valid, false);
    assert.equal(v.recommendedAction, "retrieve_more");
    assert.ok(v.issues.includes("MISSING_RETRIEVAL"));
  });

  it("accepts grounded answer after retrieval", () => {
    const v = validateAnswerLite({
      answer: "Highs near 88°F in Vineyard with clear skies.",
      liveLikely: true,
      webAvailable: true,
      webAttempted: true,
      evidenceCount: 3,
    });
    assert.equal(v.valid, true);
  });
});

describe("orchestrator v2 controller loop simulation", () => {
  it("search → open → answer sequence", () => {
    const r = simulateControllerLoop([
      { action: "web_search" },
      { action: "web_open" },
      { action: "answer" },
    ]);
    assert.equal(r.webSearches, 1);
    assert.equal(r.webOpens, 1);
    assert.equal(r.answered, true);
  });

  it("weak search then retry then answer", () => {
    const r = simulateControllerLoop([
      { action: "web_search" },
      { action: "web_search" },
      { action: "answer" },
    ]);
    assert.equal(r.webSearches, 2);
    assert.equal(r.answered, true);
  });
});

describe("orchestrator v2 flag", () => {
  it("defaults to v2 preference on", () => {
    assert.equal(preferOrchestratorV2(), true);
  });
});
