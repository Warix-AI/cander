import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  TurnTraceRecorder,
  buildRetrievalChainView,
  finalizeTurnTrace,
  getTurnTrace,
  listTurnTraceSummaries,
  redactTraceString,
  redactTraceValue,
  resetTurnTraceForTests,
  resetTurnTraceStoreForTests,
  startTurnTrace,
} from "../lib/ai/orchestrator/turn-trace/index.ts";

describe("turn-trace", () => {
  it("assigns traceId and records retrieval chain", () => {
    resetTurnTraceForTests();
    resetTurnTraceStoreForTests();
    process.env.NEXT_PUBLIC_TURN_TRACE = "1";

    const rec = startTurnTrace({
      threadId: "t-1",
      userInput: "When does BYU fall semester start this year?",
    });
    assert.ok(rec);
    const traceId = rec!.traceId;
    assert.match(traceId, /-/);

    rec!.recordTemporalGrounding({
      nowIso: "2026-08-31T06:24:00.000Z",
      timezone: "America/Denver",
      year: 2026,
      month: 8,
      day: 31,
      freshnessRequired: true,
      resolvedPhrases: [{ phrase: "this year", resolved: "2026" }],
      anchoredQuerySuffix: "2026",
    });

    rec!.recordToolRequest({
      taskId: "retrieve_primary",
      tool: "web.search",
      arguments: { query: "BYU fall semester start date 2026" },
    });
    rec!.recordToolResponseRaw({
      taskId: "retrieve_primary",
      tool: "web.search",
      ok: true,
      durationMs: 1200,
      rawData: {
        results: [{ title: "Academic Calendar", url: "https://byu.edu/calendar" }],
      },
    });
    rec!.recordEvidenceAccept({
      taskId: "retrieve_primary",
      evidence: {
        id: "ev_1",
        title: "BYU Fall 2026",
        content: "Classes begin August 31, 2026.",
        url: "https://byu.edu/calendar",
      },
    });
    rec!.recordModelPrompt({
      round: 0,
      prompt: "Answer using evidence",
      instructions: "Be concise",
    });
    rec!.recordModelOutput({
      round: 0,
      text: "Fall 2026 at BYU starts on Monday, September 13.",
    });
    rec!.recordFinalResponse({
      content: "Fall 2026 at BYU starts on Monday, September 13.",
      finalSource: "fm_synthesis",
    });

    const trace = finalizeTurnTrace()!;
    assert.equal(trace.traceId, traceId);
    assert.ok(trace.retrievalChain.length >= 5);
    assert.equal(getTurnTrace(traceId)?.finalResponse?.includes("September 13"), true);

    const view = buildRetrievalChainView(trace);
    assert.ok(view.links.some((l) => l.step === "exa_query"));
    assert.ok(view.links.some((l) => l.step === "model_output"));
    assert.ok(view.divergenceHints.length >= 0);

    assert.equal(listTurnTraceSummaries()[0]?.traceId, traceId);
  });

  it("redacts bearer tokens and secrets", () => {
    const raw = redactTraceString("Authorization: Bearer sk_live_abcdef1234567890");
    assert.match(raw, /REDACTED/);
    assert.doesNotMatch(raw, /sk_live/);

    const obj = redactTraceValue({
      api_key: "secret123",
      query: "hello",
      nested: { token: "abc" },
    }) as Record<string, unknown>;
    assert.equal(obj.api_key, "[REDACTED]");
    assert.equal((obj.nested as Record<string, unknown>).token, "[REDACTED]");
    assert.equal(obj.query, "hello");
  });

  it("TurnTraceRecorder works standalone", () => {
    resetTurnTraceStoreForTests();
    const rec = new TurnTraceRecorder({ userInput: "hi" });
    rec.recordRequestLedger({
      rawInput: "hi",
      spans: [],
      asks: [],
      constraints: [],
      context: [],
      urls: [],
      explicitApps: [],
      askExtractorTriggers: [],
    });
    const trace = rec.finalize();
    assert.equal(trace.userInput, "hi");
    assert.ok(trace.events.length >= 2);
  });
});
