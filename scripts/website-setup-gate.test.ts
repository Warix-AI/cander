/**
 * Guided website setup completion gating.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  emptyWebsiteSetupBrief,
  isWebsiteSetupComplete,
  needsWebsiteGuidedSetup,
} from "../lib/ai/build/website-setup-brief.ts";

const FULL_ANSWERS = {
  business_goal: "Sell hiking kits",
  audience_cta: "Outdoor buyers — Shop now",
  site_depth: "landing",
  visual_style: "modern",
  brand_colors: "green and cream",
  layout_shape: ["hero", "features"],
  copy_tone: "friendly",
  sections_features: ["hero", "pricing", "contact"],
  confirm_build: true,
};

describe("needsWebsiteGuidedSetup", () => {
  it("requires setup when brief is missing or empty", () => {
    assert.equal(needsWebsiteGuidedSetup(null), true);
    assert.equal(needsWebsiteGuidedSetup(undefined), true);
    assert.equal(needsWebsiteGuidedSetup(emptyWebsiteSetupBrief()), true);
  });

  it("requires setup while status is setup and answers are incomplete", () => {
    const brief = emptyWebsiteSetupBrief({
      answers: { business_goal: "Only one answer" },
      completedSteps: 1,
    });
    assert.equal(isWebsiteSetupComplete(brief), false);
    assert.equal(needsWebsiteGuidedSetup(brief), true);
  });

  it("does not require setup after confirm even if status still says setup", () => {
    const brief = emptyWebsiteSetupBrief({
      status: "setup",
      answers: FULL_ANSWERS,
      completedSteps: 8,
      confirmedAt: "2026-01-01T00:00:00.000Z",
    });
    assert.equal(isWebsiteSetupComplete(brief), true);
    assert.equal(needsWebsiteGuidedSetup(brief), false);
  });

  it("does not require setup once status leaves setup (building/ready/failed)", () => {
    for (const status of ["building", "ready", "failed"] as const) {
      const brief = emptyWebsiteSetupBrief({
        status,
        answers: { business_goal: "partial" },
        completedSteps: 1,
      });
      assert.equal(
        needsWebsiteGuidedSetup(brief),
        false,
        `status=${status} must not block chat`,
      );
    }
  });
});
