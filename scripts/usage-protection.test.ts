/**
 * Usage protection, rate limits, cost safeguards, response-format validation.
 * Run: npm run test:usage
 */
import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";

import {
  guardUsage,
  reconcileUsage,
  buildUsageStatusSnapshot,
  setDefaultUsageStore,
} from "../lib/usage/enforce.ts";
import {
  featureLimitFor,
  planUsagePolicy,
} from "../lib/usage/plan-config.ts";
import {
  isCodingAgentFeatureEnabled,
  resolveModelRoute,
} from "../lib/usage/model-routing.ts";
import {
  MemoryUsageStore,
  setUsageStoreForTests,
} from "../lib/usage/store/memory-store.ts";
import {
  validateRichResponse,
  richResponseToMarkdown,
} from "../lib/usage/response-format/schema-v2.ts";
import { richBlocksToChatBlocks } from "../lib/usage/response-format/to-chat-blocks.ts";
import {
  isFeatureKillSwitchActive,
  isUsageEnforcementEnabled,
} from "../lib/usage/kill-switches.ts";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV, USAGE_ENFORCEMENT_ENABLED: "true" };
  const store = new MemoryUsageStore();
  setUsageStoreForTests(store);
  setDefaultUsageStore(store);
});

afterEach(() => {
  process.env = ORIGINAL_ENV;
  setUsageStoreForTests(null);
  setDefaultUsageStore(null);
});

describe("plan configuration", () => {
  it("keeps free tighter than pro/max", () => {
    const free = featureLimitFor("free", "ai_chat");
    const pro = featureLimitFor("pro", "ai_chat");
    assert.ok(free.monthlyUnits != null);
    assert.equal(pro.monthlyUnits, null);
    assert.ok(
      planUsagePolicy("pro").workspaceMonthlyCostCeilingMicros >
        planUsagePolicy("free").workspaceMonthlyCostCeilingMicros,
    );
  });

  it("disables coding agent by default on all plans", () => {
    delete process.env.CODING_AGENT_ENABLED;
    assert.equal(isCodingAgentFeatureEnabled(), false);
    assert.equal(resolveModelRoute("coding_agent").enabled, false);
  });
});

