/**
 * Phase 0 — live turn latency + composer speculation flag (disabled).
 * Run: node --experimental-strip-types --test scripts/live-turn-latency.test.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it, beforeEach } from "node:test";

import { isComposerSpeculationEnabled } from "../lib/ai/composer-speculation/flags.ts";
import {
  assertNoSensitiveLatencyFields,
  clearLiveTurnLatency,
  computeDurationPercentiles,
  getLiveTurnLatencySnapshot,
  provisionalCohortFromInput,
  refineLiveTurnCohort,
  sanitizeLiveTurnLatencyEvent,
  startLiveTurnLatency,
  summarizeLiveTurnLatency,
  type LiveTurnLatencyEvent,
} from "../lib/ai/live-turn-latency.ts";
import {
  buildRawOpenAIHistory,
  runRawOpenAITurn,
} from "../lib/ai/raw-openai/run-turn.ts";
import { AiRuntimeError } from "../lib/ai/runtime/types.ts";

describe("composer speculation flag", () => {
  it("defaults off when unset", () => {
    const prev = process.env.NEXT_PUBLIC_COMPOSER_SPECULATION;
    delete process.env.NEXT_PUBLIC_COMPOSER_SPECULATION;
    assert.equal(isComposerSpeculationEnabled(), false);
    if (prev !== undefined) process.env.NEXT_PUBLIC_COMPOSER_SPECULATION = prev;
  });

  it("can be forced off or on via env", () => {
    const prev = process.env.NEXT_PUBLIC_COMPOSER_SPECULATION;
    process.env.NEXT_PUBLIC_COMPOSER_SPECULATION = "1";
    assert.equal(isComposerSpeculationEnabled(), true);
    process.env.NEXT_PUBLIC_COMPOSER_SPECULATION = "0";
    assert.equal(isComposerSpeculationEnabled(), false);
    if (prev !== undefined) process.env.NEXT_PUBLIC_COMPOSER_SPECULATION = prev;
    else delete process.env.NEXT_PUBLIC_COMPOSER_SPECULATION;
  });
});

describe("live turn cohorts", () => {
  it("classifies simple local prompts as simple_no_tool", () => {
    assert.equal(
      provisionalCohortFromInput({ text: "what is 2 + 2" }),
      "simple_no_tool",
    );
  });

  it("classifies current/web asks as light_web_search", () => {
    assert.equal(
      provisionalCohortFromInput({ text: "what is the weather today" }),
      "light_web_search",
    );
  });

  it("classifies selected connectors as tool_heavy", () => {
    assert.equal(
      provisionalCohortFromInput({
        text: "hi",
        selectedConnectionCount: 1,
      }),
      "tool_heavy",
    );
  });

  it("refines with transport signals", () => {
    assert.equal(
      refineLiveTurnCohort({
        provisional: "simple_no_tool",
        webSearchUsed: true,
      }),
      "light_web_search",
    );
    assert.equal(
      refineLiveTurnCohort({
        provisional: "simple_no_tool",
        toolResultCount: 2,
      }),
      "tool_heavy",
    );
  });
});

describe("live turn latency session", () => {
  beforeEach(() => {
    clearLiveTurnLatency();
  });

  it("records a successful turn with percentiles-ready fields", () => {
    const session = startLiveTurnLatency({
      threadId: "t1",
      workspaceId: "w1",
      assistantMessageId: "a1",
      provisionalCohort: "simple_no_tool",
      historyMessageCount: 2,
    });
    session.mark("context_ready");
    session.setTransport("raw");
    session.mark("dispatch_start");
    session.mark("response_received");
    session.setServerDurationMs(1200);
    session.markFirstContentReceived();
    session.markFirstContentVisible();
    session.mark("reply_resolved");
    const event = session.finalize({ outcome: "ok" });
    assert.ok(event);
    assert.equal(event!.outcome, "ok");
    assert.equal(event!.transport, "raw");
    assert.equal(event!.cohort, "simple_no_tool");
    assert.ok(typeof event!.durations.sendToFirstVisibleMs === "number");
    assert.equal(event!.durations.serverDurationMs, 1200);
    assertNoSensitiveLatencyFields(event);
    assert.equal(getLiveTurnLatencySnapshot().length, 1);

    const summary = summarizeLiveTurnLatency(
      getLiveTurnLatencySnapshot(),
      "sendToFirstVisibleMs",
      "simple_no_tool",
    );
    assert.equal(summary.n, 1);
    assert.ok(summary.p50 != null);
  });

  it("records streamed marks without storing content", () => {
    const session = startLiveTurnLatency({
      provisionalCohort: "light_web_search",
    });
    session.setTransport("agent");
    session.markFirstContentReceived({ streaming: true });
    session.markFirstContentVisible();
    const event = session.finalize({ outcome: "ok" });
    assert.equal(event!.signals.contentStreaming, true);
    const json = JSON.stringify(event);
    assert.equal(json.includes("Hello assistant"), false);
    assert.equal(/"content"\s*:/.test(json), false);
  });

  it("records aborted turns", () => {
    const session = startLiveTurnLatency({
      provisionalCohort: "simple_no_tool",
    });
    session.mark("dispatch_start");
    const event = session.finalize({
      outcome: "cancelled",
      errorCode: "cancelled",
    });
    assert.equal(event!.outcome, "cancelled");
    assert.equal(event!.errorCode, "cancelled");
  });

  it("never throws from mark/finalize even if called twice", () => {
    const session = startLiveTurnLatency({
      provisionalCohort: "simple_no_tool",
    });
    assert.doesNotThrow(() => {
      session.mark("context_ready");
      session.finalize({ outcome: "ok" });
      session.finalize({ outcome: "ok" });
    });
  });

  it("sanitize drops unknown keys", () => {
    const dirty = sanitizeLiveTurnLatencyEvent({
      at: new Date().toISOString(),
      turnId: "x",
      transport: "raw",
      cohort: "simple_no_tool",
      provisionalCohort: "simple_no_tool",
      outcome: "ok",
      marks: { send_initiated: 0 },
      durations: {},
      signals: {},
      content: "SECRET_USER_PROMPT",
      prompt: "nope",
    } as LiveTurnLatencyEvent & { content: string; prompt: string });
    assert.equal("content" in dirty, false);
    assert.equal("prompt" in dirty, false);
    assertNoSensitiveLatencyFields(dirty);
  });

  it("percentile helper returns p50/p75/p90/p95", () => {
    const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    const p = computeDurationPercentiles(values);
    assert.equal(p.n, 10);
    assert.equal(p.p50, 55);
    assert.ok(p.p75 != null && p.p75 >= 70);
    assert.ok(p.p90 != null && p.p90 >= 90);
    assert.ok(p.p95 != null && p.p95 >= 95);
  });
});

describe("raw transport latency hooks", () => {
  beforeEach(() => {
    clearLiveTurnLatency();
  });

  it("marks dispatch/response/first content on successful raw turn", async () => {
    const originalFetch = globalThis.fetch;
    const bodies: unknown[] = [];
    globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
      if (init?.body) bodies.push(JSON.parse(String(init.body)));
      await new Promise((r) => setTimeout(r, 5));
      return new Response(
        JSON.stringify({
          content: "ok reply",
          model: "test-model",
          webSearchEnabled: false,
          webSearchUsed: false,
          latencyMs: 42,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    const latency = startLiveTurnLatency({
      provisionalCohort: "simple_no_tool",
    });
    latency.setTransport("raw");

    try {
      const result = await runRawOpenAITurn(
        {
          content: "hello",
          workspaceId: "w",
          title: "t",
          messages: [{ role: "user", content: "hello" }],
        },
        { latency },
      );
      assert.equal(result.content, "ok reply");
      assert.ok(bodies.length >= 1);
      const event = latency.finalize({ outcome: "ok" });
      assert.ok(event);
      assert.ok(event!.marks.dispatch_start != null);
      assert.ok(event!.marks.response_received != null);
      assert.ok(event!.marks.first_content_received != null);
      assert.equal(event!.durations.serverDurationMs, 42);
      assert.equal(event!.signals.webSearchUsed, false);
      assertNoSensitiveLatencyFields(event);
      assert.equal(JSON.stringify(event).includes("ok reply"), false);
      assert.equal(JSON.stringify(event).includes("hello"), false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("buildRawOpenAIHistory stays stable (no behavior change)", () => {
    const history = buildRawOpenAIHistory({
      content: "hi",
      workspaceId: "w",
      title: "t",
      messages: [{ role: "user", content: "hi" }],
    });
    assert.equal(history.length, 1);
    assert.equal(history[0]?.content, "hi");
  });

  it("aborted raw fetch surfaces cancelled without poisoning telemetry", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
      const signal = init?.signal;
      if (signal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }
      return new Promise((_resolve, reject) => {
        signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    }) as typeof fetch;

    const latency = startLiveTurnLatency({
      provisionalCohort: "simple_no_tool",
    });
    const ac = new AbortController();
    ac.abort();

    try {
      await assert.rejects(
        () =>
          runRawOpenAITurn(
            {
              content: "hello",
              workspaceId: "w",
              title: "t",
              messages: [{ role: "user", content: "hello" }],
            },
            { latency, signal: ac.signal },
          ),
        (err: unknown) =>
          err instanceof AiRuntimeError && err.code === "cancelled",
      );
      const event = latency.finalize({
        outcome: "cancelled",
        errorCode: "cancelled",
      });
      assert.equal(event!.outcome, "cancelled");
      assertNoSensitiveLatencyFields(event);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("agent transport latency wiring", () => {
  it("agent client records dispatch, response, tool, and first-content marks", () => {
    const src = fs.readFileSync("lib/ai/runtime/agent-client.ts", "utf8");
    assert.ok(src.includes('latency?.mark("dispatch_start")'));
    assert.ok(src.includes('latency?.mark("response_received")'));
    assert.ok(src.includes("markFirstContentReceived"));
    assert.ok(src.includes("markToolPhase"));
    assert.ok(src.includes("setServerDurationMs"));
  });

  it("agent probe marks exist on runAssistantTurn", () => {
    const src = fs.readFileSync("lib/ai/runtime/agent-turn.ts", "utf8");
    assert.ok(src.includes('latency?.mark("agent_probe_start")'));
    assert.ok(src.includes('latency?.mark("agent_probe_end")'));
    assert.ok(src.includes('setTransport("agent")'));
    assert.ok(src.includes('setTransport("raw")'));
  });

  it("simulates agent tool-heavy cohort refinement", () => {
    clearLiveTurnLatency();
    const latency = startLiveTurnLatency({
      provisionalCohort: "light_web_search",
    });
    latency.setTransport("agent");
    latency.mark("dispatch_start");
    latency.mark("response_received");
    latency.setServerDurationMs(99);
    latency.setSignals({ toolResultCount: 1 });
    latency.markToolPhase();
    latency.markFirstContentReceived({ streaming: true });
    const event = latency.finalize({ outcome: "ok" });
    assert.equal(event!.cohort, "tool_heavy");
    assert.ok(event!.marks.tool_phase != null);
    assertNoSensitiveLatencyFields(event);
  });
});

describe("telemetry must not fail the reply", () => {
  it("finalize swallows internal errors and returns null safely", () => {
    const session = startLiveTurnLatency({
      provisionalCohort: "simple_no_tool",
    });
    session.finalize({ outcome: "ok" });
    assert.equal(session.finalize({ outcome: "ok" }), null);
  });
});
