/**
 * Answer-shaping: generic evidence compression + intent → format.
 * Run: node --experimental-strip-types --test scripts/answer-shape.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  compressEvidenceForSynthesis,
  deterministicAnswerFromEvidence,
  inferAnswerShape,
  looksLikeContextOverflow,
  shrinkEvidenceForRetry,
  stripEvidenceNoise,
} from "../lib/ai/answer-shape/index.ts";

describe("inferAnswerShape", () => {
  it("maps short factual asks to fact", () => {
    assert.equal(
      inferAnswerShape("How many calories in an apple?").kind,
      "fact",
    );
    assert.equal(inferAnswerShape("What is the population of Japan?").kind, "fact");
  });

  it("maps comparisons generically", () => {
    assert.equal(
      inferAnswerShape("Compare solar vs wind for a home in Texas").kind,
      "comparison",
    );
  });

  it("maps calculations generically", () => {
    assert.equal(
      inferAnswerShape("Add the calories of both burgers and a fry").kind,
      "calculation",
    );
  });

  it("maps deep research", () => {
    assert.equal(
      inferAnswerShape("Do a deep research overview of EV battery recycling").kind,
      "research",
    );
  });

  it("maps lists", () => {
    assert.equal(
      inferAnswerShape("List the top 5 open source vector databases").kind,
      "list",
    );
  });
});

describe("compressEvidenceForSynthesis", () => {
  it("strips noise and stays under budget", () => {
    const shape = inferAnswerShape("What is the capital of France?");
    const compact = compressEvidenceForSynthesis({
      question: "What is the capital of France?",
      shape,
      profile: "onDevice",
      items: [
        {
          id: "1",
          title: "France - Wikipedia",
          url: "https://en.wikipedia.org/wiki/France",
          content:
            "Home Menu Subscribe Cookie policy. Paris is the capital and most populous city of France. Related articles Share this. " +
            "https://example.com/foo " +
            "Paris has been France's capital for centuries.",
          kind: "web_page",
        },
        {
          id: "2",
          title: "Random blog",
          url: "https://medium.com/x/france",
          content: "Paris is nice in the spring. Cookie policy Sign in.",
          kind: "search_result",
        },
        {
          id: "3",
          title: "Duplicate wiki mirror",
          url: "https://en.wikipedia.org/wiki/Paris",
          content: "Paris is the capital of France.",
          kind: "search_result",
        },
      ],
    });
    assert.ok(compact.length >= 1);
    assert.ok(compact.length <= shape.maxEvidenceItems);
    const total = compact.reduce((n, c) => n + c.excerpt.length, 0);
    assert.ok(total <= shape.maxEvidenceChars + 200);
    assert.ok(!/cookie policy/i.test(compact.map((c) => c.excerpt).join(" ")));
    assert.ok(compact.some((c) => /wikipedia/i.test(c.domain || c.url || "")));
  });

  it("shrinkEvidenceForRetry halves load", () => {
    const shape = inferAnswerShape("Explain quantum entanglement briefly");
    const compact = compressEvidenceForSynthesis({
      question: "Explain quantum entanglement briefly",
      shape,
      profile: "cloud",
      items: Array.from({ length: 8 }, (_, i) => ({
        id: `e${i}`,
        title: `Source ${i}`,
        url: `https://example${i}.edu/page`,
        content: `Relevant fact number ${i} about quantum entanglement and spin. `.repeat(8),
        kind: "web_page",
      })),
    });
    const shrunk = shrinkEvidenceForRetry(compact);
    assert.ok(shrunk.length <= compact.length);
    assert.ok(shrunk.length >= 1);
  });
});

describe("stripEvidenceNoise", () => {
  it("removes html and urls", () => {
    const out = stripEvidenceNoise(
      "<p>Useful claim about widgets.</p><nav>Menu</nav> https://spam.example/x",
    );
    assert.match(out, /Useful claim/);
    assert.doesNotMatch(out, /https:/);
    assert.doesNotMatch(out, /<p>/);
  });
});

describe("deterministicAnswerFromEvidence", () => {
  it("never dumps raw search chrome", () => {
    const shape = inferAnswerShape("How tall is the Eiffel Tower?");
    const text = deterministicAnswerFromEvidence({
      question: "How tall is the Eiffel Tower?",
      shape,
      evidence: [
        {
          id: "1",
          title: "Eiffel Tower",
          url: "https://en.wikipedia.org/wiki/Eiffel_Tower",
          domain: "en.wikipedia.org",
          excerpt: "The Eiffel Tower is 330 metres tall including antennas.",
          authority: 0.9,
        },
      ],
    });
    assert.match(text, /330/);
    assert.doesNotMatch(text, /here's what the search returned/i);
    assert.doesNotMatch(text, /exa/i);
  });
});

describe("looksLikeContextOverflow", () => {
  it("detects common overflow phrasing", () => {
    assert.equal(looksLikeContextOverflow("prompt is too long for context window"), true);
    assert.equal(looksLikeContextOverflow("network timeout"), false);
  });
});
