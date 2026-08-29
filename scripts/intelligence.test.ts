/**
 * Cander Intelligence — classifier, budgets, policy, flags.
 * Run: npm run test:intelligence
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  classifyAndRoute,
  classifyTaskType,
} from "../lib/ai/intelligence/classifier.ts";
import { buildContextPackage } from "../lib/ai/intelligence/context-budget.ts";
import {
  getIntelligenceFlags,
  setIntelligenceFlagsForTests,
} from "../lib/ai/intelligence/flags.ts";
import { assertTrustedPolicyAction } from "../lib/ai/intelligence/policy.ts";
import {
  clearRoutingTelemetry,
  getRoutingTelemetrySnapshot,
  recordRoutingDecision,
} from "../lib/ai/intelligence/telemetry.ts";

describe("intelligence classifier", () => {
  it("keeps casual chat conversational and on-device", () => {
    const d = classifyAndRoute({ content: "tell me a joke" });
    assert.equal(d.taskType, "conversational");
    assert.equal(d.target, "on_device");
    assert.equal(d.toolNames.length, 0);
  });

  it("routes local nav without cloud work", () => {
    const d = classifyAndRoute({ content: "go to the build space" });
    assert.equal(d.taskType, "local_action");
    assert.equal(d.target, "on_device");
    assert.ok(d.toolNames.includes("nav.open"));
    assert.ok(!d.toolNames.includes("create_work_task"));
  });

  it("routes implement/code to cander_cloud immediately (no PCC)", () => {
    setIntelligenceFlagsForTests({ pccEnabled: true });
    const d = classifyAndRoute({
      content: "implement auth and write tests for this app",
      pccAvailable: true,
    });
    assert.equal(d.taskType, "execution");
    assert.equal(d.target, "cander_cloud");
    assert.ok(d.toolNames.includes("create_work_task"));
    setIntelligenceFlagsForTests(null);
  });

  it("routes publish intent as release → cloud", () => {
    assert.equal(
      classifyTaskType({ content: "publish this project to production" }),
      "release",
    );
    const d = classifyAndRoute({
      content: "publish this project to production",
    });
    assert.equal(d.target, "cander_cloud");
  });

  it("does not use PCC when flag is off", () => {
    setIntelligenceFlagsForTests({ pccEnabled: false });
    const d = classifyAndRoute({
      content: "analyze the architecture trade-offs in a design doc",
      pccAvailable: true,
    });
    assert.equal(d.taskType, "reasoning_heavy");
    assert.notEqual(d.target, "pcc");
    setIntelligenceFlagsForTests(null);
  });

  it("respects forceLocal privacy override", () => {
    const d = classifyAndRoute({
      content: "implement a new API",
      forceLocal: true,
    });
    assert.equal(d.target, "on_device");
    assert.equal(d.reason, "user_force_local");
  });

  it("strips cloud_work tools when cloudWorkEnabled is false", () => {
    setIntelligenceFlagsForTests({ cloudWorkEnabled: false });
    const d = classifyAndRoute({
      content: "implement auth and write tests for this app",
    });
    assert.ok(!d.toolNames.includes("create_work_task"));
    setIntelligenceFlagsForTests(null);
  });
});

describe("context budgeter", () => {
  it("strips inventory on on-device conversational packages", () => {
    const pkg = buildContextPackage({
      route: "on_device",
      inventoryText: "huge inventory here",
      toolCatalog: "",
      allowTools: false,
      recentMessages: Array.from({ length: 20 }, (_, i) => ({
        role: "user",
        content: `m${i}`,
      })),
    });
    assert.equal(pkg.inventoryText, "");
    assert.equal(pkg.toolCatalog, "");
    assert.ok(pkg.messages.length <= 24);
  });

  it("allows larger PCC budgets when routed there", () => {
    const pkg = buildContextPackage({
      route: "pcc",
      inventoryText: "x".repeat(100),
      toolCatalog: "tools",
      allowTools: true,
    });
    assert.ok(pkg.inventoryText.length > 0);
    assert.ok(pkg.toolCatalog.length > 0);
  });
});

describe("untrusted content policy", () => {
  it("blocks side effects from untrusted sources", () => {
    const r = assertTrustedPolicyAction({
      action: "side_effect",
      source: "web",
    });
    assert.equal(r.ok, false);
  });

  it("allows user-authorized side effects", () => {
    const r = assertTrustedPolicyAction({
      action: "side_effect",
      source: "user",
    });
    assert.equal(r.ok, true);
  });
});

describe("flags and telemetry", () => {
  it("defaults PCC and sandbox off", () => {
    setIntelligenceFlagsForTests(null);
    const f = getIntelligenceFlags();
    assert.equal(f.pccEnabled, false);
    assert.equal(f.sandboxEnabled, false);
    assert.equal(f.cloudWorkEnabled, true);
  });

  it("records routing decisions client-side", () => {
    clearRoutingTelemetry();
    const d = classifyAndRoute({ content: "hello" });
    recordRoutingDecision(d, { threadId: "t1" });
    const snap = getRoutingTelemetrySnapshot();
    assert.equal(snap.length, 1);
    assert.equal(snap[0]?.taskType, "conversational");
    clearRoutingTelemetry();
  });
});