describe("usage guard", () => {
  it("allows normal pro chat requests", async () => {
    const store = new MemoryUsageStore();
    const result = await guardUsage(
      {
        feature: "ai_chat",
        workspaceId: "ws-a",
        profileId: "user-a",
        idempotencyKey: "k1",
        estimatedUnits: 1,
        unitKind: "requests",
      },
      { plan: "pro", store },
    );
    assert.equal(result.ok, true);
  });

  it("blocks disabled free knowledge search", async () => {
    const store = new MemoryUsageStore();
    const result = await guardUsage(
      {
        feature: "knowledge_search",
        workspaceId: "ws-a",
        profileId: "user-a",
        idempotencyKey: "k2",
        estimatedUnits: 1,
        unitKind: "requests",
      },
      { plan: "free", store },
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "feature_disabled");
  });

  it("is idempotent for duplicate idempotency keys", async () => {
    const store = new MemoryUsageStore();
    const input = {
      feature: "ai_chat" as const,
      workspaceId: "ws-a",
      profileId: "user-a",
      idempotencyKey: "same-key",
      estimatedUnits: 1,
      unitKind: "requests" as const,
    };
    const first = await guardUsage(input, { plan: "pro", store });
    const second = await guardUsage(input, { plan: "pro", store });
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    if (first.ok && second.ok) {
      assert.equal(first.reservationId, second.reservationId);
    }
  });

  it("rate limits when minute window is exceeded", async () => {
    const store = new MemoryUsageStore();
    const limit = featureLimitFor("free", "ai_chat").rateLimits.perMinute ?? 1;
    for (let i = 0; i < limit; i++) {
      const ok = await guardUsage(
        {
          feature: "ai_chat",
          workspaceId: "ws-a",
          profileId: "user-a",
          idempotencyKey: `minute-${i}`,
          estimatedUnits: 1,
          unitKind: "requests",
        },
        { plan: "free", store },
      );
      assert.equal(ok.ok, true);
      if (ok.ok) {
        await reconcileUsage(
          { reservationId: ok.reservationId, status: "completed" },
          store,
        );
      }
    }
    const blocked = await guardUsage(
      {
        feature: "ai_chat",
        workspaceId: "ws-a",
        profileId: "user-a",
        idempotencyKey: "minute-block",
        estimatedUnits: 1,
        unitKind: "requests",
      },
      { plan: "free", store },
    );
    assert.equal(blocked.ok, false);
    if (!blocked.ok) assert.equal(blocked.code, "rate_limited");
  });

  it("blocks concurrent expensive jobs beyond limit", async () => {
    const store = new MemoryUsageStore();
    const limit = featureLimitFor("free", "image_generation").concurrentJobs;
    for (let i = 0; i < limit; i++) {
      await store.reserve({
        idempotencyKey: `img-${i}`,
        workspaceId: "ws-a",
        profileId: "user-a",
        feature: "image_generation",
        units: 1,
        unitKind: "requests",
        estimatedCostMicros: 1000,
      });
    }
    const blocked = await guardUsage(
      {
        feature: "image_generation",
        workspaceId: "ws-a",
        profileId: "user-a",
        idempotencyKey: "img-block",
        estimatedUnits: 1,
        unitKind: "requests",
      },
      { plan: "free", store },
    );
    assert.equal(blocked.ok, false);
    if (!blocked.ok) assert.equal(blocked.code, "concurrency_limited");
  });

  it("reconciles failed reservations without keeping reserved status", async () => {
    const store = new MemoryUsageStore();
    const allowed = await guardUsage(
      {
        feature: "ai_chat",
        workspaceId: "ws-a",
        profileId: "user-a",
        idempotencyKey: "reconcile",
        estimatedUnits: 1,
        unitKind: "requests",
      },
      { plan: "pro", store },
    );
    assert.equal(allowed.ok, true);
    if (!allowed.ok) return;
    const updated = await reconcileUsage(
      { reservationId: allowed.reservationId, status: "released" },
      store,
    );
    assert.equal(updated?.status, "released");
    const active = await store.countActiveReservations({
      workspaceId: "ws-a",
      feature: "ai_chat",
    });
    assert.equal(active, 0);
  });

  it("respects kill switches", async () => {
    process.env.USAGE_KILL_SWITCH_AI_CHAT = "1";
    const store = new MemoryUsageStore();
    assert.equal(isFeatureKillSwitchActive("ai_chat"), true);
    const blocked = await guardUsage(
      {
        feature: "ai_chat",
        workspaceId: "ws-a",
        profileId: "user-a",
        idempotencyKey: "kill",
        estimatedUnits: 1,
        unitKind: "requests",
      },
      { plan: "pro", store },
    );
    assert.equal(blocked.ok, false);
    if (!blocked.ok) assert.equal(blocked.code, "kill_switch");
  });

  it("can bypass enforcement when disabled for emergencies", async () => {
    process.env.USAGE_ENFORCEMENT_ENABLED = "false";
    assert.equal(isUsageEnforcementEnabled(), false);
    const store = new MemoryUsageStore();
    const result = await guardUsage(
      {
        feature: "ai_chat",
        workspaceId: "ws-a",
        profileId: "user-a",
        idempotencyKey: "bypass",
        estimatedUnits: 1,
        unitKind: "requests",
      },
      { plan: "free", store },
    );
    assert.equal(result.ok, true);
  });
});

