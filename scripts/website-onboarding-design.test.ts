/**
 * Short website onboarding, design brief, status sanitizer, legacy normalize.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  WEBSITE_SETUP_STEP_KEYS,
  WEBSITE_SETUP_STEPS,
  normalizeSetupAnswersToShort,
  imageryStrategyFromAnswer,
  paletteTokens,
  isAiChoice,
} from "../lib/ai/build/website-setup-steps.ts";
import {
  emptyWebsiteSetupBrief,
  isWebsiteSetupComplete,
  needsWebsiteGuidedSetup,
  normalizeWebsiteSetupBrief,
  countCompletedSetupSteps,
  WEBSITE_SETUP_STEP_COUNT,
} from "../lib/ai/build/website-setup-brief.ts";
import {
  designBriefFromSetupAnswers,
  formatDesignBriefForPrompt,
  mergeDesignBrief,
} from "../lib/ai/build/design-brief.ts";
import { projectSpecFromSetupBrief } from "../lib/ai/build/plan/spec-memory.ts";
import { normalizeProjectSpec } from "../lib/ai/build/plan/normalize.ts";
import {
  sanitizeUserProgress,
  preferInformativeProgress,
} from "../lib/build/jobs/user-progress.ts";
import { AI_CHOICE_VALUE } from "../lib/ai/clarification/ai-choice.ts";

describe("short website onboarding", () => {
  it("has six high-value steps", () => {
    assert.equal(WEBSITE_SETUP_STEP_KEYS.length, 6);
    assert.equal(WEBSITE_SETUP_STEPS.length, 6);
    assert.equal(WEBSITE_SETUP_STEP_COUNT, 6);
    assert.deepEqual([...WEBSITE_SETUP_STEP_KEYS], [
      "purpose",
      "goal",
      "style",
      "colors",
      "imagery",
      "reference_url",
    ]);
  });

  it("supports Let Candor decide via AI choice sentinel", () => {
    assert.equal(isAiChoice(AI_CHOICE_VALUE), true);
    const brief = designBriefFromSetupAnswers({
      purpose: AI_CHOICE_VALUE,
      goal: AI_CHOICE_VALUE,
      style: AI_CHOICE_VALUE,
      colors: AI_CHOICE_VALUE,
      imagery: AI_CHOICE_VALUE,
    });
    assert.match(brief.styleDirection, /decide/i);
    assert.ok(brief.builderFreedom.includes("styleDirection"));
    assert.ok(brief.builderFreedom.includes("colorDirection"));
  });

  it("treats custom colors as hard requirements", () => {
    const brief = designBriefFromSetupAnswers({
      purpose: "aerospace company",
      goal: "Drive qualified contact inquiries",
      style: "technical",
      colors: { custom: "#0B1020, #F4F7FC, #28D7F5", mode: "dark" },
      imagery: "generate",
    });
    assert.equal(brief.strengths?.colors, "hard");
    assert.match(brief.colorDirection, /#0B1020|#28D7F5|custom/i);
    const tokens = paletteTokens({ custom: "black, white, cyan", mode: "dark" });
    assert.ok(tokens?.custom || tokens?.mode === "dark");
  });

  it("maps imagery strategies", () => {
    assert.equal(imageryStrategyFromAnswer("generate"), "generate");
    assert.equal(imageryStrategyFromAnswer("placeholder"), "placeholder");
    assert.equal(imageryStrategyFromAnswer("user_upload"), "user_upload");
    assert.equal(imageryStrategyFromAnswer("minimal"), "minimal");
    assert.equal(imageryStrategyFromAnswer(AI_CHOICE_VALUE), "ai_choice");
  });
});

describe("legacy onboarding normalization", () => {
  it("normalizes old 12-step answers into short keys", () => {
    const short = normalizeSetupAnswersToShort({
      purpose: "Landscaping company",
      visual_direction: "editorial",
      palette: { mode: "light", primary: "#1f5f3f" },
      inspiration_urls: ["https://example.com"],
      anything_else: "Warm and local",
      primary_cta: "contact",
    });
    assert.equal(short.purpose, "Landscaping company");
    assert.ok(String(short.goal || "").length > 0);
    assert.equal(short.style, "editorial");
    assert.ok(short.colors);
    assert.equal(short.reference_url, "https://example.com");
  });

  it("normalizes old 8-key briefs without breaking open/preview", () => {
    const raw = {
      status: "ready",
      answers: {
        business_goal: "Sell hiking kits",
        audience_cta: "Outdoor buyers — Shop now",
        visual_style: "modern",
        brand_colors: "green and cream",
        confirm_build: true,
      },
      completedSteps: 8,
      confirmedAt: "2026-01-01T00:00:00.000Z",
    };
    const brief = normalizeWebsiteSetupBrief(raw);
    assert.equal(needsWebsiteGuidedSetup(brief), false);
    assert.equal(isWebsiteSetupComplete(brief), true);
    assert.ok(brief.answers.purpose || brief.answers.business_goal);
  });

  it("existing incomplete setup still requires guided setup", () => {
    const brief = emptyWebsiteSetupBrief({
      answers: { business_goal: "Only one answer" },
      completedSteps: 1,
    });
    assert.equal(needsWebsiteGuidedSetup(brief), true);
  });
});

describe("canonical design brief", () => {
  it("derives brief from short onboarding and seeds project_spec", () => {
    const answers = {
      purpose: "Reusable launch systems",
      goal: "Look serious and drive contact inquiries from satellite operators",
      style: "technical",
      colors: { mode: "dark", custom: "black, white, cyan accent" },
      imagery: "generate",
      reference_url: ["https://inspiration.example"],
    };
    const brief = designBriefFromSetupAnswers(answers, { projectName: "Orbital" });
    assert.equal(brief.purpose.includes("Reusable"), true);
    assert.ok(brief.imagery.length >= 1);
    assert.equal(brief.referenceUrl, "https://inspiration.example");
    assert.ok(brief.avoid.some((a) => /purple/i.test(a)));
    const prompt = formatDesignBriefForPrompt(brief);
    assert.match(prompt, /Canonical design brief/);
    assert.match(prompt, /strength=/);

    const spec = projectSpecFromSetupBrief({
      answers,
      projectName: "Orbital",
      kind: "site",
    });
    assert.ok(spec.designBrief);
    assert.equal(spec.designBrief?.styleDirection, brief.styleDirection);
    assert.ok(spec.imagery?.plan?.length);
    const normalized = normalizeProjectSpec(spec);
    assert.ok(normalized?.designBrief?.purpose);
  });

  it("merges planner enrichments without wiping freedom tags", () => {
    const base = designBriefFromSetupAnswers({ style: AI_CHOICE_VALUE });
    const merged = mergeDesignBrief(base, {
      styleDirection: "Cinematic technical aerospace identity",
      designTokens: { primary: "#28D7F5", background: "#0B1020" },
    });
    assert.match(merged.styleDirection, /aerospace/i);
    assert.equal(merged.designTokens.primary, "#28D7F5");
    assert.ok(merged.builderFreedom.includes("styleDirection"));
  });
});

describe("user-facing build status", () => {
  it("maps long-running stages to clean product language", () => {
    assert.equal(sanitizeUserProgress("Finding design components…"), "Finding design components…");
    assert.equal(
      sanitizeUserProgress("Preparing production build…"),
      "Preparing production build…",
    );
    assert.equal(
      sanitizeUserProgress("Still validating the production build…"),
      "Running final build checks…",
    );
    assert.equal(sanitizeUserProgress("Fixing a layout issue…"), "Fixing a layout issue…");
    assert.equal(sanitizeUserProgress("Checking mobile layout…"), "Checking mobile layout…");
  });

  it("hides tool noise and chain-of-thought / secrets", () => {
    assert.equal(sanitizeUserProgress("npm install next"), null);
    assert.equal(sanitizeUserProgress("coder: 12 tool calls"), null);
    assert.equal(sanitizeUserProgress("OPENAI_API_KEY=sk-test"), null);
    assert.equal(sanitizeUserProgress("process PID 8392 next build"), null);
  });

  it("throttles vague heartbeats over informative status", () => {
    const kept = preferInformativeProgress(
      "Building the homepage…",
      "Still working on your site…",
      { nextIsHeartbeat: true },
    );
    assert.equal(kept, "Building the homepage…");
    const advanced = preferInformativeProgress(
      "Building the homepage…",
      "Checking your pages…",
      { nextIsHeartbeat: false },
    );
    assert.equal(advanced, "Checking your pages…");
  });

  it("does not invent fake progress from empty input", () => {
    assert.equal(sanitizeUserProgress(""), null);
    assert.equal(sanitizeUserProgress(null), null);
  });
});

describe("countCompletedSetupSteps", () => {
  it("counts short keys and falls back to legacy keys", () => {
    assert.equal(
      countCompletedSetupSteps({
        purpose: "SaaS",
        goal: "Signups",
        style: "minimal",
      }),
      3,
    );
    assert.equal(
      countCompletedSetupSteps({
        business_goal: "A",
        audience_cta: "B",
        visual_style: "C",
      }),
      3,
    );
  });
});
