/**
 * Build orchestrator integration — routing, mutations, recipes, non-regression.
 */
import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";

import { compileTurnProfile } from "../lib/ai/turn-environment/index.ts";
import {
  decideBuildEscalation,
  emptyBuildSpec,
  ensureBuildSpec,
  getBuildRecipe,
  canApplyRecipe,
  loadBuildSpec,
  resetBuildLogsForTests,
  resetBuildSpecStoreForTests,
  resolveBuildCapabilities,
  resolveBuildProject,
  resolveBuildTurnContext,
  resolveTurnPlan,
  runRoutineBuildMutation,
  searchComponentsBounded,
  seedBuildSpec,
  shouldRunBuildLocally,
  validateBackendRecipeSecurity,
} from "../lib/ai/build/index.ts";

describe("Build gate — flag off means no Build side effects", () => {
  const prev = process.env.NEXT_PUBLIC_AI_BUILD_ORCHESTRATOR;

  afterEach(() => {
    if (prev === undefined) delete process.env.NEXT_PUBLIC_AI_BUILD_ORCHESTRATOR;
    else process.env.NEXT_PUBLIC_AI_BUILD_ORCHESTRATOR = prev;
    resetBuildSpecStoreForTests();
    resetBuildLogsForTests();
  });

  it("resolveBuildTurnContext is inert when flag off", () => {
    delete process.env.NEXT_PUBLIC_AI_BUILD_ORCHESTRATOR;
    const ctx = resolveBuildTurnContext({
      content: "Build me a landing page.",
    });
    assert.equal(ctx.enabled, false);
    assert.equal(ctx.requiresBuildCapabilities, false);
    assert.equal(ctx.buildSpecSlice, null);
  });

  it("greeting compiles without build domain", () => {
    delete process.env.NEXT_PUBLIC_AI_BUILD_ORCHESTRATOR;
    const profile = compileTurnProfile({ content: "Hello there" });
    assert.ok(!profile.domains.includes("build"));
    assert.equal(profile.contextPacket.buildSpecSlice, undefined);
  });

  it("web research path unchanged without build", () => {
    delete process.env.NEXT_PUBLIC_AI_BUILD_ORCHESTRATOR;
    const profile = compileTurnProfile({
      content: "What is the latest news about AI?",
    });
    assert.ok(!profile.domains.includes("build"));
  });
});

describe("P0B read-only Build routing", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_AI_BUILD_ORCHESTRATOR = "1";
    resetBuildSpecStoreForTests();
    resetBuildLogsForTests();
  });
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_AI_BUILD_ORCHESTRATOR;
  });

  it("activeSpace build + weather does not require Build", () => {
    const caps = resolveBuildCapabilities({
      content: "What is the weather?",
      activeSpace: "build",
      projectId: "p1",
      projectKind: "site",
    });
    assert.equal(caps.requiresBuildCapabilities, false);
    const ctx = resolveBuildTurnContext({
      content: "What is the weather?",
      activeSpace: "build",
      forceEnabled: true,
    });
    assert.equal(ctx.requiresBuildCapabilities, false);
  });

  it("build language outside Build space activates Build", () => {
    const ctx = resolveBuildTurnContext({
      content: "Build me an HVAC website.",
      activeSpace: "chat",
      forceEnabled: true,
    });
    assert.equal(ctx.requiresBuildCapabilities, true);
    assert.ok(ctx.turnPlan);
    assert.equal(ctx.turnPlan?.recipeId, "local-business-site");
  });

  it("ambiguous project clarifies", () => {
    const r = resolveBuildProject({
      content: "Change the homepage",
      candidates: [
        { id: "1", title: "A" },
        { id: "2", title: "B" },
      ],
    });
    assert.equal(r.status, "clarify");
  });

  it("compileTurnProfile gets slice only when gated", () => {
    seedBuildSpec({
      ...emptyBuildSpec({ projectId: "p1", goal: "HVAC" }),
      pages: [{ id: "page_home", route: "/", title: "Home" }],
    });
    const ctx = resolveBuildTurnContext({
      content: "Make the hero darker.",
      explicitProjectId: "p1",
      projectKind: "site",
      forceEnabled: true,
    });
    assert.equal(ctx.requiresBuildCapabilities, true);
    const profile = compileTurnProfile({
      content: "Make the hero darker.",
      build: {
        requiresBuildCapabilities: true,
        buildSpecSlice: ctx.buildSpecSlice,
        forceDomains: ["build"],
      },
    });
    assert.ok(profile.contextPacket.buildSpecSlice?.includes("BuildSpec"));
    assert.ok(profile.domains.includes("build"));
  });
});

