/**
 * Exa synthesized search retrieval — policy, normalization, FM handoff.
 * Run: node --experimental-strip-types --test scripts/exa-retrieval.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildExaOutputSchema,
  buildRetrievalQuery,
  evaluateExaSynthesisQuality,
  exaDirectAnswerText,
  exaGroundingConfidence,
  exaBundleQualityOk,
  nextEscalationMode,
  parseExaSynthesizedResponse,
  resolveExaRetrievalPolicy,
} from "../lib/ai/web-research/index.ts";
import { webSearchArguments } from "../lib/ai/turn-environment/retrieval-args.ts";
import { resolveTurnTask } from "../lib/ai/turn-environment/turn-task.ts";
import { normalizeWebSearchResult } from "../lib/ai/turn-environment/normalize.ts";
import {
  prepareSynthesisEvidence,
  type TurnEvidence,
} from "../lib/ai/orchestrator/evidence.ts";
import {
  hasUsableEvidenceSnippets,
  validateLocalGrounding,
} from "../lib/ai/orchestrator/grounding-validator.ts";
import { tryExaDirectAnswer } from "./exa-retrieval-helpers.ts";

describe("Exa retrieval policy", () => {
  it("deep_default routes simple factual questions to Exa deep", () => {
    const q = "What is BYU's first football game of the season this year?";
    const policy = resolveExaRetrievalPolicy(q, {
      webRetrievalMode: "deep_default",
    });
    assert.equal(policy.mode, "deep");
    assert.ok(policy.numResults >= 6);
  });

  it("fast mode keeps simple factual questions on fast + text outputSchema", () => {
    const q = "What is BYU's first football game of the season this year?";
    const policy = resolveExaRetrievalPolicy(q, { webRetrievalMode: "fast" });
    assert.equal(policy.mode, "fast");
    assert.equal(policy.outputSchema.type, "text");
    assert.ok(policy.numResults <= 5);
  });

  it("escalates list-all questions toward deep under deep_default", () => {
    const policy = resolveExaRetrievalPolicy(
      "List every BYU football game this season with times",
      { webRetrievalMode: "deep_default" },
    );
    assert.equal(policy.mode, "deep");
  });

  it("escalates list-all questions toward deep-lite under fast mode", () => {
    const policy = resolveExaRetrievalPolicy(
      "List every BYU football game this season with times",
      { webRetrievalMode: "fast" },
    );
    assert.equal(policy.mode, "deep-lite");
  });

  it("builds object schema when multiple schedule fields are requested", () => {
    const schema = buildExaOutputSchema(
      "When and where is BYU's first football game and who do they play?",
    );
    assert.equal(schema.type, "object");
  });
});

describe("Exa synthesized response parsing", () => {
  const byuDirect =
    "BYU opens against Utah Tech on September 5, 2026 at 6:00 PM MDT in Provo.";

  it("preserves direct answer and grounding citations", () => {
    const bundle = parseExaSynthesizedResponse({
      query: "BYU first football game",
      retrievalMode: "fast",
      outputSchemaType: "text",
      output: {
        content: byuDirect,
        grounding: [
          {
            field: "answer",
            confidence: "high",
            citations: [
              {
                url: "https://byucougars.com/schedule",
                title: "BYU Schedule",
              },
            ],
          },
        ],
      },
      results: [
        {
          title: "Old wrong snippet",
          url: "https://example.com/wrong",
          highlights: ["Colorado State September 4"],
        },
        {
          title: "BYU Schedule",
          url: "https://byucougars.com/schedule",
          highlights: ["Utah Tech September 5"],
        },
      ],
      retrievedAt: new Date().toISOString(),
    });
    assert.equal(bundle.directAnswer, byuDirect);
    assert.equal(bundle.groundingConfidence, "high");
    assert.ok(exaBundleQualityOk(bundle));
    assert.ok(
      bundle.supportingResults.some((s) =>
        s.url.includes("byucougars.com"),
      ),
    );
  });

  it("normalizes synthesized output as primary evidence, not raw snippets", () => {
    const normalized = normalizeWebSearchResult({
      toolName: "web.search",
      ok: true,
      directAnswer: byuDirect,
      groundingConfidence: "high",
      grounding: [
        {
          citations: [
            {
              url: "https://byucougars.com/schedule",
              title: "BYU Schedule",
            },
          ],
        },
      ],
      results: [
        {
          title: "Wrong",
          url: "https://example.com/wrong",
          description: "Colorado State Sept 4",
        },
        {
          title: "BYU",
          url: "https://byucougars.com/schedule",
          description: "Utah Tech Sept 5",
        },
      ],
    });
    assert.equal(normalized.evidence[0]?.kind, "exa_synthesis");
    assert.equal(normalized.evidence[0]?.content, byuDirect);
    assert.equal(normalized.evidence.filter((e) => e.kind === "search_result").length, 0);
    assert.equal(normalized.sufficient, true);
  });

  it("prepareSynthesisEvidence prioritizes grounded answer over snippets", () => {
    const evidence: TurnEvidence[] = [
      {
        id: "exa_direct",
        kind: "exa_synthesis",
        title: "Grounded retrieval answer",
        content: byuDirect,
        retrievedAt: new Date().toISOString(),
        sourceTool: "web.search",
        ok: true,
        groundingConfidence: "high",
      },
    ];
    const prep = prepareSynthesisEvidence(
      "What is BYU's first football game?",
      evidence,
    );
    assert.match(prep.instruction, /GROUNDED RETRIEVAL ANSWER/);
    assert.match(prep.instruction, /Utah Tech/);
    assert.doesNotMatch(prep.instruction, /Colorado State/);
  });

  it("rejects FM answers that contradict the grounded direct answer", () => {
    const evidence: TurnEvidence[] = [
      {
        id: "exa_direct",
        kind: "exa_synthesis",
        title: "Grounded retrieval answer",
        content: byuDirect,
        retrievedAt: new Date().toISOString(),
        sourceTool: "web.search",
        ok: true,
        groundingConfidence: "high",
      },
    ];
    assert.ok(hasUsableEvidenceSnippets(evidence));
    const bad = validateLocalGrounding({
      answer:
        "BYU opens against Colorado State on September 4 at 7 PM in Fort Collins.",
      userRequest: "What is BYU's first football game?",
      evidence,
      retrievalAttempted: true,
    });
    assert.equal(bad.valid, false);
    assert.ok(bad.issues.includes("ALTERED_DIRECT_ANSWER"));
    assert.equal(bad.recommendedAction, "use_evidence_fallback");
  });
});

describe("exaDirectAnswerText", () => {
  it("reads string and object content", () => {
    assert.equal(exaDirectAnswerText("Hello"), "Hello");
    assert.equal(
      exaDirectAnswerText({ answer: "Utah Tech on Sept 5" }),
      "Utah Tech on Sept 5",
    );
  });

  it("exaGroundingConfidence picks highest rank", () => {
    assert.equal(
      exaGroundingConfidence([
        { confidence: "medium" },
        { confidence: "high" },
      ]),
      "high",
    );
  });
});

describe("tryExaDirectAnswer bypass", () => {
  it("returns direct answer for simple factual questions", () => {
    const answer = tryExaDirectAnswer(
      "What is BYU's first football game this season?",
      [
        {
          id: "exa_direct",
          kind: "exa_synthesis",
          title: "Grounded retrieval answer",
          content:
            "BYU opens against Utah Tech on September 5, 2026 at 6:00 PM MDT in Provo.",
          retrievedAt: new Date().toISOString(),
          sourceTool: "web.search",
          ok: true,
          groundingConfidence: "high",
        },
      ],
    );
    assert.ok(answer?.includes("Utah Tech"));
  });

  it("does not bypass for list-all operations", () => {
    const answer = tryExaDirectAnswer("List the first five BYU games", [
      {
        id: "exa_direct",
        kind: "exa_synthesis",
        title: "Grounded retrieval answer",
        content: "Game 1: Utah Tech …",
        retrievedAt: new Date().toISOString(),
        sourceTool: "web.search",
        ok: true,
        groundingConfidence: "high",
      },
    ]);
    assert.equal(answer, null);
  });
});

describe("Exa retrieval policy — P1", () => {
  it("buildRetrievalQuery carries subject for follow-ups", () => {
    const q = buildRetrievalQuery({
      content: "What time?",
      subject: "BYU first football game",
      requestedFields: ["time"],
      operation: "add_fields",
    });
    assert.match(q, /BYU/);
    assert.match(q, /What time/);
    assert.match(q, /time/);
  });

  it("nextEscalationMode walks fast → auto → deep-lite", () => {
    assert.equal(nextEscalationMode("fast"), "auto");
    assert.equal(nextEscalationMode("auto"), "deep-lite");
    assert.equal(nextEscalationMode("deep-reasoning"), null);
  });

  it("evaluateExaSynthesisQuality escalates weak synthesis", () => {
    const quality = evaluateExaSynthesisQuality({
      bundle: {
        provider: "exa",
        retrievalMode: "fast",
        query: "BYU schedule",
        directAnswer: "Unknown",
        grounding: [],
        groundingConfidence: "none",
        supportingResults: [],
        outputSchemaType: "text",
      },
      question: "What time is BYU's first game?",
      hints: { requestedFields: ["time"], operation: "add_fields" },
    });
    assert.equal(quality.sufficient, false);
    assert.equal(quality.escalateTo, "auto");
    assert.ok(quality.issues.includes("missing_direct_output"));
  });

  it("list operation selects deep-lite mode and object schema", () => {
    const policy = resolveExaRetrievalPolicy("List every BYU game", {
      hints: { operation: "list", subject: "BYU football" },
    });
    assert.equal(policy.mode, "deep-lite");
    assert.equal(policy.outputSchema.type, "object");
  });

  it("webSearchArguments embeds TurnTask retrieval hints", () => {
    const turnTask = resolveTurnTask({
      content: "What time?",
      previous: {
        topics: [],
        entities: [
          {
            id: "e1",
            type: "topic",
            label: "BYU football",
            contextClass: "ACTIVE",
          },
        ],
        currentIntent: "lookup",
        desiredAnswerShape: "normal",
        constraints: {},
        freshnessRequirement: false,
        externalRetrievalRequired: false,
        dissatisfactionSignal: false,
        internalDataRequired: false,
      },
    });
    const args = webSearchArguments({
      content: "What time?",
      turnTask,
    });
    assert.match(String(args.query), /BYU|What time/);
    assert.equal(
      (args.retrievalHints as { operation?: string }).operation,
      "add_fields",
    );
  });
});

describe("Exa retrieval — P2", () => {
  it("wantsAutonomousResearch detects long-running investigation", async () => {
    const { wantsAutonomousResearch, wantsDeepReasoningSearch, resolveExaRetrievalPolicy } =
      await import("../lib/ai/web-research/index.ts");
    assert.equal(
      wantsAutonomousResearch(
        "Research this for me over the next few days and write a full report",
      ),
      true,
    );
    assert.equal(wantsAutonomousResearch("What is BYU's first game?"), false);
    const policy = resolveExaRetrievalPolicy(
      "Analyze the tradeoffs and recommend which approach",
      {
        hints: {
          operation: "compare",
          depth: "detailed",
          dissatisfaction: true,
        },
      },
    );
    assert.equal(policy.mode, "deep-reasoning");
    assert.equal(
      wantsDeepReasoningSearch("Why did revenue drop?", {
        depth: "detailed",
        operation: "detail",
      }),
      true,
    );
  });

  it("filterEvidenceForCurrentTurn drops expired-topic evidence", async () => {
    const { filterEvidenceForCurrentTurn, filterMemorySnippetsForTurn } =
      await import("../lib/ai/orchestrator/evidence-hygiene.ts");
    const { resolveTurnTask } = await import(
      "../lib/ai/turn-environment/turn-task.ts"
    );
    const conv = {
      topics: [],
      entities: [
        {
          id: "e1",
          type: "food",
          label: "In-N-Out burger",
          contextClass: "ACTIVE" as const,
        },
        {
          id: "e2",
          type: "sports",
          label: "BYU football",
          contextClass: "EXPIRED" as const,
        },
      ],
      constraints: {},
      exclusions: [],
      resultSets: [],
      evidence: [],
      currentIntent: "lookup",
      desiredAnswerShape: "normal" as const,
      currentOperation: "lookup",
      requestedFields: [],
      requestedItemCount: null,
      presentation: null,
      freshnessRequirement: false,
      dissatisfactionSignal: false,
      clarificationRequired: false,
      internalDataRequired: false,
      externalRetrievalRequired: false,
    };
    const turnTask = resolveTurnTask({
      content: "How many calories in a double double?",
      previous: conv,
    });
    const { evidence, dropped } = filterEvidenceForCurrentTurn(
      [
        {
          id: "1",
          kind: "exa_synthesis",
          title: "BYU game",
          content: "BYU opens against Utah Tech on September 5.",
          retrievedAt: new Date().toISOString(),
          sourceTool: "web.search",
          ok: true,
        },
        {
          id: "2",
          kind: "exa_synthesis",
          title: "Nutrition",
          content: "Double-double has about 670 calories protein style.",
          retrievedAt: new Date().toISOString(),
          sourceTool: "web.search",
          ok: true,
        },
      ],
      {
        turnTask,
        conversationState: conv,
        userMessage: "How many calories in a double double?",
      },
    );
    assert.equal(dropped, 1);
    assert.equal(evidence.length, 1);
    assert.match(evidence[0]!.content, /calories/i);

    const snippets = filterMemorySnippetsForTurn(
      [
        "assistant: BYU opens against Utah Tech on Sept 5.",
        "assistant: Double-double protein style is about 670 calories.",
      ],
      { turnTask, conversationState: conv },
    );
    assert.equal(snippets.length, 1);
    assert.match(snippets[0]!, /calories/i);
  });

  it("evaluateExaSynthesisQuality stops escalating at deep-reasoning", async () => {
    const { evaluateExaSynthesisQuality } = await import(
      "../lib/ai/web-research/index.ts"
    );
    const quality = evaluateExaSynthesisQuality({
      bundle: {
        provider: "exa",
        retrievalMode: "deep-reasoning",
        query: "test",
        directAnswer: "unclear",
        grounding: [],
        groundingConfidence: "none",
        supportingResults: [],
        outputSchemaType: "text",
      },
      question: "Complex analysis",
      hints: { operation: "compare" },
    });
    assert.equal(quality.sufficient, false);
    assert.equal(quality.escalateTo, null);
  });
});
