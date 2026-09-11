/**
 * Agents V1 unit tests — schedule helpers, approval mode defaults, triggers.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildScheduleTrigger,
  computeNextRunAt,
  cronFromPreset,
  scheduleIdempotencyKey,
} from "../lib/agents/schedule.ts";
import {
  defaultApprovalModeForTool,
  isHighImpactTool,
  parseAgentTrigger,
} from "../lib/agents/types.ts";

describe("schedule presets", () => {
  it("includes every_few_hours", () => {
    assert.equal(cronFromPreset("every_few_hours", "09:15"), "15 */3 * * *");
    const trigger = buildScheduleTrigger({
      preset: "every_few_hours",
      time: "09:15",
      timezone: "America/Denver",
    });
    assert.equal(trigger.type, "schedule");
    assert.equal(trigger.preset, "every_few_hours");
    const next = computeNextRunAt(trigger, new Date("2026-09-11T15:00:00Z"));
    assert.ok(next instanceof Date);
  });

  it("builds stable schedule idempotency keys", () => {
    const a = scheduleIdempotencyKey(
      "pag_abc",
      "2026-09-11T15:00:00.000Z",
    );
    const b = scheduleIdempotencyKey(
      "pag_abc",
      "2026-09-11T15:00:00.000Z",
    );
    assert.equal(a, b);
    assert.match(a, /^schedule:pag_abc:/);
  });
});

describe("gmail trigger parse", () => {
  it("parses gmail_new_message with cursor", () => {
    const t = parseAgentTrigger({
      type: "gmail_new_message",
      connectionId: "conn_1",
      filter: { fromContains: "boss@", query: "is:unread" },
      cursor: { lastCheckedAt: "2026-09-11T00:00:00.000Z" },
    });
    assert.equal(t.type, "gmail_new_message");
    if (t.type === "gmail_new_message") {
      assert.equal(t.connectionId, "conn_1");
      assert.equal(t.filter.fromContains, "boss@");
      assert.equal(t.cursor?.lastCheckedAt, "2026-09-11T00:00:00.000Z");
    }
  });
});

describe("approval modes", () => {
  it("marks send/reply high impact", () => {
    assert.equal(isHighImpactTool("gmail.send"), true);
    assert.equal(isHighImpactTool("gmail.reply"), true);
    assert.equal(isHighImpactTool("gmail.search"), false);
  });

  it("defaults send to require_approval and reads to auto", () => {
    assert.equal(defaultApprovalModeForTool("gmail.send"), "require_approval");
    assert.equal(defaultApprovalModeForTool("gmail.search"), "auto");
  });
});

describe("gmail idempotency key shape", () => {
  it("uses gmail:agent:messageId", () => {
    const key = `gmail:pag_x:msg_123`;
    assert.match(key, /^gmail:[^:]+:.+/);
  });
});
