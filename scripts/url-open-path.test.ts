/**
 * Explicit website URL path — direct fetch first, not agent/Exa-search-first.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  normalizeExplicitUrl,
  retryNormalizedUrl,
  siteSearchQueryForUrl,
  isExplicitWebsiteInspectRequest,
  wantsExplicitAgentEscalation,
  urlHostMatchesRequestedDomain,
} from "../lib/ai/orchestrator/url-open-path.ts";
import { scanRequest } from "../lib/ai/orchestrator/request-scanner.ts";
import { bindEntitiesToActions } from "../lib/ai/orchestrator/entity-action-binding.ts";
import {
  compileTaskGraph,
  ensureUrlFetchNodes,
  blockDownstreamTasks,
} from "../lib/ai/orchestrator/task-graph.ts";
import { validateTaskPlan } from "../lib/ai/orchestrator/plan-validator.ts";
import { runTaskGraphExecution } from "../lib/ai/orchestrator/task-executor.ts";
import { compileWebRetrievalPlan } from "../lib/ai/turn-environment/web-retrieval-plan.ts";
import { resolveTurnTask } from "../lib/ai/turn-environment/turn-task.ts";
import { emptyConversationTurnState } from "../lib/ai/turn-environment/conversation-types.ts";
import { executeLookup } from "../lib/ai/simple-turn/cap-router.ts";
import type { AiToolCallResult } from "../lib/ai/runtime/tools";
import type { TurnEvidence } from "../lib/ai/orchestrator/evidence.ts";

const CASES = [
  {
    prompt: "Check canderhq.com and summarize what it does",
    domain: "canderhq.com",
    url: "https://canderhq.com/",
  },
  {
    prompt: "Look at vercel.com and tell me what it offers",
    domain: "vercel.com",
    url: "https://vercel.com/",
  },
  {
    prompt: "Review https://stripe.com and give me a quick summary",
    domain: "stripe.com",
    url: "https://stripe.com/",
  },
] as const;

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

function mockExecCtx(opts: {
  onExecute: (
    name: string,
    args: Record<string, unknown>,
  ) => AiToolCallResult | Promise<AiToolCallResult>;
}) {
  return {
    content: "test",
    turnTask: resolveTurnTask({ content: "test", previous: null }),
    conversationState: emptyConversationTurnState(),
    constraints: [],
    executeTool: async ({
      name,
      arguments: args,
    }: {
      name: string;
      arguments: Record<string, unknown>;
    }) => opts.onExecute(name, args),
    mapToolResult: (result: AiToolCallResult, subtaskId?: string) => ({
      evidence: [
        {
          id: subtaskId ? `st_${subtaskId}_1` : "1",
          kind: "web_page" as const,
          title: "Page",
          content: result.output || "page content about the product",
          url: String((result.data as { finalUrl?: string } | undefined)?.finalUrl ?? ""),
          retrievedAt: new Date().toISOString(),
          sourceTool: result.name,
          ok: result.ok,
          subtaskId,
        } satisfies TurnEvidence,
      ],
      atoms: [],
    }),
    report: () => {},
    detailForTool: () => "Opening",
  };
}

describe("url open path helpers", () => {
  it("normalizes bare domains to https", () => {
    const n = normalizeExplicitUrl("canderhq.com");
    assert.ok(n);
    assert.equal(n!.url, "https://canderhq.com/");
    assert.equal(n!.domain, "canderhq.com");
  });

  it("preserves full https URLs", () => {
    const n = normalizeExplicitUrl("https://stripe.com/pricing");
    assert.ok(n);
    assert.equal(n!.domain, "stripe.com");
    assert.ok(n!.url.startsWith("https://stripe.com"));
  });

  it("builds site: fallback queries", () => {
    assert.equal(siteSearchQueryForUrl("canderhq.com"), "site:canderhq.com");
    assert.equal(
      siteSearchQueryForUrl("https://vercel.com/docs"),
      "site:vercel.com",
    );
  });

  it("retryNormalizedUrl flips www", () => {
    const retry = retryNormalizedUrl("https://canderhq.com/");
    assert.ok(retry);
    assert.ok(retry!.includes("www.canderhq.com"));
  });

  it("validates finalUrl domain ownership", () => {
    assert.equal(
      urlHostMatchesRequestedDomain("https://www.canderhq.com/about", "canderhq.com"),
      true,
    );
    assert.equal(
      urlHostMatchesRequestedDomain("https://evil.com", "canderhq.com"),
      false,
    );
  });
});

describe("explicit website inspect — no agent-first", () => {
  for (const { prompt, domain, url } of CASES) {
    it(`${domain}: plans FETCH_URL web.read, not agent mode`, () => {
      assert.equal(isExplicitWebsiteInspectRequest(prompt), true);
      assert.equal(wantsExplicitAgentEscalation(prompt), false);

      const { bound, graph, validation } = compileBoundGraph(prompt);
      assert.equal(validation.health, "ok", validation.issues.join(", "));
      assert.ok(bound.urlWorkflows.length >= 1);

      const fetch = graph.nodes.find((n) => n.kind === "FETCH_URL");
      const summarize = graph.nodes.find((n) => n.kind === "SUMMARIZE_SITE");
      assert.ok(fetch, "missing FETCH_URL");
      assert.ok(summarize, "missing SUMMARIZE_SITE");
      assert.equal(fetch!.capability, "web.read");
      assert.ok(fetch!.query?.toLowerCase().includes(domain.split(".")[0]!));

      // No generic web.search RETRIEVE on the happy path
      for (const n of graph.nodes) {
        if (n.kind === "RETRIEVE" && n.capability === "web.search") {
          assert.fail(`unexpected web.search RETRIEVE for ${domain}`);
        }
      }

      const plan = compileWebRetrievalPlan({
        content: prompt,
        turnTask: resolveTurnTask({ content: prompt, previous: null }),
      });
      assert.notEqual(plan.mode, "agent", "must not escalate to agent mode");
      assert.ok(
        plan.mode === "none" || plan.domains?.includes(domain),
        `expected URL-owned plan, got mode=${plan.mode}`,
      );
      assert.ok(
        plan.query.includes(domain) || plan.query.startsWith("https://"),
        `plan query should target ${domain}, got ${plan.query}`,
      );
      assert.deepEqual(plan.escalationChain, []);
    });

    it(`${domain}: executor sends normalized https URL to web.read first`, async () => {
      const { graph } = compileBoundGraph(prompt);
      const calls: Array<{ name: string; args: Record<string, unknown> }> = [];

      await runTaskGraphExecution({
        graph,
        ctx: mockExecCtx({
          onExecute: (name, args) => {
            calls.push({ name, args });
            return {
              name,
              ok: true,
              output: `Page about ${domain} offers products and services for customers.`,
              data: {
                url: url,
                finalUrl: url,
                title: domain,
                text: `${domain} helps teams ship software.`,
              },
            };
          },
        }),
        evidence: [],
        toolResults: [],
        provenanceBatches: [],
      });

      assert.ok(calls.length >= 1, "expected at least one tool call");
      assert.equal(calls[0]!.name, "web.read");
      assert.equal(typeof calls[0]!.args.url, "string");
      assert.ok(
        String(calls[0]!.args.url).startsWith("https://"),
        `expected https URL, got ${calls[0]!.args.url}`,
      );
      assert.ok(
        String(calls[0]!.args.url).toLowerCase().includes(domain.split(".")[0]!),
      );
      assert.ok(
        !calls.some((c) => c.name === "web.research"),
        "must not use deep research/agent tool first",
      );
    });
  }

  it("FETCH_URL failure falls back to site: search then blocks summarize if that fails", async () => {
    const prompt = CASES[0].prompt;
    const { graph } = compileBoundGraph(prompt);
    const calls: string[] = [];

    const result = await runTaskGraphExecution({
      graph,
      ctx: mockExecCtx({
        onExecute: (name, args) => {
          calls.push(`${name}:${JSON.stringify(args)}`);
          return {
            name,
            ok: false,
            output: "fetch failed",
            data: { url: args.url ?? args.query, finalUrl: "", title: "", text: "" },
          };
        },
      }),
      evidence: [],
      toolResults: [],
      provenanceBatches: [],
    });

    assert.ok(
      calls.some((c) => c.startsWith("web.read:")),
      "first attempt must be web.read",
    );
    assert.ok(
      calls.some((c) => c.includes("site:canderhq.com")),
      `expected site: fallback, got ${calls.join(" | ")}`,
    );

    const summarize = result.graph.nodes.find((n) => n.kind === "SUMMARIZE_SITE");
    assert.ok(summarize);
    assert.equal(
      summarize!.status,
      "BLOCKED_UPSTREAM_FAILED",
      "summarize must be BLOCKED when fetch+site fail",
    );
  });

  it("blockDownstreamTasks marks summarize BLOCKED_UPSTREAM_FAILED", () => {
    const { graph } = compileBoundGraph(CASES[2].prompt);
    const fetch = graph.nodes.find((n) => n.kind === "FETCH_URL")!;
    const blocked = blockDownstreamTasks(
      {
        ...graph,
        nodes: graph.nodes.map((n) =>
          n.id === fetch.id ? { ...n, status: "FAILED" as const } : n,
        ),
      },
      fetch.id,
    );
    const summarize = blocked.nodes.find((n) => n.kind === "SUMMARIZE_SITE");
    assert.equal(summarize?.status, "BLOCKED_UPSTREAM_FAILED");
  });
});

describe("simple-turn URL execution", () => {
  for (const { prompt, domain, url } of CASES) {
    it(`${domain}: executeLookup uses web.read before any search`, async () => {
      const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
      const cache = new Map();
      await executeLookup({
        lookup: { cap: "WEB", q: domain === "stripe.com" ? url : domain },
        cache,
        executeTool: async ({ name, arguments: args }) => {
          calls.push({ name, args });
          return {
            name,
            ok: true,
            output: `Page: ${domain}\nURL: ${url}\n\n${domain} product overview for customers and businesses.`,
            data: { url, finalUrl: url, title: domain, text: `${domain} overview` },
          };
        },
      });

      assert.equal(calls[0]?.name, "web.read");
      assert.ok(String(calls[0]?.args.url).startsWith("https://"));
      assert.equal(calls.length, 1, "successful read must not also search");
      void prompt;
    });
  }

  it("failed web.read falls back to site: search once", async () => {
    const calls: string[] = [];
    await executeLookup({
      lookup: { cap: "WEB", q: "canderhq.com" },
      cache: new Map(),
      executeTool: async ({ name, arguments: args }) => {
        calls.push(name);
        if (name === "web.read") {
          return {
            name,
            ok: false,
            output: "Could not read",
            data: { url: args.url, finalUrl: args.url, title: "", text: "" },
          };
        }
        return {
          name,
          ok: true,
          output: "site:canderhq.com results about the product",
          data: {
            query: args.query,
            url: "https://canderhq.com/",
            results: [{ title: "Cander", url: "https://canderhq.com/" }],
          },
        };
      },
    });
    assert.deepEqual(calls, ["web.read", "web.search"]);
  });
});
