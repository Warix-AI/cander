import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatMinutesDetail,
  formatUsedMinutes,
} from "../lib/usage/ai-minutes/format.ts";
import {
  mergeIntervalsDurationMs,
  msToMinutes,
} from "../lib/usage/ai-minutes/intervals.ts";
import {
  finishAIUsageExecution,
  startAIUsageExecution,
  withAIUsageMeter,
} from "../lib/usage/ai-minutes/meter.ts";
import {
  DEFAULT_AI_PLAN_MINUTE_CONFIGS,
  defaultAiPlanMinuteConfig,
} from "../lib/usage/ai-minutes/plan-minutes-config.ts";
import { resetAIUsageMemoryStore } from "../lib/usage/ai-minutes/store.ts";
import { planUsagePolicy } from "../lib/usage/plan-config.ts";

function normalizePlan(value: unknown): string {
  if (
    value === "pro" ||
    value === "max" ||
    value === "ultra" ||
    value === "enterprise"
  ) {
    return value;
  }
  return "free";
}
describe("AI active minutes — intervals", () => {
  it("merges overlapping parallel spans without double-counting", () => {
    const ms = mergeIntervalsDurationMs([
      { startMs: 0, endMs: 60_000 },
      { startMs: 30_000, endMs: 90_000 },
    ]);
    assert.equal(ms, 90_000);
    assert.equal(Number(msToMinutes(ms).toFixed(2)), 1.5);
  });

  it("sums sequential spans for chat+search+image+agent example", () => {
    const ms = mergeIntervalsDurationMs([
      { startMs: 0, endMs: 8_000 },
      { startMs: 10_000, endMs: 29_000 },
      { startMs: 40_000, endMs: 71_000 },
      { startMs: 80_000, endMs: 102_000 },
    ]);
    assert.equal(ms, 80_000);
    assert.equal(Number(msToMinutes(ms).toFixed(2)), 1.33);
  });

  it("ten six-second interactions ≈ one minute", () => {
    const intervals = Array.from({ length: 10 }, (_, i) => ({
      startMs: i * 10_000,
      endMs: i * 10_000 + 6_000,
    }));
    const ms = mergeIntervalsDurationMs(intervals);
    assert.equal(ms, 60_000);
    assert.equal(msToMinutes(ms), 1);
  });
});

describe("AI active minutes — display", () => {
  it("shows <1 for sub-minute aggregates", () => {
    assert.equal(formatUsedMinutes(0.4), "<1");
    assert.equal(
      formatMinutesDetail({ usedMinutes: 7.2, includedMinutes: 10 }),
      "7 / 10 minutes",
    );
  });
});

