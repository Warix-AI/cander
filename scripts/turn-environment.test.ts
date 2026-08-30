/**
 * Turn environment compiler trajectory tests — gate every PR.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  budgetsForProfile,
  citationsFromAtoms,
  compileTurnProfile,
  MAX_TOOLS_PER_TURN,
  normalizeWebSearchResult,
  parseSemanticResponse,
  resolveClarificationRequired,
  resolveToolMode,
  resolveTurnState,
  runParallelTasks,
  SEMANTIC_BLOCK_TYPES_V1,
  semanticBlocksToMarkdown,
  toDynamicProfilePayload,
} from "../lib/ai/turn-environment/index.ts";
import { initialDeterministicToolCalls } from "../lib/ai/orchestrator/deterministic-triggers.ts";
import {
  hasUsableEvidenceSnippets,
  validateLocalGrounding,
} from "../lib/ai/orchestrator/grounding-validator.ts";
import type { TurnEvidence } from "../lib/ai/orchestrator/evidence.ts";

describe("budget profiles", () => {
  it("on_device_small starts near Apple 4k without hardcoding architecture", () => {
    const b = budgetsForProfile("on_device_small");
    assert.equal(b.profile, "on_device_small");
    assert.equal(b.contextTokens, 4096);
    assert.equal(b.maxToolRounds, 2);
    const large = budgetsForProfile("on_device_large");
    assert.ok(large.contextTokens > b.contextTokens);
  });
});

describe("compileTurnProfile — tool cap + modes", () => {
  it("exposes 0 tools on simple greeting", () => {
    const p = compileTurnProfile({ content: "hello" });
    assert.equal(p.tools.length, 0);
    assert.equal(p.toolMode, "disallowed");
    assert.equal(p.clarificationPolicy.clarificationRequired, false);
    assert.ok(p.tools.length <= MAX_TOOLS_PER_TURN);
  });

  it("never exceeds 5 tool cards", () => {
    const p = compileTurnProfile({
      content: "search my projects and open build settings and look up pricing",
    });
    assert.ok(p.tools.length <= MAX_TOOLS_PER_TURN);
  });

  it("pre-runs live-info / calories without requiring FM to choose search", () => {
    const q =
      "How many calories are in a In-N-Out double double protein style";
    const calls = initialDeterministicToolCalls(q);
    assert.ok(calls.some((c) => c.name === "web.search"));
    assert.equal(calls[0]!.reason, "live_info_prerun");
    const p = compileTurnProfile({ content: q });
    assert.ok(p.preRunTasks.some((t) => t.name === "web.search"));
    // After pre-run covers retrieval, toolMode should not be required
    assert.notEqual(p.toolMode, "required");
  });

  it("strips clarify tools when clarificationRequired is false", () => {
    const p = compileTurnProfile({
      content: "create a new project called Atlas",
    });
    assert.equal(p.clarificationPolicy.clarificationRequired, false);
    assert.ok(!p.tools.some((t) => t.name === "ui.ask_clarification"));
  });

  it("sets clarificationRequired for destructive ambiguous deletes", () => {
    const c = resolveClarificationRequired({
      content: "delete the project",
      domains: ["projects"],
    });
    assert.equal(c.clarificationRequired, true);
  });
});

describe("resolveToolMode", () => {
  it("disallows tools when pre-run covers live evidence need", () => {
    const mode = resolveToolMode({
      content: "what's the weather in Austin today?",
      preRunTasks: [
        { name: "web.search", arguments: { query: "weather" }, reason: "live" },
      ],
      toolNames: ["web.search", "web.open"],
      clarificationRequired: false,
    });
    assert.equal(mode, "disallowed");
  });
});

describe("TurnStateResolver — deterministic only", () => {
  it("handles yes/no/cancel/retry/ordinal", () => {
    assert.equal(
      resolveTurnState({
        content: "yes",
        taskState: { status: "awaiting_clarification", pendingClarification: {} },
      }).handled?.kind,
      "confirm_yes",
    );
    assert.equal(
      resolveTurnState({
        content: "cancel",
        taskState: { status: "awaiting_clarification", pendingClarification: {} },
      }).handled?.kind,
      "cancel",
    );
    assert.equal(resolveTurnState({ content: "try again" }).handled?.kind, "retry");
    assert.equal(
      resolveTurnState({
        content: "the second one",
        taskState: {
          recentLists: [{ items: [{ ordinal: 2, label: "Option B" }] }],
        },
      }).handled?.ordinal,
      2,
    );
  });
});

describe("provenance normalizer", () => {
  it("keeps sourceIds and prefers citation excerpts when descriptions thin", () => {
    const n = normalizeWebSearchResult({
      toolName: "web.search",
      ok: true,
      results: [
        {
          id: "src_a",
          title: "In-N-Out",
          url: "https://www.in-n-out.com/nutrition",
          description: "",
        },
      ],
      citations: [
        {
          id: "src_a",
          url: "https://www.in-n-out.com/nutrition",
          excerpt: "Protein Style Double-Double is about 520 calories.",
        },
      ],
    });
    assert.equal(n.atoms[0]!.sourceId, "src_a");
    assert.match(n.atoms[0]!.excerpt, /520/);
    assert.equal(n.sufficient, true);
    const cites = citationsFromAtoms(n.atoms);
    assert.equal(cites[0]!.id, "src_a");
  });
});

describe("parallel early-exit", () => {
  it("cancels late branches when sufficient", async () => {
    let slowStarted = false;
    let slowCancelled = false;
    const results = await runParallelTasks({
      tasks: [
        {
          id: "fast",
          run: async () => "ok",
        },
        {
          id: "slow",
          run: async (signal) => {
            slowStarted = true;
            await new Promise((r) => setTimeout(r, 200));
            if (signal.aborted) {
              slowCancelled = true;
              throw new Error("cancelled");
            }
            return "late";
          },
        },
      ],
      concurrency: 2,
      timeoutMs: 5000,
      isSufficient: (done) => done.some((d) => d.id === "fast" && d.ok),
    });
    assert.ok(results.some((r) => r.id === "fast" && r.ok));
    // slow may have started; should end cancelled or not succeed
    const slow = results.find((r) => r.id === "slow");
    if (slowStarted && slow) {
      assert.ok(!slow.ok || slowCancelled || slow.cancelled);
    }
  });
});

describe("anti-hedge grounding", () => {
  it("flags hedge when usable evidence snippets exist", () => {
    const evidence: TurnEvidence[] = [
      {
        id: "src_1",
        kind: "search_result",
        title: "Nutrition",
        url: "https://example.com",
        content: "Double-Double Protein Style contains approximately 520 calories per burger.",
        retrievedAt: new Date().toISOString(),
        sourceTool: "web.search",
        ok: true,
      },
    ];
    assert.equal(hasUsableEvidenceSnippets(evidence), true);
    const v = validateLocalGrounding({
      answer:
        "I don't have live calorie data. Check the In-N-Out nutrition page or online calculator.",
      userRequest: "How many calories in In-N-Out double double protein style",
      evidence,
      retrievalAttempted: true,
    });
    assert.equal(v.valid, false);
    assert.equal(v.recommendedAction, "use_evidence_fallback");
    assert.ok(v.issues.includes("HEDGE_DESPITE_EVIDENCE"));
  });
});

describe("semantic blocks v1", () => {
  it("only allows the 8 block types", () => {
    assert.equal(SEMANTIC_BLOCK_TYPES_V1.length, 8);
    const parsed = parseSemanticResponse({
      blocks: [
        { type: "short_answer", text: "520 calories" },
        { type: "invented_type", text: "nope" },
        { type: "bullet_list", items: ["A", "B"] },
      ],
    });
    assert.ok(parsed);
    assert.equal(parsed!.blocks.length, 2);
    assert.match(semanticBlocksToMarkdown(parsed!.blocks), /520/);
  });
});

describe("DynamicProfile payload", () => {
  it("serializes TurnProfile for future native DynamicInstructions", () => {
    const p = compileTurnProfile({ content: "hello" });
    const payload = toDynamicProfilePayload(p);
    assert.equal(payload.version, 1);
    assert.equal(payload.toolMode, "disallowed");
    assert.ok(payload.instructions.includes("toolMode="));
  });
});
