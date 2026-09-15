import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildScheduleTrigger,
  computeNextRunAt,
  computeScheduleRetryAt,
  getZonedCronParts,
} from "../lib/agents/schedule.ts";

describe("Expert schedule timezone", () => {
  it("evaluates daily cron in America/Denver vs UTC", () => {
    // 2026-03-15 16:30 UTC = 10:30 America/Denver (MDT, UTC-6)
    const from = new Date("2026-03-15T16:30:00.000Z");
    const trigger = buildScheduleTrigger({
      preset: "daily",
      time: "09:00",
      timezone: "America/Denver",
    });
    const next = computeNextRunAt(trigger, from);
    assert.ok(next);
    const parts = getZonedCronParts(next!, "America/Denver");
    assert.equal(parts.hour, 9);
    assert.equal(parts.minute, 0);
  });

  it("computes a short deferred retry", () => {
    const from = new Date("2026-03-15T12:00:00.000Z");
    const retry = computeScheduleRetryAt(from);
    assert.equal(retry.getTime() - from.getTime(), 2 * 60_000);
  });
});
