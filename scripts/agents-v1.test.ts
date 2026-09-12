/**
 * Agents simplified model — schedule helpers + trigger parse.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildScheduleTrigger,
  coerceSchedulePreset,
  computeNextRunAt,
  cronFromPreset,
  scheduleIdempotencyKey,
} from "../lib/agents/schedule.ts";
import {
  errorMessageFromUnknown,
  parseAgentTrigger,
} from "../lib/agents/types.ts";

describe("schedule presets", () => {
  it("supports minute-level presets", () => {
    assert.equal(cronFromPreset("every_1_minute"), "* * * * *");
    assert.equal(cronFromPreset("every_5_minutes"), "*/5 * * * *");
    assert.equal(cronFromPreset("every_15_minutes"), "*/15 * * * *");
    assert.equal(cronFromPreset("every_30_minutes"), "*/30 * * * *");
    assert.equal(cronFromPreset("hourly", "09:15"), "15 * * * *");
    const trigger = buildScheduleTrigger({
      preset: "every_15_minutes",
      timezone: "America/Denver",
    });
    assert.equal(trigger.type, "schedule");
    assert.equal(trigger.preset, "every_15_minutes");
    const next = computeNextRunAt(trigger, new Date("2026-09-11T15:00:00Z"));
    assert.ok(next instanceof Date);
  });

  it("coerces legacy presets", () => {
    assert.equal(coerceSchedulePreset("weekday"), "daily");
    assert.equal(coerceSchedulePreset("every_few_hours"), "hourly");
    assert.equal(coerceSchedulePreset("every_5_minutes"), "every_5_minutes");
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

describe("trigger parse", () => {
  it("maps legacy gmail trigger to manual", () => {
    const t = parseAgentTrigger({
      type: "gmail_new_message",
      connectionId: "conn_1",
      filter: { fromContains: "boss@" },
    });
    assert.equal(t.type, "manual");
  });

  it("parses schedule triggers", () => {
    const t = parseAgentTrigger({
      type: "schedule",
      cron: "*/5 * * * *",
      timezone: "UTC",
      preset: "every_5_minutes",
    });
    assert.equal(t.type, "schedule");
    if (t.type === "schedule") {
      assert.equal(t.preset, "every_5_minutes");
    }
  });
});

describe("errorMessageFromUnknown", () => {
  it("reads plain object message fields", () => {
    assert.equal(
      errorMessageFromUnknown({ message: "openai timeout" }),
      "openai timeout",
    );
  });
});