describe("AI active minutes — hierarchy", () => {
  it("root billable + child cost-only; nested does not bill minutes", async () => {
    resetAIUsageMemoryStore();
    const parent = await startAIUsageExecution({
      userId: "user-1",
      planId: "pro",
      source: "chat",
      executionId: "exec-parent",
    });
    assert.equal(parent.billableToUser, true);

    const child = await startAIUsageExecution({
      userId: "user-1",
      planId: "pro",
      source: "expert",
      executionId: "exec-child",
      parentExecutionId: parent.executionId,
    });
    assert.equal(child.billableToUser, false);

    await new Promise((r) => setTimeout(r, 20));
    const finishedChild = await finishAIUsageExecution({
      executionId: child.executionId,
      status: "completed",
      actualCostUsd: 0.02,
      refreshAggregate: false,
    });
    assert.equal(finishedChild?.actualCostUsd, 0.02);
    assert.ok((finishedChild?.activeDurationMs ?? 0) >= 15);

    const finishedParent = await finishAIUsageExecution({
      executionId: parent.executionId,
      status: "completed",
      refreshAggregate: false,
    });
    assert.equal(finishedParent?.billableToUser, true);
  });

  it("failed and cancelled executions still record duration", async () => {
    resetAIUsageMemoryStore();
    await startAIUsageExecution({
      userId: "u",
      planId: "free",
      source: "image",
      executionId: "fail-1",
    });
    await new Promise((r) => setTimeout(r, 15));
    const failed = await finishAIUsageExecution({
      executionId: "fail-1",
      status: "failed",
      refreshAggregate: false,
    });
    assert.ok((failed?.activeDurationMs ?? 0) >= 10);

    await startAIUsageExecution({
      userId: "u",
      planId: "free",
      source: "voice",
      executionId: "cancel-1",
    });
    await new Promise((r) => setTimeout(r, 15));
    const cancelled = await finishAIUsageExecution({
      executionId: "cancel-1",
      status: "cancelled",
      refreshAggregate: false,
    });
    assert.ok((cancelled?.activeDurationMs ?? 0) >= 10);
  });

  it("withAIUsageMeter always closes on throw (no orphan running)", async () => {
    resetAIUsageMemoryStore();
    await assert.rejects(async () => {
      await withAIUsageMeter(
        {
          userId: "user-2",
          planId: "free",
          source: "speculation",
          executionId: "exec-wrap",
        },
        async () => {
          throw new Error("boom");
        },
      );
    }, /boom/);
  });

  it("parallel billable roots merge overlapping wall-clock", () => {
    // Two independent roots overlapping 30s of a 60s window → 90s merged
    const merged = mergeIntervalsDurationMs([
      { startMs: 0, endMs: 60_000 },
      { startMs: 30_000, endMs: 90_000 },
    ]);
    assert.equal(merged, 90_000);
  });
});

describe("AI minutes plan configuration", () => {
  it("Free defaults to 10 minutes", () => {
    assert.equal(defaultAiPlanMinuteConfig("free").includedMinutes, 10);
    assert.equal(planUsagePolicy("free").includedMinutes, 10);
  });

  it("Pro range is 10–50 with default 50", () => {
    const cfg = DEFAULT_AI_PLAN_MINUTE_CONFIGS.pro;
    assert.equal(cfg.minimumMinutes, 10);
    assert.equal(cfg.maximumMinutes, 50);
    assert.equal(cfg.includedMinutes, 50);
    assert.equal(planUsagePolicy("pro").includedMinutes, 50);
  });

  it("Max range is 50–150 with default 150", () => {
    const cfg = DEFAULT_AI_PLAN_MINUTE_CONFIGS.max;
    assert.equal(cfg.minimumMinutes, 50);
    assert.equal(cfg.maximumMinutes, 150);
    assert.equal(cfg.includedMinutes, 150);
  });

  it("Ultra range is 200–500 with default 500", () => {
    const cfg = DEFAULT_AI_PLAN_MINUTE_CONFIGS.ultra;
    assert.equal(cfg.minimumMinutes, 200);
    assert.equal(cfg.maximumMinutes, 500);
    assert.equal(cfg.includedMinutes, 500);
  });

  it("Enterprise supports >500 with no hard maximum", () => {
    const cfg = DEFAULT_AI_PLAN_MINUTE_CONFIGS.enterprise;
    assert.equal(cfg.isEnterprise, true);
    assert.ok((cfg.minimumMinutes ?? 0) > 500);
    assert.equal(cfg.maximumMinutes, null);
    assert.ok(cfg.includedMinutes > 500);
  });

  it("normalizePlan accepts ultra and enterprise", () => {
    assert.equal(normalizePlan("ultra"), "ultra");
    assert.equal(normalizePlan("enterprise"), "enterprise");
    assert.equal(normalizePlan("unknown"), "free");
  });

  it("period snapshot fields exist independently of live defaults", () => {
    // Historical periods keep included_minutes on the period row; live config
    // can change without rewriting that snapshot (ensureAccountUsagePeriod).
    assert.equal(planUsagePolicy("pro").includedMinutes, 50);
    assert.notEqual(
      planUsagePolicy("pro").includedMinutes,
      planUsagePolicy("pro").usableBudgetMicros / 1_000_000,
    );
  });
});