describe("P0C routine mutations", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_AI_BUILD_ORCHESTRATOR = "1";
    process.env.NEXT_PUBLIC_AI_BUILD_LOCAL = "1";
    resetBuildSpecStoreForTests();
  });
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_AI_BUILD_ORCHESTRATOR;
    delete process.env.NEXT_PUBLIC_AI_BUILD_LOCAL;
  });

  it("A: HVAC website creates BuildSpec via recipe", async () => {
    const ctx = resolveBuildTurnContext({
      content: "Build me an HVAC website.",
      forceEnabled: true,
    });
    assert.ok(shouldRunBuildLocally(ctx));
    const result = await runRoutineBuildMutation({
      content: "Build me an HVAC website.",
      ctx,
    });
    assert.equal(result.claimedSuccess, true);
    const spec = loadBuildSpec(result.projectId!);
    assert.ok(spec);
    assert.equal(spec!.recipeId, "local-business-site");
    assert.ok(spec!.pages.length >= 1);
    assert.ok(spec!.sections.some((s) => s.role === "hero"));
  });

  it("B: hero edit patches without rebuilding pages", async () => {
    ensureBuildSpec({ projectId: "p-hero", goal: "HVAC", projectType: "site" });
    seedBuildSpec({
      ...loadBuildSpec("p-hero")!,
      pages: [{ id: "page_home", route: "/", title: "Home" }],
      sections: [{ id: "sec_hero", role: "hero" }],
      recipeId: "local-business-site",
      recipeVersion: 1,
    });
    const ctx = resolveBuildTurnContext({
      content: "Make the hero more modern.",
      explicitProjectId: "p-hero",
      forceEnabled: true,
    });
    // pending delta for modern sets design.style
    const plan = resolveTurnPlan({
      content: "Make the hero more modern.",
      buildSpec: loadBuildSpec("p-hero"),
      projectId: "p-hero",
    });
    assert.ok(plan.pendingDelta);
    const result = await runRoutineBuildMutation({
      content: "Make the hero more modern.",
      ctx: { ...ctx, turnPlan: plan, projectId: "p-hero" },
    });
    assert.equal(result.claimedSuccess, true);
    const after = loadBuildSpec("p-hero")!;
    assert.equal(after.pages.length, 1);
    assert.equal(after.design.style, "modern_hero");
    assert.equal(after.buildSpecVersion, 2);
  });

  it("D: add pricing page", async () => {
    seedBuildSpec({
      ...emptyBuildSpec({ projectId: "p-price", goal: "Site" }),
      pages: [{ id: "page_home", route: "/", title: "Home" }],
      sections: [{ id: "sec_nav", role: "nav", content: { links: ["/"] } }],
    });
    const ctx = resolveBuildTurnContext({
      content: "Add a pricing page with three plans.",
      explicitProjectId: "p-price",
      forceEnabled: true,
    });
    const result = await runRoutineBuildMutation({
      content: "Add a pricing page with three plans.",
      ctx,
    });
    assert.equal(result.claimedSuccess, true);
    const after = loadBuildSpec("p-price")!;
    assert.ok(after.pages.some((p) => p.route === "/pricing"));
    assert.ok(after.sections.some((s) => s.role === "pricing"));
  });

  it("E: remove pricing", async () => {
    seedBuildSpec({
      ...emptyBuildSpec({ projectId: "p-rm", goal: "Site" }),
      pages: [
        { id: "page_home", route: "/", title: "Home" },
        { id: "page_pricing", route: "/pricing", title: "Pricing" },
      ],
      sections: [
        { id: "sec_nav", role: "nav", content: { links: ["/", "/pricing"] } },
        {
          id: "sec_pricing",
          role: "pricing",
          content: { plans: [{ id: "a" }, { id: "b" }, { id: "c" }] },
        },
      ],
    });
    const ctx = resolveBuildTurnContext({
      content: "Remove pricing.",
      explicitProjectId: "p-rm",
      forceEnabled: true,
    });
    const result = await runRoutineBuildMutation({
      content: "Remove pricing.",
      ctx,
    });
    assert.equal(result.claimedSuccess, true);
    const after = loadBuildSpec("p-rm")!;
    assert.ok(!after.pages.some((p) => p.route === "/pricing"));
    assert.equal(after.pages.length, 1);
  });

  it("H/I: publish fails closed on bad build", async () => {
    seedBuildSpec(emptyBuildSpec({ projectId: "p-pub", goal: "Site" }));
    const ctx = resolveBuildTurnContext({
      content: "Publish it.",
      explicitProjectId: "p-pub",
      forceEnabled: true,
    });
    const fail = await runRoutineBuildMutation({
      content: "Publish it.",
      ctx,
      failValidation: true,
    });
    assert.equal(fail.claimedSuccess, false);
    assert.ok(/could not publish|validation/i.test(fail.content));
    assert.equal(loadBuildSpec("p-pub")?.buildSpecVersion, 1);
  });

  it("failed sandbox does not mutate canonical BuildSpec", async () => {
    seedBuildSpec({
      ...emptyBuildSpec({ projectId: "p-fail", goal: "Site" }),
      pages: [{ id: "page_home", route: "/", title: "Home" }],
    });
    const ctx = resolveBuildTurnContext({
      content: "Make the hero darker.",
      explicitProjectId: "p-fail",
      forceEnabled: true,
    });
    const result = await runRoutineBuildMutation({
      content: "Make the hero darker.",
      ctx,
      failValidation: true,
    });
    assert.equal(result.claimedSuccess, false);
    assert.equal(loadBuildSpec("p-fail")?.buildSpecVersion, 1);
    assert.equal(loadBuildSpec("p-fail")?.design.theme, undefined);
  });
  it("F: add Google authentication uses auth recipe", async () => {
    seedBuildSpec(emptyBuildSpec({ projectId: "p-auth", goal: "SaaS" }));
    const ctx = resolveBuildTurnContext({
      content: "Add Google authentication.",
      explicitProjectId: "p-auth",
      forceEnabled: true,
    });
    const result = await runRoutineBuildMutation({
      content: "Add Google authentication.",
      ctx,
    });
    assert.equal(result.claimedSuccess, true);
    const after = loadBuildSpec("p-auth")!;
    assert.equal(after.auth?.recipeId, "auth-google");
    assert.ok(after.auth?.providers?.includes("google"));
  });
});

