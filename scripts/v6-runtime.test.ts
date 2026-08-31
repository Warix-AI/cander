/**
 * V6 runtime regression suite — surface coverage, policy, dependencies, flags.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { isV6RuntimeEnabled } from "../lib/ai/orchestrator/flags.ts";
import {
  canonicalizeProperty,
  normalizeRequests,
} from "../lib/ai/v6/normalize/canonicalize.ts";
import {
  getPolicy,
  planSource,
} from "../lib/ai/v6/normalize/policies.ts";
import {
  heuristicParse,
} from "../lib/ai/v6/parse/apple-parse.ts";
import {
  computeParseCoverage,
} from "../lib/ai/v6/parse/reconcile.ts";
import { surfacePrepass } from "../lib/ai/v6/surface/prepass.ts";
import { contextGate } from "../lib/ai/v6/context/gate.ts";
import { resolveReferences } from "../lib/ai/v6/context/references.ts";
import { buildRequestGraph } from "../lib/ai/v6/graph/build.ts";
import { expandMapDependencies } from "../lib/ai/v6/graph/expand-map.ts";
import { evaluateExpression } from "../lib/ai/v6/derive/expressions.ts";
import { computeUserCoverage } from "../lib/ai/v6/coverage/user-coverage.ts";
import { runTurn } from "../lib/ai/v6/run-turn.ts";
import { renderDeterministic } from "../lib/ai/v6/render/deterministic.ts";
import { citationsFromEvidence } from "../lib/ai/v6/render/citations.ts";
import { needsCloudSynthesis } from "../lib/ai/v6/execute/providers/cloud-synthesis.ts";
import { MAX_MAP_EXPANSION } from "../lib/ai/v6/types.ts";
import type {
  AnswerBundle,
  ContextPacket,
  RequestResult,
  TurnSpec,
} from "../lib/ai/v6/types.ts";

function emptyPacket(over?: Partial<ContextPacket>): ContextPacket {
  return {
    now: new Date().toISOString(),
    recentTurns: [],
    activeEntities: [],
    relevantMemories: [],
    priorChatMatches: [],
    knowledgeBaseHints: [],
    resolvedReferences: [],
    ...over,
  };
}

describe("V6 flag", () => {
  it("defaults off when env unset", () => {
    const prev = process.env.NEXT_PUBLIC_AI_V6_RUNTIME;
    delete process.env.NEXT_PUBLIC_AI_V6_RUNTIME;
    assert.equal(isV6RuntimeEnabled(), false);
    if (prev !== undefined) process.env.NEXT_PUBLIC_AI_V6_RUNTIME = prev;
  });

  it("enables via env", () => {
    const prev = process.env.NEXT_PUBLIC_AI_V6_RUNTIME;
    process.env.NEXT_PUBLIC_AI_V6_RUNTIME = "1";
    assert.equal(isV6RuntimeEnabled(), true);
    process.env.NEXT_PUBLIC_AI_V6_RUNTIME = "0";
    assert.equal(isV6RuntimeEnabled(), false);
    if (prev === undefined) delete process.env.NEXT_PUBLIC_AI_V6_RUNTIME;
    else process.env.NEXT_PUBLIC_AI_V6_RUNTIME = prev;
  });
});

describe("V6 surface prepass", () => {
  it("splits calorie multi-item ask into spans", () => {
    const s = surfacePrepass(
      "How many calories are in 3 Taco Bell tacos and a medium McDonald's Sprite?",
    );
    assert.ok(s.signals.probableRequestCount >= 2);
    assert.ok(s.spans.length >= 2);
    assert.ok(s.signals.hasConjunctions || s.signals.hasMath);
  });

  it("detects prior-chat signals", () => {
    const s = surfacePrepass(
      "That billing company we talked about yesterday — who's the CEO now?",
    );
    assert.equal(s.signals.hasPriorChatReference, true);
    const gate = contextGate(
      "That billing company we talked about yesterday — who's the CEO now?",
      s,
    );
    assert.equal(gate.searchPriorChats, true);
  });
});

describe("V6 parse reconciliation — missing subquestion", () => {
  it("detects uncovered span when Apple emits only one request", () => {
    const text =
      "How many calories are in 3 Taco Bell tacos and a medium McDonald's Sprite?";
    const surface = surfacePrepass(text);
    assert.ok(surface.spans.filter((x) => x.type === "probable_request").length >= 2);

    const incomplete: TurnSpec = {
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
    };
    const cov = computeParseCoverage(surface, {
      type: "ready",
      spec: incomplete,
    });
    assert.equal(cov.status, "incomplete");
    assert.ok(cov.uncoveredSpanIds.includes("span_2"));
  });

  it("repair via heuristic covers uncovered calorie span", async () => {
    const text =
      "How many calories are in 3 Taco Bell tacos and a medium McDonald's Sprite?";
    let calls = 0;
    const result = await runTurn(
      {
        content: text,
        title: "t",
        workspaceId: "ws",
        threadId: "th-calories",
      },
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
                  subject: { type: "named", value: "Taco Bell tacos" },
                  property: "calories",
                  surfaceSpanIds: ["span_1"],
                },
              ],
              response: { ordering: "request_order", detail: "normal" },
            });
          }
          // Repair pass — cover both spans
          return JSON.stringify({
            requests: [
              {
                id: "r1",
                kind: "fact",
                subject: { type: "named", value: "Taco Bell tacos" },
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
    assert.ok(calls >= 2, `expected repair generate call, got ${calls}`);
    assert.ok(
      /sprite|mcdonald|taco|calor/i.test(result.content),
      result.content,
    );
  });
});

describe("V6 clarification", () => {
  it("does not guess ambiguous company", () => {
    const refs = resolveReferences("What did that company charge?", [
      { id: "1", name: "Acme", kind: "company" },
      { id: "2", name: "Polar", kind: "company" },
    ]);
    assert.equal(refs[0]?.status, "ambiguous");
  });

  it("runTurn pauses for clarification", async () => {
    const result = await runTurn(
      {
        content: "What did that company charge?",
        title: "t",
        workspaceId: "ws",
        threadId: "th-amb",
      },
      {
        useHeuristicOnly: true,
        activeEntities: [
          { id: "1", name: "Acme", kind: "company" },
          { id: "2", name: "Polar", kind: "company" },
        ],
      },
    );
    assert.equal(result.pausedForUser, true);
    assert.match(result.content, /which|mean|acme|polar/i);
  });
});

describe("V6 canonicalization + policy", () => {
  it("maps CEO aliases to company.current_ceo", () => {
    for (const raw of [
      "CEO",
      "current CEO",
      "chief executive",
      "who runs the company",
      "head of company",
    ]) {
      const c = canonicalizeProperty(raw);
      assert.equal(c.canonicalKey, "company.current_ceo", raw);
      assert.ok(c.status === "mapped" || c.status === "exact");
    }
  });

  it("current CEO requires web and forbids model verified", () => {
    const policy = getPolicy("company.current_ceo");
    assert.ok(policy);
    assert.equal(policy!.modelAllowed, false);
    assert.equal(policy!.requiresExternalEvidence, true);

    const n = normalizeRequests([
      {
        id: "r1",
        kind: "fact",
        subject: { type: "named", value: "Apple" },
        property: "CEO",
      },
    ])[0]!;
    const plan = planSource(n);
    assert.equal(plan.strategy, "web");
    assert.equal(plan.matchedPolicy, true);
  });

  it("photosynthesis is modelAllowed → policy_trusted not verified path", async () => {
    const result = await runTurn(
      {
        content: "Explain photosynthesis",
        title: "t",
        workspaceId: "ws",
        threadId: "th-photo",
      },
      { useHeuristicOnly: true },
    );
    assert.match(result.content, /photosynthesis/i);
    assert.ok(!result.citations?.length);
  });
});

describe("V6 map dependency", () => {
  it("expands board member ages with bound", () => {
    const normalized = normalizeRequests([
      {
        id: "r1",
        kind: "fact",
        subject: { type: "named", value: "Apple" },
        property: "board_members",
        surfaceSpanIds: ["span_1"],
      },
      {
        id: "r2",
        kind: "fact",
        property: "age",
        dependencies: [{ type: "map", requestId: "r1", as: "member" }],
        surfaceSpanIds: ["span_2"],
      },
    ]);
    const results = new Map<string, RequestResult>([
      [
        "r1",
        {
          requestId: "r1",
          status: "verified",
          value: Array.from({ length: 30 }, (_, i) => `Member${i}`),
          evidenceIds: [],
        },
      ],
    ]);
    const expanded = expandMapDependencies({ normalized, results });
    const children = expanded.filter((n) =>
      String(n.request.qualifiers?.mapParent) === "r2",
    );
    assert.equal(children.length, MAX_MAP_EXPANSION);
  });

  it("runTurn board + ages executes map children", async () => {
    const result = await runTurn(
      {
        content: "Who is on Apple's board and how old is each member?",
        title: "t",
        workspaceId: "ws",
        threadId: "th-board",
      },
      { useHeuristicOnly: true },
    );
    assert.ok(/alice|bob|carol|board|age|55/i.test(result.content), result.content);
  });
});

describe("V6 blocked upstream", () => {
  it("blocks share-cost calc when price unresolved", async () => {
    const result = await runTurn(
      {
        content:
          "What is Tesla's current share price and what would 20 shares cost?",
        title: "t",
        workspaceId: "ws",
        threadId: "th-tesla",
      },
      {
        useHeuristicOnly: true,
        executeDeps: { forceUnresolvedIds: ["r1"] },
      },
    );
    assert.match(result.content, /couldn.?t|unable|verify|blocked|fail/i);
    assert.ok(
      /share|cost|total|calculate|20/i.test(result.content),
      result.content,
    );
  });
});

describe("V6 user coverage partial failure", () => {
  it("renderer accounts for all three spans", () => {
    const surface = surfacePrepass(
      "Explain photosynthesis, who is Apple's CEO now, and what does our handbook say about PTO?",
    );
    const spec: TurnSpec = {
      requests: [
        {
          id: "r1",
          kind: "explain",
          property: "photosynthesis",
          surfaceSpanIds: ["span_1"],
        },
        {
          id: "r2",
          kind: "fact",
          property: "current_ceo",
          surfaceSpanIds: ["span_2"],
        },
        {
          id: "r3",
          kind: "fact",
          property: "pto",
          surfaceSpanIds: ["span_3"],
        },
      ],
      response: { ordering: "request_order", detail: "normal" },
    };
    const results: RequestResult[] = [
      {
        requestId: "r1",
        status: "policy_trusted",
        value: "Plants make sugar.",
        evidenceIds: [],
      },
      {
        requestId: "r2",
        status: "unresolved",
        evidenceIds: [],
        reason: "web_miss",
      },
      {
        requestId: "r3",
        status: "verified",
        value: "20 days PTO",
        evidenceIds: ["ev1"],
      },
    ];
    const coverage = computeUserCoverage({
      surface,
      spec,
      results,
      parseOutcome: { type: "ready", spec },
    });
    assert.equal(coverage.complete, false);
    const mid = coverage.surfaceSpans.find((s) => s.spanId === "span_2");
    assert.equal(mid?.status, "unresolved");

    const bundle: AnswerBundle = {
      spec,
      surfaceExpectation: surface,
      results,
      evidence: [],
      coverage,
    };
    const text = renderDeterministic(bundle);
    assert.match(text, /couldn.?t verify|unresolved/i);
    assert.match(text, /PTO|20 days|plants|sugar|photosynthesis/i);
  });
});

describe("V6 mixed sources", () => {
  it("model + web + KB in one turn", async () => {
    const result = await runTurn(
      {
        content:
          "Explain photosynthesis, who is Apple's CEO now, and what does our handbook say about PTO?",
        title: "t",
        workspaceId: "ws",
        threadId: "th-mixed",
      },
      { useHeuristicOnly: true },
    );
    assert.match(result.content, /photosynthesis/i);
    assert.match(result.content, /tim cook|ceo/i);
    assert.match(result.content, /pto|handbook|20 days/i);
  });
});

describe("V6 fast paths", () => {
  it("pure arithmetic", async () => {
    const result = await runTurn(
      { content: "What is 17*3?", title: "t", workspaceId: "ws" },
      { useHeuristicOnly: true },
    );
    assert.equal(result.content.trim(), "51");
  });

  it("simple conversational", async () => {
    const result = await runTurn(
      { content: "Thanks!", title: "t", workspaceId: "ws" },
      { useHeuristicOnly: true },
    );
    assert.match(result.content, /welcome/i);
  });
});

describe("V6 derivation", () => {
  it("evaluates multiply expression in code", () => {
    const results = new Map<string, RequestResult>([
      [
        "r1",
        { requestId: "r1", status: "verified", value: 248.5, evidenceIds: [] },
      ],
    ]);
    const v = evaluateExpression(
      { op: "multiply", args: [{ requestId: "r1" }, { literal: 20 }] },
      results,
    );
    assert.equal(v, 4970);
  });
});

describe("V6 citations", () => {
  it("builds citations from evidence only", () => {
    const cites = citationsFromEvidence([
      {
        id: "ev1",
        sourceType: "web",
        excerpt: "Tim Cook",
        source: {
          title: "Leadership",
          url: "https://www.apple.com/leadership/",
        },
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
    ]);
    assert.equal(cites.length, 1);
    assert.equal(cites[0]!.url, "https://www.apple.com/leadership/");
  });
});

describe("V6 cloud provider gate", () => {
  it("needs cloud for images and deep research", () => {
    assert.equal(needsCloudSynthesis({ hasImages: true }), true);
    assert.equal(
      needsCloudSynthesis({ hasResearch: true, detailDeep: true }),
      true,
    );
    assert.equal(needsCloudSynthesis({}), false);
  });
});

describe("V6 end-to-end trace fields via runTurn", () => {
  it("completes Tesla price + cost when web stub works", async () => {
    const result = await runTurn(
      {
        content:
          "What is Tesla's current share price and what would 20 shares cost?",
        title: "t",
        workspaceId: "ws",
        threadId: "th-tesla-ok",
      },
      { useHeuristicOnly: true },
    );
    assert.ok(/248|4970|share/i.test(result.content), result.content);
  });

  it("heuristic parse produces ready TurnSpec for CEO", () => {
    const surface = surfacePrepass("Who is Apple's CEO now?");
    const outcome = heuristicParse(
      "Who is Apple's CEO now?",
      surface,
      emptyPacket(),
    );
    assert.equal(outcome.type, "ready");
    if (outcome.type === "ready") {
      const n = normalizeRequests(outcome.spec.requests);
      const { sourcePlans } = buildRequestGraph(n);
      assert.equal(sourcePlans[0]?.strategy, "web");
    }
  });
});

describe("V6 compare refund policies", () => {
  it("KB + web compare path", async () => {
    const result = await runTurn(
      {
        content:
          "Compare our refund policy with Amazon's current refund policy.",
        title: "t",
        workspaceId: "ws",
        threadId: "th-refund",
      },
      { useHeuristicOnly: true },
    );
    assert.ok(/refund|30 days|amazon/i.test(result.content), result.content);
  });
});
