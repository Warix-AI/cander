/**
 * Retrieval invariants — deterministic orchestration gates (zero FM / zero network).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { runTaskGraphExecution } from "../lib/ai/orchestrator/task-executor.ts";
import {
  executableNodes,
  resetRetrievalForRetry,
  compileTaskGraph,
  ensureRetrievalNodes,
} from "../lib/ai/orchestrator/task-graph.ts";
import { validateTaskPlan } from "../lib/ai/orchestrator/plan-validator.ts";
import {
  isRetrievalRequiredForTurn,
  shouldBlockSynthesisWithoutEvidence,
} from "../lib/ai/orchestrator/retrieval-requirements.ts";
import { validateLocalGrounding } from "../lib/ai/orchestrator/grounding-validator.ts";
import { scanRequest } from "../lib/ai/orchestrator/request-scanner.ts";
import {
  applyTemporalToTurnTask,
  resolveTemporalGrounding,
} from "../lib/ai/orchestrator/temporal-grounding.ts";
import {
  emptyConversationTurnState,
  resolveTurnTask,
} from "../lib/ai/turn-environment/index.ts";
import type { TurnEvidence } from "../lib/ai/orchestrator/evidence.ts";

const RETRIEVAL_CASES = [
  "When does the fall semester for BYU start this year?",
  "What are the BYU football games this year?",
  "What happened in the news today?",
] as const;

function compileRetrievalGraph(question: string) {
  const conv = emptyConversationTurnState();
  const ledger = scanRequest(question);
  const temporal = resolveTemporalGrounding({ content: question, conv });
  let turnTask = resolveTurnTask({ content: question, previous: conv });
  turnTask = applyTemporalToTurnTask(turnTask, temporal);
  const retrievalRequired = isRetrievalRequiredForTurn({
    turnTask,
    temporalGrounding: temporal,
    conversationState: conv,
    ledger,
  });
  let graph = compileTaskGraph({
    ledger,
    turnTask,
    retrievalRequired,
  });
  graph = ensureRetrievalNodes({
    graph,
    ledger,
    turnTask,
    retrievalRequired,
  }).graph;
  const validation = validateTaskPlan({
    ledger,
    graph,
    retrievalRequired,
  });
  return { graph, turnTask, temporal, ledger, retrievalRequired, validation };
}

describe("retrieval invariants", () => {
  for (const question of RETRIEVAL_CASES) {
    it(`requires RETRIEVE before synthesis: ${question.slice(0, 48)}…`, () => {
      const compiled = compileRetrievalGraph(question);

      assert.equal(compiled.retrievalRequired, true, question);
      const retrieveNodes = compiled.graph.nodes.filter((n) => n.kind === "RETRIEVE");
      assert.ok(retrieveNodes.length >= 1, `missing RETRIEVE for: ${question}`);
      assert.ok(
        retrieveNodes.some((n) => n.capability === "web.search"),
        `web.search capability missing for: ${question}`,
      );
      assert.ok(
        executableNodes(compiled.graph).length >= 1,
        `no executable retrieval nodes for: ${question}`,
      );
      assert.equal(compiled.validation.health, "ok", compiled.validation.issues.join(", "));
    });
  }

  it("executes web.search for BYU fall semester (mocked)", async () => {
    const question = RETRIEVAL_CASES[0];
    const compiled = compileRetrievalGraph(question);
    const toolCalls: string[] = [];
    const evidence: TurnEvidence[] = [];
    const toolResults: Array<{ name: string; ok: boolean; output: string; data?: unknown }> =
      [];
    const provenanceBatches: never[][] = [];

    await runTaskGraphExecution({
      graph: compiled.graph,
      ctx: {
        content: question,
        turnTask: compiled.turnTask,
        conversationState: emptyConversationTurnState(),
        constraints: compiled.graph.constraints,
        temporalGrounding: compiled.temporal,
        executeTool: async ({ name }) => {
          toolCalls.push(name);
          return {
            ok: true,
            name,
            output: "Fall 2026 classes begin August 25, 2026.",
            data: {
              results: [
                {
                  title: "BYU Academic Calendar",
                  text: "Fall 2026 semester classes begin August 25, 2026.",
                },
              ],
            },
          };
        },
        mapToolResult: (result, subtaskId) => ({
          evidence: [
            {
              id: "ev_byu_1",
              kind: "search_result",
              title: "BYU Academic Calendar",
              content: "Fall 2026 semester classes begin August 25, 2026.",
              ok: true,
              sourceTool: result.name,
              retrievedAt: new Date().toISOString(),
              subtaskId,
            },
          ],
          atoms: [],
        }),
        report: () => {},
        detailForTool: () => "Searching",
      },
      evidence,
      toolResults,
      provenanceBatches,
    });

    assert.ok(toolCalls.includes("web.search"), "web.search must run");
    assert.ok(evidence.some((e) => e.ok && e.content.includes("August 25")), "evidence accepted");
  });

  for (const question of RETRIEVAL_CASES) {
    it(`blocks synthesis without evidence: ${question.slice(0, 40)}…`, () => {
      assert.equal(
        shouldBlockSynthesisWithoutEvidence({
          retrievalRequired: true,
          evidence: [],
          retrievalAttempted: true,
        }),
        true,
      );

      const grounding = validateLocalGrounding({
        answer:
          "The answer is Monday, August 23, 2026, according to typical schedules.",
        userRequest: question,
        evidence: [],
        retrievalAttempted: false,
        retrievalRequired: true,
      });
      assert.equal(grounding.valid, false);
      assert.ok(
        grounding.issues.some((i) =>
          ["MISSING_RETRIEVAL", "UNGROUNDED_CURRENT_FACT", "UNRESOLVED_EXTERNAL_FACT"].includes(
            i,
          ),
        ),
        `expected grounding failure for: ${question} got ${grounding.issues.join(",")}`,
      );
    });
  }

  it("dissatisfaction retry re-opens RETRIEVE nodes for another round", () => {
    const compiled = compileRetrievalGraph(RETRIEVAL_CASES[0]);
    let graph = {
      ...compiled.graph,
      nodes: compiled.graph.nodes.map((n) =>
        n.id === "retrieve_primary"
          ? { ...n, status: "UNRESOLVED" as const, terminalReason: "evidence_insufficient" }
          : n,
      ),
    };
    const retried = resetRetrievalForRetry(graph);
    const retrieve = retried.nodes.find((n) => n.id === "retrieve_primary");
    assert.equal(retrieve?.status, "PENDING");
    assert.equal((retrieve?.retryCount ?? 0) >= 1, true);
  });
});
