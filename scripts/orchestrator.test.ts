/**
 * Orchestrator unit tests: router, sufficiency, context, citations, history, AcmeWhatever.
 * Run: npm run test:orchestrator
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { routeDeterministic, isInternalResultBlob } from "../lib/ai/orchestrator/router.ts";
import { checkRetrievalSufficiency } from "../lib/ai/orchestrator/sufficiency.ts";
import { buildContext } from "../lib/ai/orchestrator/context-builder.ts";
import { validateCitations } from "../lib/ai/orchestrator/citations.ts";
import { createKeywordHistoryRetriever } from "../lib/ai/orchestrator/history-retriever.ts";
import { isAgentOrchestratorEnabled } from "../lib/ai/orchestrator/flags.ts";

describe("deterministic router", () => {
  it("A: greeting → answer_direct, 0 planner", () => {
    const r = routeDeterministic("hello");
    assert.equal(r.kind, "answer_direct");
    assert.match(r.reason, /stable_simple|empty/);
  });

  it("D: explain recursion → answer_direct", () => {
    const r = routeDeterministic("explain recursion");
    assert.equal(r.kind, "answer_direct");
  });

  it("F: latest news → web_retrieve", () => {
    const r = routeDeterministic("what's the latest news today?");
    assert.equal(r.kind, "web_retrieve");
    assert.equal(r.needsWeb, true);
  });

  it("H: our pricing → knowledge_retrieve", () => {
    const r = routeDeterministic("what's our pricing?");
    assert.equal(r.kind, "knowledge_retrieve");
    assert.equal(r.needsKnowledge, true);
  });

  it("AcmeWhatever CEO → web_retrieve (not instant IDK path)", () => {
    const r = routeDeterministic("Who is the CEO of AcmeWhatever?");
    assert.equal(r.kind, "web_retrieve");
    assert.equal(r.needsWeb, true);
  });

  it("create project → client_action", () => {
    const r = routeDeterministic("create a new project called Demo");
    assert.equal(r.kind, "client_action");
  });
});

describe("sufficiency", () => {
  it("zero results → insufficient", () => {
    const s = checkRetrievalSufficiency({ query: "CEO of Acme", sources: [] });
    assert.equal(s.sufficient, false);
    assert.equal(s.reason, "zero_results");
  });

  it("good overlap → sufficient", () => {
    const s = checkRetrievalSufficiency({
      query: "Who is the CEO of Acme Corp?",
      sources: [
        {
          id: "web_1",
          title: "Acme Corp names Jane Doe CEO",
          snippet: "Jane Doe was appointed chief executive officer of Acme Corp.",
          kind: "web",
        },
      ],
    });
    assert.equal(s.sufficient, true);
  });
});

describe("context builder", () => {
  it("protects newest turns and skips Internal-result blobs", () => {
    const built = buildContext({
      systemPrompt: "sys",
      recentMessages: [
        { id: "1", role: "user", content: "old" },
        {
          id: "bad",
          role: "user",
          content: "Internal result for web.search: junk",
        },
        { id: "2", role: "assistant", content: "hi" },
        { id: "3", role: "user", content: "who is that?" },
      ],
      maxContextTokens: 2000,
    });
    assert.ok(built.counts.recent >= 2);
    assert.ok(
      !built.messages.some((m) => isInternalResultBlob(m.content)),
    );
    const lastUser = [...built.messages].reverse().find((m) => m.role === "user");
    assert.equal(lastUser?.content, "who is that?");
  });
});

describe("citations", () => {
  it("strips fabricated URLs", () => {
    const v = validateCitations({
      answer: "See https://evil.example/fake and https://ok.example/a",
      sources: [{ id: "1", title: "ok", url: "https://ok.example/a" }],
    });
    assert.ok(v.strippedUrls.some((u) => u.includes("evil.example")));
    assert.ok(v.text.includes("ok.example"));
    assert.ok(v.text.includes("[source omitted]"));
  });
});

describe("history retriever", () => {
  it("keyword search returns overlapping older turns", async () => {
    const retriever = createKeywordHistoryRetriever([
      {
        id: "a",
        role: "user",
        content: "We discussed the Orion launch timeline",
        sort_order: 1,
      },
      {
        id: "b",
        role: "assistant",
        content: "Orion slips to Q3",
        sort_order: 2,
      },
      { id: "c", role: "user", content: "hello", sort_order: 3 },
    ]);
    const hits = await retriever.search({
      chatId: "x",
      query: "what about Orion?",
      excludeIds: new Set(["c"]),
    });
    assert.ok(hits.some((h) => /Orion/i.test(h.content)));
  });
});

describe("feature flag", () => {
  it("orchestrator enabled by default", () => {
    assert.equal(isAgentOrchestratorEnabled(), true);
  });
});
