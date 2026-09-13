/**
 * Plan catalog unit tests.
 * Run: node --experimental-strip-types --test scripts/plan-catalog.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canonicalizePlan,
  includedActiveAiMinutesForPlan,
  PLAN_CATALOG,
} from "../lib/billing/plan-catalog.ts";
import { accountsPerAppLimit, hasOrganizationControls, hasSharedWorkspaces } from "../lib/plan-entitlements.ts";

describe("canonicalizePlan", () => {
  it("maps legacy keys to canonical plans", () => {
    assert.equal(canonicalizePlan("free"), "minimal");
    assert.equal(canonicalizePlan("pro"), "light");
    assert.equal(canonicalizePlan("max"), "moderate");
    assert.equal(canonicalizePlan("ultra"), "heavy");
    assert.equal(canonicalizePlan("enterprise"), "limitless");
  });

  it("passes through canonical keys", () => {
    assert.equal(canonicalizePlan("minimal"), "minimal");
    assert.equal(canonicalizePlan("light"), "light");
  });

  it("defaults unknown values to minimal", () => {
    assert.equal(canonicalizePlan("unknown"), "minimal");
  });
});

describe("included Active AI Minutes", () => {
  it("matches the fixed catalog", () => {
    assert.equal(includedActiveAiMinutesForPlan("minimal"), 20);
    assert.equal(includedActiveAiMinutesForPlan("light"), 30);
    assert.equal(includedActiveAiMinutesForPlan("moderate"), 100);
    assert.equal(includedActiveAiMinutesForPlan("heavy"), 250);
    assert.equal(includedActiveAiMinutesForPlan("limitless"), null);
  });

  it("exposes catalog prices", () => {
    assert.equal(PLAN_CATALOG.minimal.monthlyPriceUsd, 0);
    assert.equal(PLAN_CATALOG.light.monthlyPriceUsd, 15);
    assert.equal(PLAN_CATALOG.moderate.monthlyPriceUsd, 50);
    assert.equal(PLAN_CATALOG.heavy.monthlyPriceUsd, 125);
    assert.equal(PLAN_CATALOG.limitless.monthlyPriceUsd, null);
  });
});

describe("paid plan entitlements", () => {
  it("gives Light+ org and multi-account access", () => {
    assert.equal(hasOrganizationControls("light"), true);
    assert.equal(hasSharedWorkspaces("light"), true);
    assert.equal(hasOrganizationControls("minimal"), false);
    assert.equal(accountsPerAppLimit("minimal"), 1);
    assert.equal(accountsPerAppLimit("light"), Infinity);
  });
});
