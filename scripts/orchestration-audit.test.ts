import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { scanRequest, splitRequestSpans } from "../lib/ai/orchestrator/request-scanner.ts";
import {
  emptyTurnAudit,
  finalizeTurnAudit,
  getTurnAudit,
  recordAuditToolCall,
  recordTurnCompile,
  resetTurnAudit,
} from "../lib/ai/orchestrator/turn-audit.ts";

describe("request scanner", () => {
  it("splits multi-clause litmus prompt into spans", () => {
    const prompt =
      "Check whether John emailed me the contract, compare it to the contract in this workspace, tell me if anything important changed.";
    const spans = splitRequestSpans(prompt);
    assert.ok(spans.length >= 2);
    const ledger = scanRequest(prompt);
    assert.ok(ledger.asks.length >= 2);
  });

  it("detects constraints separately from asks", () => {
    const ledger = scanRequest(
      "Schedule a call tomorrow but nothing before noon and don't touch mobile.",
    );
    assert.ok(ledger.asks.length >= 1);
    assert.ok(ledger.constraints.length >= 1);
    assert.ok(
      ledger.constraints.some((c) => /before noon|don't touch/i.test(c.text)),
    );
  });

  it("flags implicit-ask shape for AskExtractor escalation", () => {
    const ledger = scanRequest(
      "I'm trying to work out whether Sarah's proposal actually changed and whether it's worth putting time on the calendar.",
    );
    assert.ok(ledger.askExtractorTriggers.includes("implicit_ask_shape"));
  });

  it("extracts URLs and app mentions", () => {
    const ledger = scanRequest(
      "Check my Gmail for the invoice and open https://example.com/receipt",
    );
    assert.equal(ledger.urls.length, 1);
    assert.ok(ledger.explicitApps.includes("gmail"));
  });
});

describe("turn audit", () => {
  it("records request ledger and compile metadata", () => {
    resetTurnAudit({
      threadId: "t1",
      userMessage: "How many calories in a Big Mac?",
    });
    recordTurnCompile({
      intent: "lookup",
      relation: "continuation",
      webPlan: {
        mode: "fast",
        output: "text",
        query: "Big Mac calories",
        resultCount: 5,
        freshness: false,
        contentNeeded: "highlights",
        carrySubject: false,
        exaMode: "fast",
        escalationChain: ["fast", "auto"],
        requestedFields: [],
        systemPrompt: "",
      },
    });
    recordAuditToolCall({
      name: "web.search",
      ok: true,
      durationMs: 120,
      reason: "subtask:taco_calories",
      subtaskId: "taco_calories",
    });
    finalizeTurnAudit({ finalSource: "fm_synthesis", answerChars: 42 });
    const audit = getTurnAudit();
    assert.ok(audit);
    assert.equal(audit!.request.asks.length, 1);
    assert.equal(audit!.toolCalls.length, 1);
    assert.equal(audit!.finalSource, "fm_synthesis");
    assert.equal(audit!.answerChars, 42);
  });

  it("emptyTurnAudit has safe defaults", () => {
    const audit = emptyTurnAudit();
    assert.ok(Array.isArray(audit.toolCalls));
    assert.ok(Array.isArray(audit.evidence));
    assert.equal(audit.request.rawInput, "");
  });
});
