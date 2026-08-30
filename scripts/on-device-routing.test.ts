/**
 * On-device routing for Auto mode (Mac/iOS Foundation Models).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { preferOnDeviceForTurnContent } from "../lib/ai/runtime/on-device-routing.ts";

describe("preferOnDeviceForTurnContent", () => {
  it("uses FM for conversational chat when available", () => {
    assert.equal(
      preferOnDeviceForTurnContent({
        content: "explain recursion simply",
        fmAvailable: true,
      }),
      true,
    );
  });

  it("skips FM when unavailable", () => {
    assert.equal(
      preferOnDeviceForTurnContent({
        content: "hello",
        fmAvailable: false,
      }),
      false,
    );
  });

  it("routes live web questions to cloud orchestrator", () => {
    assert.equal(
      preferOnDeviceForTurnContent({
        content: "What's the weather today in Austin?",
        fmAvailable: true,
      }),
      false,
    );
  });

  it("routes latest news to cloud orchestrator", () => {
    assert.equal(
      preferOnDeviceForTurnContent({
        content: "What's the latest news today?",
        fmAvailable: true,
      }),
      false,
    );
  });

  it("routes tell-me-about with live-info cues to cloud orchestrator", () => {
    assert.equal(
      preferOnDeviceForTurnContent({
        content: "tell me about the latest OpenAI announcements",
        fmAvailable: true,
      }),
      false,
    );
  });

  it("routes project creation to FM (local action)", () => {
    assert.equal(
      preferOnDeviceForTurnContent({
        content: "create a new project called Launch",
        fmAvailable: true,
      }),
      true,
    );
  });
});

describe("resolveAllowedToolsForTurn URL fallback", () => {
  it("unlocks web tools for explicit URL requests (legacy path safety net)", async () => {
    const { resolveAllowedToolsForTurn } = await import(
      "../lib/ai/tools/domains.ts"
    );
    const gated = resolveAllowedToolsForTurn({
      content: "view https://canderhq.com and tell me about it",
    });
    assert.ok(gated.domains.includes("web"));
    assert.ok(gated.toolNames.includes("web.search") || gated.toolNames.includes("web.open"));
  });
});
