/**
 * Onboarding plan resolution — platform must not force Minimal over paid accounts.
 * Run: node --experimental-strip-types --test scripts/onboarding-plan-resolution.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  requestedPlanForNativeFinish,
  resolveOnboardingFinishPlan,
} from "../lib/billing/resolve-onboarding-plan.ts";
import {
  accountsPerAppLimit,
  hasOrganizationControls,
  hasSharedWorkspaces,
} from "../lib/plan-entitlements.ts";
import { canonicalizePlan } from "../lib/billing/plan-catalog.ts";

describe("resolveOnboardingFinishPlan", () => {
  it("Case 1: new unpaid account defaults to Minimal", () => {
    assert.equal(
      resolveOnboardingFinishPlan({
        existingPlan: null,
        requestedPlan: "minimal",
      }),
      "minimal",
    );
    assert.equal(accountsPerAppLimit("minimal"), 1);
    assert.equal(hasOrganizationControls("minimal"), false);
    assert.equal(hasSharedWorkspaces("minimal"), false);
  });

  it("Case 2: existing Heavy is preserved even if native requests Minimal", () => {
    assert.equal(
      resolveOnboardingFinishPlan({
        existingPlan: "heavy",
        requestedPlan: "minimal",
      }),
      "heavy",
    );
    assert.equal(
      resolveOnboardingFinishPlan({
        existingPlan: "heavy",
        requestedPlan: requestedPlanForNativeFinish("heavy"),
      }),
      "heavy",
    );
    assert.equal(hasOrganizationControls("heavy"), true);
    assert.equal(accountsPerAppLimit("heavy"), Infinity);
  });

  it("Case 3: existing Light is preserved on native", () => {
    assert.equal(
      resolveOnboardingFinishPlan({
        existingPlan: "light",
        requestedPlan: requestedPlanForNativeFinish("light"),
      }),
      "light",
    );
    assert.equal(hasSharedWorkspaces("light"), true);
  });

  it("Case 4: existing Minimal stays Minimal", () => {
    assert.equal(
      resolveOnboardingFinishPlan({
        existingPlan: "minimal",
        requestedPlan: requestedPlanForNativeFinish("minimal"),
      }),
      "minimal",
    );
    assert.equal(accountsPerAppLimit("minimal"), 1);
  });

  it("Case 5: Minimal → Moderate upgrade request is applied", () => {
    assert.equal(
      resolveOnboardingFinishPlan({
        existingPlan: "minimal",
        requestedPlan: "moderate",
      }),
      "moderate",
    );
    assert.equal(hasOrganizationControls("moderate"), true);
  });

  it("Case 6: Limitless is never forced to Minimal", () => {
    assert.equal(
      resolveOnboardingFinishPlan({
        existingPlan: "limitless",
        requestedPlan: "minimal",
      }),
      "limitless",
    );
    assert.equal(
      resolveOnboardingFinishPlan({
        existingPlan: "enterprise",
        requestedPlan: requestedPlanForNativeFinish("enterprise"),
      }),
      "limitless",
    );
  });

  it("native finish only requests Minimal for unpaid accounts", () => {
    assert.equal(requestedPlanForNativeFinish(null), "minimal");
    assert.equal(requestedPlanForNativeFinish("minimal"), "minimal");
    assert.equal(requestedPlanForNativeFinish("free"), "minimal");
    assert.equal(requestedPlanForNativeFinish("heavy"), null);
    assert.equal(requestedPlanForNativeFinish("light"), null);
  });

  it("legacy ultra maps through preserve path", () => {
    assert.equal(canonicalizePlan("ultra"), "heavy");
    assert.equal(
      resolveOnboardingFinishPlan({
        existingPlan: "ultra",
        requestedPlan: "minimal",
      }),
      "heavy",
    );
  });
});
