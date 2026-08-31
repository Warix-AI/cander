import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  validateTaskEvidence,
  validateAllTasks,
} from "../lib/ai/orchestrator/task-evidence-validator.ts";
import {
  compileTaskGraph,
  setSubtaskStatus,
} from "../lib/ai/orchestrator/task-graph.ts";
import { scanRequest } from "../lib/ai/orchestrator/request-scanner.ts";
import type { TurnEvidence } from "../lib/ai/orchestrator/evidence.ts";

describe("task evidence validator", () => {
  it("marks task satisfied when tagged evidence answers the ask", () => {
    const node = {
      id: "retrieve_primary",
      kind: "RETRIEVE" as const,
      label: "Denali elevation",
      status: "SUCCEEDED" as const,
      query: "Denali elevation feet",
      capability: "web.search" as const,
      subtaskId: "retrieve_primary",
    };
    const evidence: TurnEvidence[] = [
      {
        id: "st_retrieve_primary_1",
        kind: "exa_synthesis",
        title: "Denali",
        content: "Denali summit elevation is 20,310 feet above sea level.",
        retrievedAt: new Date().toISOString(),
        sourceTool: "web.search",
        ok: true,
        subtaskId: "retrieve_primary",
      },
    ];
    const result = validateTaskEvidence({ node, evidence });
    assert.equal(result.satisfied, true);
  });

  it("suggests web.read retry when only snippets exist", () => {
    const node = {
      id: "retrieve_a",
      kind: "RETRIEVE" as const,
      label: "Contract status",
      status: "SUCCEEDED" as const,
      query: "John contract email status",
      capability: "web.search" as const,
      subtaskId: "retrieve_a",
    };
    const evidence: TurnEvidence[] = [
      {
        id: "st_retrieve_a_1",
        kind: "search_result",
        title: "Inbox",
        content: "short",
        url: "https://example.com/inbox",
        retrievedAt: new Date().toISOString(),
        sourceTool: "web.search",
        ok: true,
        subtaskId: "retrieve_a",
      },
    ];
    const result = validateTaskEvidence({ node, evidence });
    assert.equal(result.satisfied, false);
    assert.equal(result.alternateCapability, "web.read");
    assert.equal(result.refinedQuery, node.query);
  });

  it("refines query when no evidence for task", () => {
    const node = {
      id: "retrieve_b",
      kind: "RETRIEVE" as const,
      label: "Pricing tier",
      status: "SUCCEEDED" as const,
      query: "example.com pricing tier",
      capability: "web.search" as const,
      subtaskId: "retrieve_b",
    };
    const result = validateTaskEvidence({ node, evidence: [] });
    assert.equal(result.satisfied, false);
    assert.ok(result.refinedQuery?.includes("official"));
  });

  it("validateAllTasks only checks completed retrieval nodes", () => {
    const q =
      "Check whether John emailed me the contract, compare it to the workspace contract, tell me if anything changed";
    let graph = compileTaskGraph({ ledger: scanRequest(q), researchPlan: null });
    const retrieve = graph.nodes.find((n) => n.kind === "RETRIEVE");
    assert.ok(retrieve);
    graph = setSubtaskStatus(graph, retrieve!.id, "SUCCEEDED");
    const validations = validateAllTasks({
      graph,
      evidence: [
        {
          id: `st_${retrieve!.id}_1`,
          kind: "exa_synthesis",
          title: "Contract",
          content: "John sent the contract yesterday with updated terms.",
          retrievedAt: new Date().toISOString(),
          sourceTool: "web.search",
          ok: true,
          subtaskId: retrieve!.id,
        },
      ],
    });
    assert.equal(validations.length, 1);
    assert.equal(validations[0]!.satisfied, true);
  });
});
