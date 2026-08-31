import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  anchorRetrievalQuery,
  isTimeSensitiveQuery,
  resolveTemporalGrounding,
} from "../lib/ai/orchestrator/temporal-grounding.ts";

describe("temporal grounding", () => {
  const now = new Date("2026-08-31T18:00:00.000Z");

  it("resolves today and this year", () => {
    const g = resolveTemporalGrounding({
      content: "What is the news today and who leads the polls this year?",
      now,
      timezone: "UTC",
    });
    assert.equal(g.year, 2026);
    assert.ok(g.resolvedPhrases.some((p) => p.phrase === "today"));
    assert.ok(g.resolvedPhrases.some((p) => p.phrase === "this year"));
    assert.equal(g.resolvedPhrases.find((p) => p.phrase === "this year")?.resolved, "2026");
    assert.ok(g.timeSensitive);
    assert.ok(g.freshnessRequired);
    assert.ok(g.queryAnchors.includes("2026"));
  });

  it("resolves last year and this semester", () => {
    const g = resolveTemporalGrounding({
      content: "How did markets perform last year this semester?",
      now,
      timezone: "UTC",
    });
    assert.ok(g.resolvedPhrases.some((p) => p.phrase === "last year"));
    assert.equal(
      g.resolvedPhrases.find((p) => p.phrase === "last year")?.resolved,
      "2025",
    );
    assert.ok(g.resolvedPhrases.some((p) => p.phrase === "this semester"));
    assert.equal(g.startPublishedDate, "2025-01-01");
    assert.equal(g.endPublishedDate, "2025-12-31");
  });

  it("anchors retrieval queries with resolved calendar context", () => {
    const g = resolveTemporalGrounding({
      content: "Utah football schedule this year",
      now,
      timezone: "UTC",
    });
    const q = anchorRetrievalQuery("Utah football schedule", g);
    assert.match(q, /2026/);
  });

  it("detects time-sensitive queries", () => {
    assert.equal(isTimeSensitiveQuery("What's the score tonight?"), true);
    assert.equal(isTimeSensitiveQuery("Explain photosynthesis"), false);
  });
});
