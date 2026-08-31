/**
 * URL fetch → summarize workflow — entity/action binding regression tests.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { scanRequest } from "../lib/ai/orchestrator/request-scanner.ts";
import {
  bindEntitiesToActions,
  graphUsesFillerQuery,
} from "../lib/ai/orchestrator/entity-action-binding.ts";
import {
  compileTaskGraph,
  ensureUrlFetchNodes,
} from "../lib/ai/orchestrator/task-graph.ts";
import { validateTaskPlan } from "../lib/ai/orchestrator/plan-validator.ts";
import { extractRequestedUrl } from "../lib/ai/orchestrator/web-retrieval.ts";

const CASES = [
  {
    prompt:
      "Can you review canderhq.com and write me a quick summary about what it's offering?",
    domain: "canderhq.com",
  },
  {
    prompt: "Can you look at vercel.com and tell me about it?",
    domain: "vercel.com",
  },
] as const;

const FILLER_PHRASES = [
  "tell me about it",
  "what it offers",
  "what it's offering",
  "write me a summary",
  "look at it",
];

function compileBoundGraph(prompt: string) {
  const scanned = scanRequest(prompt);
  const bound = bindEntitiesToActions(scanned);
  let graph = compileTaskGraph({
    ledger: bound.ledger,
    urlWorkflows: bound.urlWorkflows,
    retrievalRequired: bound.urlWorkflows.length > 0,
  });
  const repair = ensureUrlFetchNodes({ graph, ledger: bound.ledger });
  graph = repair.graph;
  const validation = validateTaskPlan({
    ledger: bound.ledger,
    graph,
    retrievalRequired: bound.urlWorkflows.length > 0,
  });
  return { bound, graph, validation };
}

describe("url workflow entity/action binding", () => {
  for (const { prompt, domain } of CASES) {
    it(`compiles FETCH_URL → SUMMARIZE_SITE for ${domain}`, () => {
      assert.ok(extractRequestedUrl(prompt)?.domain.includes(domain.replace(".com", "")));

      const { bound, graph, validation } = compileBoundGraph(prompt);

      assert.ok(bound.urlWorkflows.length >= 1, "expected url workflow");
      assert.equal(validation.health, "ok", validation.issues.join(", "));

      const fetch = graph.nodes.find((n) => n.kind === "FETCH_URL");
      const summarize = graph.nodes.find((n) => n.kind === "SUMMARIZE_SITE");

      assert.ok(fetch, "missing FETCH_URL node");
      assert.ok(summarize, "missing SUMMARIZE_SITE node");
      assert.ok(fetch!.query!.toLowerCase().includes(domain.split(".")[0]!));
      assert.equal(fetch!.capability, "web.read");
      assert.ok(summarize!.dependsOn?.includes(fetch!.id));

      for (const node of graph.nodes) {
        const q = `${node.query ?? ""} ${node.label ?? ""}`.toLowerCase();
        for (const filler of FILLER_PHRASES) {
          assert.ok(
            !q.includes(filler),
            `graph must not search/explain filler phrase "${filler}" (node ${node.id}: ${q})`,
          );
        }
        if (node.kind === "RETRIEVE" && node.capability === "web.search") {
          assert.fail(`unexpected web.search RETRIEVE for URL workflow: ${node.id}`);
        }
      }

      assert.equal(graphUsesFillerQuery(graph), false);
    });
  }

  it("repairs graph when URL present but fetch node missing", () => {
    const prompt = CASES[0].prompt;
    const scanned = scanRequest(prompt);
    const bound = bindEntitiesToActions(scanned);
    const emptyGraph = compileTaskGraph({ ledger: bound.ledger });
    assert.ok(!emptyGraph.nodes.some((n) => n.kind === "FETCH_URL"));

    const repaired = ensureUrlFetchNodes({ graph: emptyGraph, ledger: bound.ledger });
    assert.equal(repaired.repaired, true);
    assert.ok(repaired.graph.nodes.some((n) => n.kind === "FETCH_URL"));
  });
});
