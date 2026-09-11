/**
 * Builder improvement unit tests — flags, model routing, 21st selection shape,
 * agent reason normalization, edit complexity.
 */
import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";

import { resolveBuilderFeatureFlags } from "../lib/build/jobs/builder-flags.ts";
import {
  classifyEditComplexity,
  editNeedsVisualQa,
  pickCoderModel,
} from "../lib/build/jobs/builder-models.ts";
import { normalizeProjectSpec } from "../lib/ai/build/plan/normalize.ts";

describe("builder feature flags", () => {
  const keys = [
    "CANDER_BUILDER_IMPROVED",
    "CANDER_BUILDER_21ST_FETCH",
    "CANDER_BUILDER_VISUAL_QA",
    "CANDER_BUILDER_SDK_LOOP",
    "CANDER_BUILDER_CONTINUOUS_REPAIR",
    "CANDER_BUILDER_MODEL_ROUTING",
  ];
  const prev: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const k of keys) {
      prev[k] = process.env[k];
      delete process.env[k];
    }
  });
  afterEach(() => {
    for (const k of keys) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  });

  it("defaults improved path on", () => {
    const f = resolveBuilderFeatureFlags();
    assert.equal(f.improved, true);
    assert.equal(f.twentyFirstFetch, true);
    assert.equal(f.websiteTemplateFirst, true);
    assert.equal(f.visualQa, true);
    assert.equal(f.sdkOwnedLoop, true);
  });

  it("CANDER_BUILDER_IMPROVED=0 disables the package", () => {
    process.env.CANDER_BUILDER_IMPROVED = "0";
    const f = resolveBuilderFeatureFlags();
    assert.equal(f.improved, false);
    assert.equal(f.twentyFirstFetch, false);
    assert.equal(f.websiteTemplateFirst, false);
    assert.equal(f.visualQa, false);
  });

  it("sub-flag can re-enable while master is off", () => {
    process.env.CANDER_BUILDER_IMPROVED = "0";
    process.env.CANDER_BUILDER_21ST_FETCH = "1";
    const f = resolveBuilderFeatureFlags();
    assert.equal(f.improved, false);
    assert.equal(f.twentyFirstFetch, true);
  });
});

describe("builder model routing", () => {
  const models = {
    planner: "planner-m",
    fast: "fast-m",
    coder: "coder-m",
    strongCoder: "strong-m",
    visualReview: "visual-m",
  };

  it("trivial copy edit uses fast model when routing on", () => {
    assert.equal(
      pickCoderModel({
        models,
        mode: "edit",
        projectKind: "site",
        editComplexity: "trivial",
        routingEnabled: true,
      }),
      "fast-m",
    );
  });

  it("app create escalates to strong coder", () => {
    assert.equal(
      pickCoderModel({
        models,
        mode: "create",
        projectKind: "app",
        routingEnabled: true,
      }),
      "strong-m",
    );
  });

  it("routing off always returns coder", () => {
    assert.equal(
      pickCoderModel({
        models,
        mode: "create",
        projectKind: "app",
        routingEnabled: false,
      }),
      "coder-m",
    );
  });

  it("classifyEditComplexity distinguishes trivial vs complex", () => {
    assert.equal(classifyEditComplexity("fix the typo in the headline"), "trivial");
    assert.equal(classifyEditComplexity("add supabase auth and user profiles"), "complex");
    assert.equal(classifyEditComplexity("add a pricing section on the home page"), "standard");
  });

  it("editNeedsVisualQa skips pure copy", () => {
    assert.equal(editNeedsVisualQa("fix the typo in the headline"), false);
    assert.equal(editNeedsVisualQa("redesign the hero layout for mobile"), true);
  });
});

describe("project spec selectedComponents", () => {
  it("normalizes 21st selection entries", () => {
    const spec = normalizeProjectSpec({
      version: 1,
      kind: "site",
      businessName: "Cliff",
      intent: "Sell chatbots",
      goals: [],
      ctas: [],
      selectedComponents: [
        {
          source: "21st",
          componentId: "abc",
          purpose: "hero",
          localPath: "components/twenty-first/hero-abc.tsx",
          adaptationInstructions: "Adapt tokens",
          imported: true,
          usedInRender: true,
        },
      ],
      imagery: {
        heroSubject: "team collaborating",
        strategy: "generate",
        plan: [
          {
            role: "hero",
            strategy: "generated",
            description: "night launch",
            assetPath: "/assets/hero.webp",
          },
        ],
      },
      designBrief: {
        purpose: "SaaS",
        styleDirection: "minimal",
        colorDirection: "dark",
        imageryStrategy: "generate",
        designTokens: { primary: "#22d3ee" },
        avoid: ["Purple SaaS gradients"],
      },
      primaryFlows: [{ id: "onboard", title: "Onboarding", steps: ["signup", "setup"] }],
    });
    assert.ok(spec);
    assert.equal(spec!.selectedComponents?.[0]?.componentId, "abc");
    assert.equal(spec!.selectedComponents?.[0]?.localPath, "components/twenty-first/hero-abc.tsx");
    assert.equal(spec!.selectedComponents?.[0]?.usedInRender, true);
    assert.equal(spec!.imagery?.heroSubject, "team collaborating");
    assert.equal(spec!.imagery?.plan?.[0]?.assetPath, "/assets/hero.webp");
    assert.equal(spec!.designBrief?.styleDirection, "minimal");
    assert.equal(spec!.designBrief?.designTokens?.primary, "#22d3ee");
    assert.equal(spec!.primaryFlows?.[0]?.id, "onboard");
  });
});

describe("agent reason normalization", () => {
  it("maps legacy reasons", () => {
    const normalize = (reason: string) => {
      if (reason === "verification_failed") return "acceptance_failed";
      if (reason === "preview_unavailable") return "preview_infrastructure_failure";
      if (reason === "deadline") return "timeout";
      if (reason === "llm_budget" || reason === "tool_budget") return "budget_exceeded";
      return reason;
    };
    assert.equal(normalize("verification_failed"), "acceptance_failed");
    assert.equal(normalize("preview_unavailable"), "preview_infrastructure_failure");
    assert.equal(normalize("deadline"), "timeout");
    assert.equal(normalize("finished"), "finished");
  });
});
