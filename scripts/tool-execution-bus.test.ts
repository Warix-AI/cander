/**
 * Tool execution bus — unit tests.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  emitToolExecution,
  mapToolEventToProgressLabel,
  setTurnToolExecutionListener,
} from "../lib/ai/orchestrator/tool-execution-bus.ts";

describe("mapToolEventToProgressLabel", () => {
  it("maps web.open to reading page detail", () => {
    const mapped = mapToolEventToProgressLabel({
      type: "tool_start",
      name: "web.open",
    });
    assert.ok(mapped);
    assert.equal(mapped!.phase, "tool");
    assert.match(mapped!.detail, /reading page/i);
    assert.equal(mapped!.toolName, "web.open");
  });

  it("maps successful tool_end to follow_up reading", () => {
    const mapped = mapToolEventToProgressLabel({
      type: "tool_end",
      name: "web.search",
      ok: true,
      durationMs: 12,
    });
    assert.ok(mapped);
    assert.equal(mapped!.phase, "follow_up");
  });
});

describe("setTurnToolExecutionListener", () => {
  it("delivers events to the active turn listener", () => {
    const seen: string[] = [];
    setTurnToolExecutionListener((e) => {
      if (e.type === "tool_start") seen.push(e.name);
    });
    emitToolExecution({ type: "tool_start", name: "web.search" });
    setTurnToolExecutionListener(null);
    assert.deepEqual(seen, ["web.search"]);
  });
});
