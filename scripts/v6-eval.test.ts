/**
 * V6 production-style trajectory eval.
 * Asserts structural TurnTrace fields, not just answer prose.
 *
 * Run with: NEXT_PUBLIC_AI_V6_RUNTIME=1 node --experimental-strip-types --test scripts/v6-eval.test.ts
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  canonicalizeProperty,
  clearMemoryStore,
  computeParseCoverage,
  getPolicy,
  planSource,
  normalizeRequests,
  resolveEvidenceConflict,
  runTurn,
  surfacePrepass,
  type Evidence,
  type TurnTrace,
  type V6TurnResult,
} from "../lib/ai/v6/index.ts";

const WS = "ws-eval";

function baseReq(content: string, threadId: string) {
  return {
    content,
    title: "eval",
    workspaceId: WS,
    threadId,
  };
}

async function turn(
  content: string,
  threadId: string,
  opts?: Parameters<typeof runTurn>[1],
): Promise<V6TurnResult> {
  return runTurn(baseReq(content, threadId), {
    useHeuristicOnly: true,
    ...opts,
    executeDeps: { allowWebStub: true, ...(opts?.executeDeps || {}) },
  });
}

function requireTrace(r: V6TurnResult): TurnTrace {
  assert.ok(r.v6Trace, "expected v6Trace on result");
  return r.v6Trace!;
}

function strategies(trace: TurnTrace): string[] {
  return trace.sourcePlans.map((p) => p.strategy);
}

function statuses(trace: TurnTrace): string[] {
  return trace.requestResults.map((r) => r.status);
}

function keys(trace: TurnTrace): (string | undefined)[] {
  return trace.normalization.map((n) => n.canonicalKey);
}

beforeEach(() => {
  clearMemoryStore();
});

// ——— 1. Multi-question mixed routing ———
describe("1. Multi-question mixed routing", () => {
  it("stable model + web-required CEO", async () => {
    const r = await turn(
      "Explain photosynthesis, and who is Apple's CEO now?",
      "t-mixed-1",
    );
    const t = requireTrace(r);
    assert.ok(t.surfaceExpectation.signals.probableRequestCount >= 2);
    assert.equal(t.parseCoverage?.status, "complete");
    assert.ok(keys(t).includes("concept.photosynthesis"));
    assert.ok(keys(t).includes("company.current_ceo"));
    assert.ok(strategies(t).includes("model"));
    assert.ok(strategies(t).includes("web"));
    assert.ok(statuses(t).includes("policy_trusted"));
    assert.ok(statuses(t).includes("verified"));
    assert.equal(t.userCoverage.complete, true);
  });

  it("KB PTO + web Amazon CEO", async () => {
    const r = await turn(
      "What does our handbook say about PTO, and who is Amazon's CEO now?",
      "t-mixed-2",
    );
    const t = requireTrace(r);
    assert.ok(t.contextGate.inspectKnowledgeBaseMetadata);
    assert.ok(strategies(t).includes("knowledge_base"));
    assert.ok(strategies(t).includes("web"));
    assert.ok(t.webExecutedCount >= 1);
  });

  it("three unrelated sources: model + web + KB", async () => {
    const r = await turn(
      "Explain photosynthesis, who is Apple's CEO now, and what does our handbook say about PTO?",
      "t-mixed-3",
    );
    const t = requireTrace(r);
    assert.ok(
      t.surfaceExpectation.spans.filter((s) => s.type === "probable_request")
        .length >= 3,
      `spans=${t.surfaceExpectation.spans.length}`,
    );
    assert.equal(t.parseCoverage?.status, "complete");
    const strat = new Set(strategies(t));
    assert.ok(strat.has("model"));
    assert.ok(strat.has("web"));
    assert.ok(strat.has("knowledge_base"));
    assert.equal(t.userCoverage.complete, true);
    assert.match(r.content, /photosynthesis/i);
    assert.match(r.content, /cook|ceo/i);
    assert.match(r.content, /pto|handbook|20 days/i);
  });
});

// ——— 2. Dependent requests ———
describe("2. Dependent requests", () => {
  it("Apple CEO then how old is he", async () => {
    const r = await turn(
      "Who is Apple's CEO and how old is he?",
      "t-dep-ceo",
    );
    const t = requireTrace(r);
    assert.equal(t.parseOutcome.type, "ready");
    if (t.parseOutcome.type !== "ready") return;
    const age = t.parseOutcome.spec.requests.find((x) =>
      /age/i.test(x.property || ""),
    );
    assert.ok(age?.dependencies?.some((d) => d.type === "scalar"));
    assert.ok(t.executionWaves.length >= 2);
    assert.ok(statuses(t).every((s) => s === "verified"));
    assert.equal(t.userCoverage.complete, true);
  });

  it("Tesla price × 20 shares", async () => {
    const r = await turn(
      "What is Tesla's current share price and what would 20 shares cost?",
      "t-dep-price",
    );
    const t = requireTrace(r);
    assert.ok(keys(t).includes("company.current_share_price"));
    assert.ok(strategies(t).includes("web"));
    assert.ok(strategies(t).includes("deterministic"));
    assert.ok(t.executionWaves.length >= 2);
    assert.ok(statuses(t).includes("verified"));
    assert.match(r.content, /248|4970|share/i);
  });
});

// ——— 3. Collection dependencies ———
describe("3. Collection dependencies", () => {
  it("board members map → ages", async () => {
    const r = await turn(
      "Who is on Apple's board and how old is each member?",
      "t-map-board",
    );
    const t = requireTrace(r);
    if (t.parseOutcome.type !== "ready") assert.fail("expected ready");
    assert.ok(
      t.parseOutcome.spec.requests.some((x) =>
        x.dependencies?.some((d) => d.type === "map"),
      ),
    );
    assert.ok(t.requestResults.length >= 4); // r1 + 3 ages
    assert.ok(t.executionWaves.length >= 2);
    assert.equal(t.userCoverage.complete, true);
  });
});

// ——— 4. Current-thread follow-ups ———
describe("4. Current-thread follow-ups", () => {
  it("pronoun follow-up uses active entity", async () => {
    const t1 = await turn("Who is Apple's CEO now?", "t-follow-pronoun");
    requireTrace(t1);
    const t2 = await turn("How old is he?", "t-follow-pronoun", {
      activeEntities: [{ id: "tim", name: "Tim Cook", kind: "person" }],
      executeDeps: {
        allowWebStub: true,
        packet: {
          now: new Date().toISOString(),
          recentTurns: [],
          activeEntities: [{ id: "tim", name: "Tim Cook", kind: "person" }],
          relevantMemories: [],
          priorChatMatches: [],
          knowledgeBaseHints: [],
          resolvedReferences: [],
        },
      },
    });
    const tr = requireTrace(t2);
    assert.ok(
      tr.normalization.some(
        (n) => n.canonicalKey === "person.age",
      ),
    );
    assert.match(t2.content, /55|age|old/i);
  });

  it("calorie quantity follow-up recalculates without new web when cached", async () => {
    const t1 = await turn(
      "How many calories are in 3 Taco Bell tacos?",
      "t-follow-cal",
    );
    const tr1 = requireTrace(t1);
    assert.ok(tr1.webExecutedCount >= 1 || strategies(tr1).includes("web"));
    const t2 = await turn("What about 5?", "t-follow-cal");
    const tr2 = requireTrace(t2);
    assert.ok(
      strategies(tr2).includes("deterministic") ||
        tr2.parseOutcome.type === "ready",
    );
    // Follow-up should not need a fresh web plan when calculation is cached
    assert.ok(
      tr2.webPlannedCount === 0 || strategies(tr2).includes("deterministic"),
      `webPlanned=${tr2.webPlannedCount} strategies=${strategies(tr2)}`,
    );
    assert.match(t2.content, /\d+/);
  });
});

// ——— 5. Cross-chat context ———
describe("5. Cross-chat context", () => {
  it("prior-chat gate only when signaled", async () => {
    const cold = await turn("What is photosynthesis?", "t-cross-cold");
    assert.equal(requireTrace(cold).contextGate.searchPriorChats, false);

    const warm = await turn(
      "What was that company we talked about yesterday?",
      "t-cross-warm",
      {
        activeEntities: [],
        executeDeps: {
          allowWebStub: true,
          packet: {
            now: new Date().toISOString(),
            recentTurns: [],
            activeEntities: [],
            relevantMemories: [],
            priorChatMatches: [
              {
                id: "chat1",
                text: "We discussed Polar billing company yesterday",
                score: 0.9,
              },
            ],
            knowledgeBaseHints: [],
            resolvedReferences: [],
          },
        },
      },
    );
    const tw = requireTrace(warm);
    assert.equal(tw.contextGate.searchPriorChats, true);
    assert.ok(tw.contextResolution.priorChatHits >= 0);
  });

  it("resolved prior company then CEO uses web", async () => {
    const r = await turn(
      "That company we discussed yesterday — who is the CEO now?",
      "t-cross-ceo",
      {
        activeEntities: [{ id: "polar", name: "Polar", kind: "company" }],
      },
    );
    const t = requireTrace(r);
    assert.equal(t.contextGate.searchPriorChats, true);
    assert.ok(keys(t).includes("company.current_ceo"));
    assert.ok(strategies(t).includes("web"));
    assert.ok(!statuses(t).includes("policy_trusted"));
  });
});

// ——— 6. KB + web composition ———
describe("6. KB + web composition", () => {
  it("compare refund policies", async () => {
    const r = await turn(
      "Compare our refund policy with Amazon's current refund policy.",
      "t-kb-web",
    );
    const t = requireTrace(r);
    assert.ok(strategies(t).includes("knowledge_base"));
    assert.ok(strategies(t).includes("web"));
    assert.ok(
      t.parseOutcome.type === "ready" &&
        t.parseOutcome.spec.requests.some((x) => x.kind === "compare"),
    );
    assert.match(r.content, /refund|30 days|amazon|comparison/i);
  });
});

// ——— 7. Coverage failures ———
describe("7. Coverage failures", () => {
  it("parser omission caught by surface reconciliation + repair", async () => {
    let calls = 0;
    const r = await turn(
      "How many calories are in 3 Taco Bell tacos and a medium McDonald's Sprite?",
      "t-cov-omit",
      {
        useHeuristicOnly: false,
        generate: async () => {
          calls += 1;
          if (calls === 1) {
            return JSON.stringify({
              requests: [
                {
                  id: "r1",
                  kind: "fact",
                  subject: { type: "named", value: "Taco Bell" },
                  property: "calories",
                  surfaceSpanIds: ["span_1"],
                },
              ],
              response: { ordering: "request_order", detail: "normal" },
            });
          }
          return JSON.stringify({
            requests: [
              {
                id: "r1",
                kind: "fact",
                subject: { type: "named", value: "Taco Bell" },
                property: "calories",
                surfaceSpanIds: ["span_1"],
              },
              {
                id: "r2",
                kind: "fact",
                subject: { type: "named", value: "McDonald's Sprite" },
                property: "calories",
                surfaceSpanIds: ["span_2"],
              },
            ],
            response: { ordering: "request_order", detail: "normal" },
          });
        },
      },
    );
    const t = requireTrace(r);
    assert.ok(calls >= 2);
    assert.equal(t.parseCoverage?.status, "complete");
    assert.ok(
      t.surfaceExpectation.spans.filter((s) => s.type === "probable_request")
        .length >= 2,
    );
    assert.ok(t.requestResults.length >= 2);
  });

  it("unit: incomplete coverage detected before repair", () => {
    const surface = surfacePrepass(
      "Ask A, ask B, and ask C about three different things?",
    );
    // Force 3 probable spans if splitter gave fewer
    const spans =
      surface.spans.length >= 3
        ? surface.spans
        : [
            { id: "span_1", text: "Ask A", type: "probable_request" as const },
            { id: "span_2", text: "ask B", type: "probable_request" as const },
            {
              id: "span_3",
              text: "ask C about three different things",
              type: "probable_request" as const,
            },
          ];
    const cov = computeParseCoverage(
      { ...surface, spans },
      {
        type: "ready",
        spec: {
          requests: [
            {
              id: "r1",
              kind: "fact",
              surfaceSpanIds: ["span_1"],
            },
          ],
          response: { ordering: "request_order", detail: "normal" },
        },
      },
    );
    assert.equal(cov.status, "incomplete");
    assert.ok(cov.uncoveredSpanIds.includes("span_2"));
    assert.ok(cov.uncoveredSpanIds.includes("span_3"));
  });
});

// ——— 8. Partial failures ———
describe("8. Partial failures", () => {
  it("two resolve, one unresolved — answer accounts for all", async () => {
    const r = await turn(
      "Explain photosynthesis, who is Apple's CEO now, and what does our handbook say about PTO?",
      "t-partial",
      {
        executeDeps: {
          allowWebStub: true,
          forceUnresolvedIds: ["r2"],
        },
      },
    );
    const t = requireTrace(r);
    assert.equal(t.userCoverage.complete, false);
    const spanStatuses = t.userCoverage.surfaceSpans
      .filter((s) => s.status !== "non_request")
      .map((s) => s.status);
    assert.ok(spanStatuses.includes("answered"));
    assert.ok(spanStatuses.includes("unresolved") || spanStatuses.includes("blocked"));
    assert.match(r.content, /couldn.?t verify|unresolved|unable/i);
    assert.match(r.content, /photosynthesis|pto|handbook/i);
  });

  it("blocked_upstream on share calc when price fails", async () => {
    const r = await turn(
      "What is Tesla's current share price and what would 20 shares cost?",
      "t-blocked",
      {
        executeDeps: {
          allowWebStub: true,
          forceUnresolvedIds: ["r1"],
        },
      },
    );
    const t = requireTrace(r);
    assert.ok(statuses(t).includes("blocked_upstream"));
    assert.ok(statuses(t).includes("unresolved"));
    assert.equal(t.userCoverage.complete, false);
    assert.match(r.content, /couldn.?t|blocked|verify|upstream|fail/i);
  });
});

// ——— 9. Ambiguity ———
describe("9. Ambiguity", () => {
  it("clarification_required for multiple companies", async () => {
    const r = await turn("What did that company charge?", "t-amb", {
      activeEntities: [
        { id: "1", name: "Acme", kind: "company" },
        { id: "2", name: "Polar", kind: "company" },
      ],
    });
    const t = requireTrace(r);
    assert.equal(t.parseOutcome.type, "clarification_required");
    assert.equal(r.pausedForUser, true);
    assert.ok(t.webExecutedCount === 0);
    assert.match(r.content, /which|mean|acme|polar/i);
  });
});

// ——— 10. Conflict resolution ———
describe("10. Conflict resolution", () => {
  it("prefers high-authority official source", () => {
    const evidence: Evidence[] = [
      {
        id: "weak",
        sourceType: "web",
        value: "John Doe",
        excerpt: "John Doe",
        source: { url: "https://random-blog.example/ceo" },
        scores: {
          r1: {
            subjectMatch: 0.5,
            propertyMatch: 0.5,
            relevance: 0.5,
            authority: 30,
            freshnessValid: true,
          },
        },
      },
      {
        id: "official",
        sourceType: "web",
        value: "Tim Cook",
        excerpt: "Tim Cook",
        source: { url: "https://www.apple.com/leadership/" },
        observedAt: new Date().toISOString(),
        scores: {
          r1: {
            subjectMatch: 1,
            propertyMatch: 1,
            relevance: 1,
            authority: 100,
            freshnessValid: true,
          },
        },
      },
    ];
    const res = resolveEvidenceConflict(evidence, "r1");
    assert.equal(res.type, "resolved");
    if (res.type === "resolved") {
      assert.equal(res.value, "Tim Cook");
    }
  });

  it("surfaces disagreement when authorities are close", () => {
    const evidence: Evidence[] = [
      {
        id: "a",
        sourceType: "web",
        value: "Alice",
        scores: {
          r1: {
            subjectMatch: 1,
            propertyMatch: 1,
            relevance: 1,
            authority: 70,
            freshnessValid: true,
          },
        },
      },
      {
        id: "b",
        sourceType: "web",
        value: "Bob",
        scores: {
          r1: {
            subjectMatch: 1,
            propertyMatch: 1,
            relevance: 1,
            authority: 70,
            freshnessValid: true,
          },
        },
      },
    ];
    const res = resolveEvidenceConflict(evidence, "r1");
    assert.equal(res.type, "conflicting");
  });
});

// ——— 11. Routing correctness ———
describe("11. Routing correctness", () => {
  it("Everest height → model, no web", async () => {
    const r = await turn("How tall is Mount Everest?", "t-route-everest");
    const t = requireTrace(r);
    assert.ok(keys(t).includes("geography.elevation"));
    assert.deepEqual(strategies(t), ["model"]);
    assert.equal(t.webPlannedCount, 0);
    assert.equal(t.webExecutedCount, 0);
    assert.ok(statuses(t).includes("policy_trusted"));
    assert.ok(!statuses(t).includes("verified"));
  });

  it("photosynthesis → model-only", async () => {
    const r = await turn("Explain photosynthesis", "t-route-photo");
    const t = requireTrace(r);
    assert.deepEqual(strategies(t), ["model"]);
    assert.equal(t.webExecutedCount, 0);
    assert.ok(statuses(t).includes("policy_trusted"));
  });

  it("current CEO / weather / sports / price → web", async () => {
    for (const [prompt, key] of [
      ["Who is Apple's current CEO?", "company.current_ceo"],
      ["What is the weather in Austin today?", "weather.current"],
      ["When do BYU and Utah play?", "event.date"],
      ["What is Tesla's current share price?", "company.current_share_price"],
    ] as const) {
      const r = await turn(prompt, `t-route-web-${key}`);
      const t = requireTrace(r);
      assert.ok(keys(t).includes(key), `${prompt} → ${keys(t)}`);
      assert.ok(strategies(t).includes("web"), prompt);
      assert.ok(getPolicy(key)?.modelAllowed === false, key);
    }
  });

  it("arithmetic → deterministic fast path", async () => {
    const r = await turn("What is 17*3?", "t-route-math");
    const t = requireTrace(r);
    assert.equal(t.fastPath, "arithmetic");
    assert.equal(t.webExecutedCount, 0);
    assert.equal(r.content.trim(), "51");
  });

  it("explicit URL fast path", async () => {
    const r = await turn("https://example.com/page", "t-route-url", {
      executeDeps: {
        allowWebStub: true,
        readUrl: async (url) => ({
          text: `Fetched ${url}`,
          title: "Example",
          url,
        }),
      },
    });
    const t = requireTrace(r);
    assert.equal(t.fastPath, "url");
    assert.match(r.content, /example\.com|Fetched/i);
  });

  it("explicit file/handbook → KB metadata gate", async () => {
    const r = await turn(
      "Summarize the uploaded handbook file section on PTO",
      "t-route-file",
    );
    const t = requireTrace(r);
    assert.equal(t.contextGate.inspectKnowledgeBaseMetadata, true);
    assert.ok(
      strategies(t).includes("knowledge_base") ||
        t.surfaceExpectation.signals.hasFileReference,
    );
  });
});

// ——— 12. Policy normalization ———
describe("12. Policy normalization", () => {
  it("CEO variants map to company.current_ceo", () => {
    const variants = [
      "CEO",
      "current CEO",
      "who runs Apple",
      "chief executive",
      "who runs the company",
      "head of company",
    ];
    for (const v of variants) {
      const c = canonicalizeProperty(v);
      assert.equal(c.canonicalKey, "company.current_ceo", v);
    }
  });

  it("normalized requests share the same web policy", () => {
    for (const raw of ["CEO", "current CEO", "chief executive"]) {
      const n = normalizeRequests([
        {
          id: "r1",
          kind: "fact",
          subject: { type: "named", value: "Apple" },
          property: raw,
        },
      ])[0]!;
      const plan = planSource(n);
      assert.equal(plan.policyKey, "company.current_ceo");
      assert.equal(plan.strategy, "web");
      assert.equal(plan.matchedPolicy, true);
    }
  });
});

// ——— Trace completeness ———
describe("Trace completeness", () => {
  it("full turn populates required trace fields", async () => {
    const r = await turn(
      "Explain photosynthesis and who is Apple's CEO now?",
      "t-trace-full",
    );
    const t = requireTrace(r);
    assert.ok(t.input);
    assert.ok(t.surfaceExpectation.spans.length >= 1);
    assert.ok(t.contextGate);
    assert.ok(t.contextResolution);
    assert.ok(t.parseOutcome);
    assert.ok(t.parseCoverage);
    assert.ok(t.normalization.length >= 1);
    assert.ok(t.sourcePlans.length >= 1);
    assert.ok(Array.isArray(t.executionWaves));
    assert.ok(t.requestResults.length >= 1);
    assert.ok(t.userCoverage);
    assert.ok(["deterministic", "apple", "cloud"].includes(t.renderer));
    assert.equal(typeof t.webPlannedCount, "number");
    assert.equal(typeof t.webExecutedCount, "number");
  });
});