describe("P1 components + recipes + security", () => {
  it("C: component search returns ≤5 candidates", async () => {
    const c = await searchComponentsBounded({
      query: "professional SaaS hero",
      role: "hero",
    });
    assert.ok(c.length <= 5);
    assert.ok(c.length >= 1);
    assert.ok(c[0]!.id);
    assert.ok(!("sourceCode" in c[0]!));
  });

  it("F: auth recipe security validation", () => {
    const bad = validateBackendRecipeSecurity("auth-google", {
      auth_enabled: true,
      google_provider_configured: false,
      no_service_role_in_client: true,
    });
    assert.equal(bad.ok, false);
    const good = validateBackendRecipeSecurity("auth-google", {
      auth_enabled: true,
      google_provider_configured: true,
      no_service_role_in_client: true,
    });
    assert.equal(good.ok, true);
  });

  it("recipe version pin", () => {
    const recipe = getBuildRecipe("local-business-site")!;
    const gate = canApplyRecipe(
      { recipeId: "local-business-site", recipeVersion: 1 },
      { ...recipe, recipeVersion: 2 },
    );
    assert.equal(gate.ok, false);
  });
});

describe("P2 escalation", () => {
  it("J: novel / no component escalates subproblem only", () => {
    const plan = resolveTurnPlan({
      content: "Use a different hero.",
      buildSpec: emptyBuildSpec({ projectId: "p1" }),
      projectId: "p1",
    });
    const d = decideBuildEscalation({
      plan,
      complexity: "routine",
      repairAttempts: 0,
      hasRecipe: true,
      hasComponentCandidate: false,
    });
    assert.equal(d.escalate, true);
    assert.equal(d.reason, "no_suitable_component");
    assert.ok(d.subproblem?.includes("objective="));
  });

  it("repeated repair escalates", () => {
    const plan = resolveTurnPlan({
      content: "Fix the build",
      buildSpec: emptyBuildSpec({ projectId: "p1" }),
      projectId: "p1",
    });
    const d = decideBuildEscalation({
      plan,
      complexity: "routine",
      repairAttempts: 2,
      hasRecipe: true,
      hasComponentCandidate: true,
    });
    assert.equal(d.escalate, true);
    assert.equal(d.reason, "repeated_repair_failure");
  });
});
