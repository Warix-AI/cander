import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  compileTaskGraph,
  getReadyTasks,
} from "../lib/ai/orchestrator/task-graph.ts";
import { runTaskGraphExecution } from "../lib/ai/orchestrator/task-executor.ts";
import { scanRequest } from "../lib/ai/orchestrator/request-scanner.ts";
import { emptyConversationTurnState } from "../lib/ai/turn-environment/conversation-types.ts";
import { resolveTurnTask } from "../lib/ai/turn-environment/turn-task.ts";
import type { TurnEvidence } from "../lib/ai/orchestrator/evidence.ts";
import type { AiToolCallResult } from "../lib/ai/runtime/tools";

function mockCtx(opts: {
  onExecute?: (name: string, args: Record<string, unknown>, nodeId?: string) => AiToolCallResult;
}) {
  return {
    content: "test question",
    turnTask: resolveTurnTask({ content: "test", previous: null }),
    conversationState: emptyConversationTurnState(),
    constraints: [],
    executeTool: async ({
      name,
      arguments: args,
    }: {
      name: string;
      arguments: Record<string, unknown>;
    }) =>
      opts.onExecute?.(name, args) ?? {
        name,
        ok: true,
        output: "ok",
        data: {
          results: [
            {
              title: "Result",
              url: "https://example.com",
              description: "Denali elevation 20,310 feet official source",
            },
          ],
        },
      },
    mapToolResult: (result: AiToolCallResult, subtaskId?: string) => ({
      evidence: [
        {
          id: subtaskId ? `st_${subtaskId}_1` : "1",
          kind: "search_result" as const,
          title: "Result",
          content: "Denali elevation 20,310 feet official verified source",
          retrievedAt: new Date().toISOString(),
          sourceTool: result.name,
          ok: true,
          subtaskId,
        },
      ],
      atoms: [],
    }),
    report: () => {},
    detailForTool: () => "Searching",
  };
}

describe("task graph executor", () => {
  it("runs independent RETRIEVE nodes in parallel", async () => {
    const q =
      "Check whether John emailed me the contract, compare it to the workspace contract, tell me if anything changed";
    const ledger = scanRequest(q);
    const graph = compileTaskGraph({ ledger, researchPlan: null });
    const ready = getReadyTasks(graph);
    assert.ok(ready.length >= 2);

    const executed: string[] = [];
    const evidence: TurnEvidence[] = [];
    const toolResults: AiToolCallResult[] = [];
    const provenanceBatches: unknown[][] = [];

    await runTaskGraphExecution({
      graph,
      ctx: mockCtx({
        onExecute: (name, args) => {
          executed.push(String(args.query ?? name));
          return { name, ok: true, output: "ok", data: { results: [] } };
        },
      }),
      evidence,
      toolResults,
      provenanceBatches,
    });

    assert.equal(executed.length, ready.length);
    assert.ok(
      executed.every((query) => query.length < ledger.rawInput.length),
    );
  });

  it("runs dependent tasks sequentially across waves", async () => {
    const graph = compileTaskGraph({
      ledger: scanRequest("fact then calc"),
      researchPlan: null,
      retrieveSpecs: [
        {
          id: "retrieve_fact",
          label: "Find base value",
          query: "base fact official",
          capability: "web.search",
        },
        {
          id: "retrieve_calc",
          label: "Compute total",
          query: "computed total official",
          capability: "web.search",
          dependsOn: ["retrieve_fact"],
        },
      ],
    });

    const order: string[] = [];
    const evidence: TurnEvidence[] = [];
    const toolResults: AiToolCallResult[] = [];
    const provenanceBatches: unknown[][] = [];

    const result = await runTaskGraphExecution({
      graph,
      ctx: mockCtx({
        onExecute: (_name, args) => {
          order.push(String(args.query));
          return { name: "web.search", ok: true, output: "ok", data: {} };
        },
      }),
      evidence,
      toolResults,
      provenanceBatches,
    });

    assert.deepEqual(order, ["base fact official", "computed total official"]);
    const calc = result.graph.nodes.find((n) => n.id === "retrieve_calc");
    assert.ok(calc);
    assert.equal(calc!.status, "SUCCEEDED");
  });

  it("blocks downstream when upstream task fails", async () => {
    const graph = compileTaskGraph({
      ledger: scanRequest("upstream fail"),
      researchPlan: null,
      retrieveSpecs: [
        {
          id: "retrieve_upstream",
          label: "Upstream",
          query: "upstream query",
          capability: "web.search",
        },
        {
          id: "retrieve_downstream",
          label: "Downstream",
          query: "downstream query",
          capability: "web.search",
          dependsOn: ["retrieve_upstream"],
        },
      ],
    });

    const evidence: TurnEvidence[] = [];
    const toolResults: AiToolCallResult[] = [];
    const provenanceBatches: unknown[][] = [];

    const result = await runTaskGraphExecution({
      graph,
      ctx: {
        ...mockCtx({}),
        executeTool: async ({ name, arguments: args }) => {
          if (String(args.query).includes("upstream")) {
            return { name, ok: false, output: "failed", data: {} };
          }
          return { name, ok: true, output: "ok", data: {} };
        },
      },
      evidence,
      toolResults,
      provenanceBatches,
    });

    const downstream = result.graph.nodes.find(
      (n) => n.id === "retrieve_downstream",
    );
    assert.equal(downstream!.status, "BLOCKED_UPSTREAM_FAILED");
  });
});
