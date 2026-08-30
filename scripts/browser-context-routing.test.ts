import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  prefersViewportCapture,
  refersToActiveBrowserSurface,
  refersToPageSelection,
} from "../lib/browser-context/routing.ts";
import { initialDeterministicToolCalls } from "../lib/ai/orchestrator/deterministic-triggers.ts";
import { resolveAllowedToolsForTurn } from "../lib/ai/tools/domains.ts";

describe("browser-context routing", () => {
  it("detects right-panel / screen references", () => {
    assert.equal(
      refersToActiveBrowserSurface("Can you see what is on the right?"),
      true,
    );
    assert.equal(
      refersToActiveBrowserSurface("What is this page about?"),
      true,
    );
    assert.equal(refersToActiveBrowserSurface("hello there"), false);
  });

  it("prefers viewport capture for visual questions", () => {
    assert.equal(
      prefersViewportCapture("Why does this button look wrong?"),
      true,
    );
    assert.equal(prefersViewportCapture("Summarize the website on the right."), false);
  });

  it("queues get_context for screen questions", () => {
    const calls = initialDeterministicToolCalls(
      "Can you see what is on the right?",
    );
    assert.equal(calls[0]?.name, "browser.current.get_context");
  });

  it("queues capture for layout questions", () => {
    const calls = initialDeterministicToolCalls(
      "Why does this button look wrong on the page?",
    );
    assert.ok(
      calls.some((c) => c.name === "browser.current.capture_viewport"),
    );
  });

  it("unlocks browser domain tools", () => {
    const { toolNames } = resolveAllowedToolsForTurn({
      content: "Summarize the website on the right.",
    });
    assert.ok(toolNames.includes("browser.current.get_context"));
  });

  it("detects selection references", () => {
    assert.equal(
      refersToPageSelection("What does the selected text mean?"),
      true,
    );
  });
});
