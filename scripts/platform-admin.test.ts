/**
 * Platform admin auth, pricing preview, and snapshot non-mutation invariants.
 * Run: node --experimental-strip-types --test scripts/platform-admin.test.ts
 */
import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { previewPriceForMinutes } from "../lib/admin/pricing-types.ts";
import {
  ADMIN_SECTIONS,
  isAdminSection,
} from "../lib/admin/sections.ts";
import { matchAdminToolIntent } from "../lib/admin/tools.ts";
import { DEFAULT_AI_PLAN_MINUTE_CONFIGS } from "../lib/usage/ai-minutes/plan-minutes-config.ts";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

afterEach(() => {
  process.env = ORIGINAL_ENV;
});

describe("platform admin sections", () => {
  it("includes expected nav sections", () => {
    assert.ok(ADMIN_SECTIONS.includes("overview"));
    assert.ok(ADMIN_SECTIONS.includes("operations"));
    assert.equal(isAdminSection("plans"), true);
    assert.equal(isAdminSection("owners"), false);
  });
});

describe("admin chat tools", () => {
  it("matches listAccounts / openPlan / showUsage intents", () => {
    assert.equal(matchAdminToolIntent("list accounts acme")?.tool.name, "listAccounts");
    assert.equal(matchAdminToolIntent("open plans")?.tool.name, "openPlan");
    assert.equal(matchAdminToolIntent("show usage")?.tool.name, "showUsage");
    assert.equal(matchAdminToolIntent("hello"), null);
  });
});

describe("pricing preview", () => {
  it("returns base price for fixed plans", () => {
    const price = previewPriceForMinutes(
      {
        planId: "free",
        displayName: "Free",
        baseMonthlyPriceUsd: 0,
        includedMinutes: 10,
        minimumMinutes: 10,
        maximumMinutes: 10,
        minutesStep: 1,
        priceIncrementUsd: 1,
        pricingMode: "fixed",
        isPublic: true,
        isSelfServe: true,
        active: true,
        sortOrder: 10,
        metadata: {},
      },
      50,
    );
    assert.equal(price, 0);
  });

  it("adds increments for adjustable plans", () => {
    const price = previewPriceForMinutes(
      {
        planId: "pro",
        displayName: "Pro",
        baseMonthlyPriceUsd: 20,
        includedMinutes: 50,
        minimumMinutes: 10,
        maximumMinutes: 50,
        minutesStep: 10,
        priceIncrementUsd: 2,
        pricingMode: "adjustable",
        isPublic: true,
        isSelfServe: true,
        active: true,
        sortOrder: 20,
        metadata: {},
      },
      70,
    );
    assert.equal(price, 24);
  });
});

describe("plan minute defaults", () => {
  it("keeps free/pro/max/ultra/enterprise defaults", () => {
    assert.equal(DEFAULT_AI_PLAN_MINUTE_CONFIGS.free.includedMinutes, 10);
    assert.equal(DEFAULT_AI_PLAN_MINUTE_CONFIGS.pro.includedMinutes, 50);
    assert.equal(DEFAULT_AI_PLAN_MINUTE_CONFIGS.max.includedMinutes, 150);
    assert.equal(DEFAULT_AI_PLAN_MINUTE_CONFIGS.ultra.includedMinutes, 500);
    assert.equal(DEFAULT_AI_PLAN_MINUTE_CONFIGS.enterprise.maximumMinutes, null);
  });
});

describe("auth + API hardening (source)", () => {
  it("ai-minutes-plans route uses requirePlatformAdmin only", () => {
    const src = readFileSync(
      join(process.cwd(), "app/api/admin/ai-minutes-plans/route.ts"),
      "utf8",
    );
    assert.match(src, /requirePlatformAdmin/);
    assert.doesNotMatch(src, /org_members/);
    assert.doesNotMatch(src, /assertCanManagePlans/);
    assert.match(src, /writeAdminAudit/);
  });

  it("admin auth does not grant access via org Owner/Admin", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/admin/auth.ts"),
      "utf8",
    );
    assert.match(src, /is_platform_admin/);
    assert.match(src, /CANDER_PLATFORM_ADMIN_IDS/);
    assert.doesNotMatch(src, /org_members/);
  });

  it("admin shell maps nav left / chat center / workspace right", () => {
    const src = readFileSync(
      join(process.cwd(), "components/admin/AdminShell.tsx"),
      "utf8",
    );
    assert.match(src, /AdminNavPanel/);
    assert.match(src, /AdminChatColumn/);
    assert.match(src, /AdminWorkspace/);
    assert.match(src, /Sidebar \(admin links\)/);
  });

  it("does not ship service-role secrets in client admin helpers", () => {
    const client = readFileSync(
      join(process.cwd(), "lib/admin/client.ts"),
      "utf8",
    );
    assert.doesNotMatch(client, /SERVICE_ROLE/);
    assert.doesNotMatch(client, /STRIPE_SECRET/);
  });
});

describe("env bootstrap", () => {
  it("treats CANDER_PLATFORM_ADMIN_IDS as allowlist source of truth in auth module", () => {
    const src = readFileSync(join(process.cwd(), "lib/admin/auth.ts"), "utf8");
    assert.match(src, /CANDER_PLATFORM_ADMIN_IDS/);
    assert.match(src, /CANDER_USAGE_ADMIN_IDS/);
  });
});
