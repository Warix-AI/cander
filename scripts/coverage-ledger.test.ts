import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  evaluateCoverage,
  shouldBlockSynthesis,
  buildPartialAnswerPrefix,
} from "../lib/ai/orchestrator/coverage-ledger.ts";
import {
  compileTaskGraph,
  setSubtaskStatus,
} from "../lib/ai/orchestrator/task-graph.ts";
import { scanRequest } from "../lib/ai/orchestrator/request-scanner.ts";

describe("coverage ledger", () => {
  it("gates synthesis until all retrieval nodes are terminal", () => {
    const q =
      "Check whether John emailed me the contract, compare it to the workspace contract, tell me if anything changed";
    let graph = compileTaskGraph({ ledger: scanRequest(q), researchPlan: null });

    const pending = evaluateCoverage(graph);
    assert.equal(pending.readyForSynthesis, false);

    for (const n of graph.nodes.filter((x) => x.kind === "RETRIEVE")) {
      graph = setSubtaskStatus(graph, n.id, "SUCCEEDED");
    }
    const done = evaluateCoverage(graph);
    assert.equal(done.readyForSynthesis, true);
  });

  it("reports unresolved asks for partial answers", () => {
    const q =
      "Check whether John emailed me the contract, compare it to the workspace contract, tell me if anything changed";
    let graph = compileTaskGraph({ ledger: scanRequest(q), researchPlan: null });
    const nodes = graph.nodes.filter((n) => n.kind === "RETRIEVE");
    assert.ok(nodes.length >= 2);
    graph = setSubtaskStatus(graph, nodes[0]!.id, "SUCCEEDED");
    graph = setSubtaskStatus(graph, nodes[1]!.id, "UNRESOLVED", "no_evidence");
    for (const n of nodes.slice(2)) {
      graph = setSubtaskStatus(graph, n.id, "SUCCEEDED");
    }

    const coverage = evaluateCoverage(graph);
    assert.equal(coverage.readyForSynthesis, true);
    assert.ok(coverage.unresolvedAsks.length >= 1);
    assert.ok(coverage.partialMessage?.includes("unresolved"));
  });

  it("blocks synthesis when all retrieval failed", () => {
    const q =
      "Check whether John emailed me the contract, compare it to the workspace contract, tell me if anything changed";
    let graph = compileTaskGraph({ ledger: scanRequest(q), researchPlan: null });
    for (const n of graph.nodes.filter((x) => x.kind === "RETRIEVE")) {
      graph = setSubtaskStatus(graph, n.id, "FAILED", "tool_error");
    }

    const coverage = evaluateCoverage(graph);
    assert.equal(shouldBlockSynthesis(coverage), true);
  });

  it("allows synthesis when at least one retrieval succeeded", () => {
    const q =
      "Check whether John emailed me the contract, compare it to the workspace contract, tell me if anything changed";
    let graph = compileTaskGraph({ ledger: scanRequest(q), researchPlan: null });
    const nodes = graph.nodes.filter((n) => n.kind === "RETRIEVE");
    graph = setSubtaskStatus(graph, nodes[0]!.id, "SUCCEEDED");
    for (const n of nodes.slice(1)) {
      graph = setSubtaskStatus(graph, n.id, "UNRESOLVED", "weak_evidence");
    }

    const coverage = evaluateCoverage(graph);
    assert.equal(shouldBlockSynthesis(coverage), false);
  });
});
