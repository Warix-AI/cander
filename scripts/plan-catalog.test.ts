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
    assert.equal(canonicalizePlan("moderate"), "moderate");
    assert.equal(canonicalizePlan("heavy"), "heavy");
    assert.equal(canonicalizePlan("limitless"), "limitless");
  });

  it("defaults unknown values to minimal", () => {
    assert.equal(canonicalizePlan("unknown"), "minimal");
    assert.equal(canonicalizePlan(null), "minimal");
  });
});

describe("included Active AI Minutes", () => {
  it("matches the fixed catalog", () => {
    assert.equal(includedActiveAiMinutesForPlan("minimal"), 25);
    assert.equal(includedActiveAiMinutesForPlan("light"), 100);
    assert.equal(includedActiveAiMinutesForPlan("moderate"), 250);
    assert.equal(includedActiveAiMinutesForPlan("heavy"), 500);
    assert.equal(includedActiveAiMinutesForPlan("limitless"), null);
  });

  it("exposes catalog prices", () => {
    assert.equal(PLAN_CATALOG.minimal.monthlyPriceUsd, 0);
    assert.equal(PLAN_CATALOG.light.monthlyPriceUsd, 30);
    assert.equal(PLAN_CATALOG.moderate.monthlyPriceUsd, 75);
    assert.equal(PLAN_CATALOG.heavy.monthlyPriceUsd, 150);
    assert.equal(PLAN_CATALOG.limitless.monthlyPriceUsd, null);
  });
});
