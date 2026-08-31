import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  rankAndCapCitations,
  scoreSourceAuthority,
  verifyEvidenceForTask,
} from "../lib/ai/orchestrator/evidence-verification.ts";
import { resolveTemporalGrounding } from "../lib/ai/orchestrator/temporal-grounding.ts";
import type { TurnEvidence } from "../lib/ai/orchestrator/evidence.ts";

describe("evidence verification", () => {
  const now = new Date("2026-08-31T18:00:00.000Z");
  const grounding = resolveTemporalGrounding({
    content: "Denver Nuggets game score today",
    now,
    timezone: "UTC",
  });

  const node = {
    id: "retrieve_game",
    kind: "RETRIEVE" as const,
    label: "Nuggets score today",
    status: "RUNNING" as const,
    query: "Denver Nuggets game score today",
    capability: "web.search" as const,
    subtaskId: "retrieve_game",
  };

  it("prefers official domains", () => {
    assert.ok(scoreSourceAuthority("https://www.nba.com/game", "NBA") > 80);
    assert.ok(scoreSourceAuthority("https://en.wikipedia.org/wiki/Nuggets", "Wiki") < 40);
  });

  it("rejects stale year evidence for time-sensitive asks", () => {
    const evidence: TurnEvidence[] = [
      {
        id: "st_retrieve_game_1",
        kind: "search_result",
        title: "Old recap",
        content: "Final score from the 2023 season opener was 110-102.",
        url: "https://example.com/old",
        retrievedAt: now.toISOString(),
        sourceTool: "web.search",
        ok: true,
        subtaskId: "retrieve_game",
      },
    ];
    const result = verifyEvidenceForTask({
      node,
      evidence,
      grounding,
      turnTask: { subject: "Denver Nuggets" } as never,
    });
    assert.equal(result.verified, false);
    assert.ok(result.issues.includes("stale_year"));
    assert.ok(result.refinedQuery?.includes("2026"));
  });

  it("accepts grounded synthesis that matches the ask", () => {
    const evidence: TurnEvidence[] = [
      {
        id: "st_retrieve_game_1",
        kind: "exa_synthesis",
        title: "Tonight's score",
        content:
          "Denver Nuggets defeated the Lakers 118-112 on August 31, 2026.",
        url: "https://www.nba.com/game",
        retrievedAt: now.toISOString(),
        sourceTool: "web.search",
        ok: true,
        subtaskId: "retrieve_game",
      },
    ];
    const result = verifyEvidenceForTask({
      node,
      evidence,
      grounding,
      turnTask: { subject: "Denver Nuggets" } as never,
    });
    assert.equal(result.verified, true);
  });

  it("caps displayed citations to three ranked sources", () => {
    const cites = rankAndCapCitations([
      { id: "1", title: "Wiki", url: "https://en.wikipedia.org/x" },
      { id: "2", title: "NBA", url: "https://www.nba.com/x" },
      { id: "3", title: "Blog", url: "https://blog.example.com/x" },
      { id: "4", title: "Gov", url: "https://www.state.gov/x" },
    ]);
    assert.equal(cites.length, 3);
    assert.ok(cites.some((c) => c.url.includes("state.gov")));
    assert.ok(!cites.some((c) => c.url.includes("wikipedia")));
  });
});