describe("workspace isolation hooks", () => {
  it("tracks usage separately per workspace", async () => {
    const store = new MemoryUsageStore();
    await guardUsage(
      {
        feature: "ai_chat",
        workspaceId: "ws-a",
        profileId: "user-a",
        idempotencyKey: "a1",
        estimatedUnits: 1,
        unitKind: "requests",
      },
      { plan: "pro", store },
    );
    await guardUsage(
      {
        feature: "ai_chat",
        workspaceId: "ws-b",
        profileId: "user-a",
        idempotencyKey: "b1",
        estimatedUnits: 1,
        unitKind: "requests",
      },
      { plan: "pro", store },
    );
    const windowStart = new Date(0).toISOString();
    const aCost = await store.sumWorkspaceCost({
      workspaceId: "ws-a",
      windowKind: "day",
      windowStart,
    });
    const bCost = await store.sumWorkspaceCost({
      workspaceId: "ws-b",
      windowKind: "day",
      windowStart,
    });
    assert.ok(aCost > 0);
    assert.ok(bCost > 0);
  });
});

describe("response format v2", () => {
  it("validates allowlisted rich blocks", () => {
    const validated = validateRichResponse({
      version: 2,
      blocks: [
        { type: "heading", level: 2, text: "Findings" },
        {
          type: "comparison_card",
          columns: ["Plan", "Price"],
          rows: [{ label: "Pro", values: ["$20"] }],
        },
      ],
    });
    assert.equal(validated.ok, true);
  });

  it("falls back safely for invalid payloads", () => {
    const validated = validateRichResponse({
      version: 2,
      blocks: [{ type: "script", html: "<script>" }],
      fallbackMarkdown: "Safe fallback",
    });
    assert.equal(validated.ok, false);
    if (!validated.ok) {
      assert.match(validated.fallbackMarkdown, /Safe fallback/);
    }
  });

  it("maps rich blocks to chat blocks", () => {
    const validated = validateRichResponse({
      version: 2,
      blocks: [
        { type: "markdown", markdown: "Hello" },
        {
          type: "approval",
          title: "Deploy",
          body: "Deploy to production?",
          actionId: "deploy",
          actionLabel: "Deploy now",
        },
      ],
    });
    assert.equal(validated.ok, true);
    if (!validated.ok) return;
    const chatBlocks = richBlocksToChatBlocks(validated.response);
    assert.ok(chatBlocks.some((block) => block.type === "text"));
    assert.ok(chatBlocks.some((block) => block.type === "suggestions"));
    const markdown = richResponseToMarkdown(validated.response);
    assert.match(markdown, /Hello/);
  });

  it("maps answer-shape structured blocks", () => {
    const validated = validateRichResponse({
      version: 2,
      blocks: [
        {
          type: "process",
          title: "Ship",
          steps: [
            { id: "s1", label: "Build", description: "Compile" },
            { id: "s2", label: "Deploy" },
          ],
        },
        {
          type: "ranking",
          items: [
            { rank: 1, label: "A", reason: "Fast" },
            { rank: 2, label: "B" },
          ],
        },
        {
          type: "faq",
          items: [{ question: "Why?", answer: "Because." }],
        },
      ],
    });
    assert.equal(validated.ok, true);
    if (!validated.ok) return;
    const chatBlocks = richBlocksToChatBlocks(validated.response);
    assert.ok(chatBlocks.some((block) => block.type === "process"));
    assert.ok(chatBlocks.some((block) => block.type === "ranking"));
    assert.ok(chatBlocks.some((block) => block.type === "faq"));
    const markdown = richResponseToMarkdown(validated.response);
    assert.match(markdown, /Build/);
    assert.match(markdown, /Why\?/);
  });
});

describe("usage status snapshot", () => {
  it("returns plain-language statuses", async () => {
    const store = new MemoryUsageStore();
    const snapshot = await buildUsageStatusSnapshot({
      plan: "pro",
      workspaceId: "ws-a",
      profileId: "user-a",
      store,
    });
    assert.equal(snapshot.plan, "pro");
    assert.ok(snapshot.features.some((feature) => feature.label === "AI chat"));
  });
});
