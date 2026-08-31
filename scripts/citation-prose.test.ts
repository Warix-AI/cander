import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("citation prose normalization", () => {
  it("strips numeric citation clusters from assistant prose", async () => {
    const { stripInlineCitationMarkers, normalizeAssistantProse } = await import(
      "../lib/ai/orchestrator/citations.ts"
    );
    const raw = "BYU plays Utah Tech on September 5 [1][2].";
    assert.equal(
      stripInlineCitationMarkers(raw),
      "BYU plays Utah Tech on September 5.",
    );
    assert.equal(
      normalizeAssistantProse(raw, [
        { id: "1", title: "BYU Schedule", url: "https://byu.edu" },
      ]),
      "BYU plays Utah Tech on September 5.",
    );
  });

  it("strips evidence id markers from synthesis echoes", async () => {
    const { stripInlineCitationMarkers } = await import(
      "../lib/ai/orchestrator/citations.ts"
    );
    assert.equal(
      stripInlineCitationMarkers("See [src_a] for details."),
      "See for details.",
    );
  });

  it("leaves non-citation bracket content intact", async () => {
    const { stripInlineCitationMarkers } = await import(
      "../lib/ai/orchestrator/citations.ts"
    );
    const text = "Step [1] install the package first.";
    assert.equal(stripInlineCitationMarkers(text), text);
  });
});
