/**
 * Local FM turn orchestrator helpers — deterministic triggers + grounding.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  initialDeterministicToolCalls,
  requiresExternalEvidence,
} from "../lib/ai/orchestrator/deterministic-triggers.ts";
import {
  failClosedMessage,
  validateLocalGrounding,
} from "../lib/ai/orchestrator/grounding-validator.ts";
import { evidenceFromWebOpen } from "../lib/ai/orchestrator/evidence.ts";

describe("requiresExternalEvidence", () => {
  it("flags explicit URLs", () => {
    assert.equal(
      requiresExternalEvidence("view https://canderhq.com and tell me about it"),
      true,
    );
  });

  it("flags live weather questions", () => {
    assert.equal(
      requiresExternalEvidence("What's the weather in Austin today?"),
      true,
    );
  });

  it("allows pure conversation", () => {
    assert.equal(requiresExternalEvidence("explain recursion simply"), false);
  });
});

describe("initialDeterministicToolCalls", () => {
  it("queues web.open for explicit URL requests", () => {
    const calls = initialDeterministicToolCalls(
      "view https://canderhq.com and tell me about it",
    );
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.name, "web.open");
    assert.match(String(calls[0]!.arguments.url), /^https:\/\/canderhq\.com\/?$/);
    assert.equal(calls[0]!.reason, "explicit_url_in_request");
  });

  it("returns empty for conversational turns", () => {
    assert.deepEqual(initialDeterministicToolCalls("hello there"), []);
  });
});

describe("validateLocalGrounding", () => {
  it("fail-closes when external evidence was required but missing", () => {
    const v = validateLocalGrounding({
      answer: "Cander HQ is a great product company.",
      userRequest: "view https://canderhq.com and tell me about it",
      evidence: [],
      retrievalAttempted: true,
    });
    assert.equal(v.valid, false);
    assert.equal(v.recommendedAction, "fail_closed");
    assert.ok(v.issues.includes("UNRESOLVED_EXTERNAL_FACT"));
  });

  it("passes when page evidence exists", () => {
    const page = evidenceFromWebOpen({
      ok: true,
      url: "https://canderhq.com",
      title: "Cander HQ",
      text: "Cander HQ builds private AI workspace software.",
    });
    const v = validateLocalGrounding({
      answer: "Cander HQ builds private AI workspace software.",
      userRequest: "view https://canderhq.com and tell me about it",
      evidence: [page],
      retrievalAttempted: true,
    });
    assert.equal(v.valid, true);
    assert.equal(v.recommendedAction, "show");
  });

  it("fail-closed message is user-safe", () => {
    const msg = failClosedMessage(["UNRESOLVED_EXTERNAL_FACT"]);
    assert.match(msg, /couldn't read the active page|retrieve live information/i);
    assert.doesNotMatch(msg, /UNRESOLVED/);
  });
});
