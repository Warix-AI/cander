import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildRoleQueries,
  pickTopCandidates,
  scoreResearchCandidate,
} from "../lib/ai/build/research/score.ts";

describe("plan-first research scoring", () => {
  it("builds role+intent queries without solo business nouns", () => {
    const queries = buildRoleQueries({
      role: "hero",
      designIntent: "warm local landscaping marketing",
    });
    assert.ok(queries.length >= 1);
    for (const q of queries) {
      assert.match(q, /hero/i);
      assert.ok(!/^tree$/i.test(q.trim()));
    }
  });

  it("rejects headless-tree semantic mismatches", () => {
    const scored = scoreResearchCandidate({
      need: {
        role: "services",
        designIntent: "warm local landscaping marketing",
      },
      id: "bad",
      name: "Headless Tree",
      category: "data",
      deps: ["@headless-tree/core"],
      snippetPreview: "file tree view",
    });
    assert.ok(scored.rejectReason);
    assert.equal(scored.score, 0);
  });

  it("prefers role-matching marketing candidates", () => {
    const good = scoreResearchCandidate({
      need: { role: "hero", designIntent: "warm local marketing" },
      id: "1",
      name: "Hero Banner",
      category: "hero",
      snippetPreview: "marketing landing hero section",
    });
    const weak = scoreResearchCandidate({
      need: { role: "hero", designIntent: "warm local marketing" },
      id: "2",
      name: "Sidebar",
      category: "misc",
      snippetPreview: "utility",
    });
    assert.ok(!good.rejectReason);
    assert.ok(good.score > weak.score);
    const picked = pickTopCandidates([
      {
        id: "1",
        score: good.score,
        reasons: good.reasons,
        rejectReason: good.rejectReason,
      },
      {
        id: "2",
        score: weak.score,
        reasons: weak.reasons,
        rejectReason: weak.rejectReason,
      },
    ]);
    assert.equal(picked.selected?.id, "1");
  });
});
