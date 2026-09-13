/**
 * Minutes-pricing unit tests.
 * Run: node --experimental-strip-types --test scripts/minutes-pricing.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clampPurchasableMinutes,
  minutesArePurchasable,
  planForMinutes,
  priceForMinutes,
} from "../lib/billing/minutes-pricing.ts";

describe("planForMinutes", () => {
  it("classifies free / pro / max / ultra / enterprise bands", () => {
    assert.equal(planForMinutes(0), "free");
    assert.equal(planForMinutes(10), "free");
    assert.equal(planForMinutes(11), "pro");
    assert.equal(planForMinutes(50), "pro");
    assert.equal(planForMinutes(80), "max");
    assert.equal(planForMinutes(150), "max");
    assert.equal(planForMinutes(200), "ultra");
    assert.equal(planForMinutes(500), "ultra");
    assert.equal(planForMinutes(501), "enterprise");
  });
});

describe("priceForMinutes", () => {
  it("is free through 10 minutes", () => {
    assert.equal(priceForMinutes(0), 0);
    assert.equal(priceForMinutes(10), 0);
  });

  it("hits legacy anchors", () => {
    assert.equal(priceForMinutes(50), 20);
    assert.equal(priceForMinutes(150), 50);
    assert.equal(priceForMinutes(500), 150);
  });

  it("interpolates between anchors", () => {
    const mid = priceForMinutes(30);
    assert.ok(mid > 0 && mid < 20);
  });
});

describe("minutesArePurchasable", () => {
  it("allows stepped self-serve minutes only", () => {
    assert.equal(minutesArePurchasable(10), true);
    assert.equal(minutesArePurchasable(80), true);
    assert.equal(minutesArePurchasable(500), true);
    assert.equal(minutesArePurchasable(15), false);
    assert.equal(minutesArePurchasable(510), false);
    assert.equal(minutesArePurchasable(-10), false);
  });
});

describe("clampPurchasableMinutes", () => {
  it("snaps to step and range", () => {
    assert.equal(clampPurchasableMinutes(14), 10);
    assert.equal(clampPurchasableMinutes(16), 20);
    assert.equal(clampPurchasableMinutes(999), 500);
  });
});
