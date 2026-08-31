/**
 * Build IR unit tests — P0A (no runtime orchestrator wiring required).
 */
import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";

import { isBuildOrchestratorEnabled } from "../lib/ai/orchestrator/flags.ts";
import {
  applyBuildSpecDelta,
  commitBuildSpecDelta,
  compileBuildSpecSlice,
  emptyBuildSpec,
  ensureBuildSpec,
  finalizeBuildAttempt,
  loadBuildSpec,
  mayClaimBuildSuccess,
  observationsWithFailedBuild,
  observationsWithSuccessfulBuild,
  recordFailedAttempt,
  resetBuildSpecStoreForTests,
  resolveBuildCapabilities,
  resolveBuildProject,
  resolveTurnPlan,
  seedBuildSpec,
  validateBuildCompletion,
  validatedDraftSurvived,
} from "../lib/ai/build/index.ts";

describe("Build flag default off", () => {
  it("isBuildOrchestratorEnabled defaults false", () => {
    const prev = process.env.NEXT_PUBLIC_AI_BUILD_ORCHESTRATOR;
    delete process.env.NEXT_PUBLIC_AI_BUILD_ORCHESTRATOR;
    assert.equal(isBuildOrchestratorEnabled(), false);
    process.env.NEXT_PUBLIC_AI_BUILD_ORCHESTRATOR = "1";
    assert.equal(isBuildOrchestratorEnabled(), true);
    if (prev === undefined) delete process.env.NEXT_PUBLIC_AI_BUILD_ORCHESTRATOR;
    else process.env.NEXT_PUBLIC_AI_BUILD_ORCHESTRATOR = prev;
  });
});

describe("BuildSpec delta + versioning", () => {
  it("applies patch without bumping until commit", () => {
    const spec = emptyBuildSpec({ projectId: "p1", goal: "HVAC site" });
    const patched = applyBuildSpecDelta(spec, {
      set: [{ path: "design.theme", value: "darker_hero" }],
    });
    assert.equal(patched.design.theme, "darker_hero");
    assert.equal(patched.buildSpecVersion, 1);
    assert.equal(spec.design.theme, undefined);
  });

  it("commit bumps version and sets parentVersion", () => {
    const spec = emptyBuildSpec({ projectId: "p1" });
    const next = commitBuildSpecDelta(spec, {
      set: [{ path: "goal", value: "New goal" }],
    });
    assert.equal(next.buildSpecVersion, 2);
    assert.equal(next.parentVersion, 1);
    assert.equal(next.goal, "New goal");
  });

  it("hero darker does not wipe pages", () => {
    let spec = emptyBuildSpec({ projectId: "p1", goal: "HVAC" });
    spec = {
      ...spec,
      pages: [{ id: "page_home", route: "/", title: "Home" }],
    };
    const next = commitBuildSpecDelta(spec, {
      set: [{ path: "design.colors.heroBackground", value: "#0f172a" }],
    });
    assert.equal(next.pages.length, 1);
    assert.equal(next.design.colors?.heroBackground, "#0f172a");
  });

  it("compileBuildSpecSlice stays compact", () => {
    const spec = emptyBuildSpec({ projectId: "p1", goal: "x".repeat(400) });
    const s = compileBuildSpecSlice(spec);
    assert.ok(s.length < 500);
    assert.ok(s.includes("BuildSpec v1"));
  });
});

describe("requiresBuildCapabilities", () => {
  it("weather in build space does not require Build", () => {
    const r = resolveBuildCapabilities({
      content: "What is the weather?",
      activeSpace: "build",
      projectId: "p1",
      projectKind: "site",
    });
    assert.equal(r.requiresBuildCapabilities, false);
  });

  it("build landing page from chat requires Build", () => {
    const r = resolveBuildCapabilities({
      content: "Build me a landing page.",
      activeSpace: "chat",
    });
    assert.equal(r.requiresBuildCapabilities, true);
  });

  it("greeting does not require Build", () => {
    const r = resolveBuildCapabilities({
      content: "Hello",
      activeSpace: "build",
    });
    assert.equal(r.requiresBuildCapabilities, false);
  });

  it("hero darker with project requires Build", () => {
    const r = resolveBuildCapabilities({
      content: "Make the hero darker.",
      activeSpace: "build",
      projectId: "p1",
      hasBuildSpec: true,
      projectKind: "site",
    });
    assert.equal(r.requiresBuildCapabilities, true);
    assert.equal(r.complexity, "routine");
  });
});

describe("project resolve fail-safe", () => {
  it("does not pick latest among many", () => {
    const r = resolveBuildProject({
      content: "Change the homepage",
      candidates: [
        { id: "a", title: "Site A" },
        { id: "b", title: "Site B" },
      ],
    });
    assert.equal(r.status, "clarify");
    assert.equal(r.projectId, null);
  });

  it("uses explicit projectId", () => {
    const r = resolveBuildProject({
      content: "Make the hero darker",
      explicitProjectId: "p-explicit",
      candidates: [
        { id: "a", title: "A" },
        { id: "b", title: "B" },
      ],
    });
    assert.equal(r.status, "resolved");
    assert.equal(r.projectId, "p-explicit");
  });

  it("create intent without project", () => {
    const r = resolveBuildProject({ content: "Build me an HVAC website." });
    assert.equal(r.status, "create");
  });
});

describe("TurnPlan + completion", () => {
  beforeEach(() => {
    resetBuildSpecStoreForTests();
  });

  it("pricing page plan has structured ops", () => {
    const spec = ensureBuildSpec({ projectId: "p1", goal: "HVAC" });
    const tp = resolveTurnPlan({
      content: "Add a pricing page with three plans.",
      buildSpec: spec,
      projectId: "p1",
    });
    assert.equal(tp.objective, "add_pricing_page");
    assert.ok(tp.operations.some((o) => o.type === "page.create"));
    assert.ok(tp.completionCriteria.some((c) => c.kind === "route_exists"));
  });

  it("failed build does not claim success or corrupt spec", () => {
    const spec = ensureBuildSpec({ projectId: "p1", goal: "HVAC" });
    const tp = resolveTurnPlan({
      content: "Make the hero darker.",
      buildSpec: spec,
      projectId: "p1",
    });
    const result = finalizeBuildAttempt({
      projectId: "p1",
      plan: tp,
      delta: tp.pendingDelta ?? {
        set: [{ path: "design.theme", value: "darker_hero" }],
      },
      observations: observationsWithFailedBuild("p1"),
    });
    assert.equal(result.ok, false);
    assert.equal(mayClaimBuildSuccess(result.validation), false);
    assert.equal(loadBuildSpec("p1")?.buildSpecVersion, 1);
    assert.equal(validatedDraftSurvived("p1").version, 1);
  });

  it("successful edit commits only intended fields + version bump", () => {
    seedBuildSpec({
      ...emptyBuildSpec({ projectId: "p1", goal: "HVAC" }),
      pages: [{ id: "page_home", route: "/", title: "Home" }],
    });
    const spec = loadBuildSpec("p1")!;
    const tp = resolveTurnPlan({
      content: "Make the hero darker.",
      buildSpec: spec,
      projectId: "p1",
    });
    const delta = tp.pendingDelta!;
    const result = finalizeBuildAttempt({
      projectId: "p1",
      plan: {
        ...tp,
        completionCriteria: [
          {
            id: "theme",
            kind: "spec_field",
            params: { path: "design.theme", equals: "darker_hero" },
          },
          { id: "build_ok", kind: "build_succeeds" },
          { id: "no_runtime", kind: "no_runtime_errors" },
        ],
      },
      delta,
      observations: observationsWithSuccessfulBuild("p1"),
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.after.buildSpecVersion, 2);
      assert.equal(result.after.pages.length, 1);
      assert.equal(result.after.design.theme, "darker_hero");
    }
  });

  it("validateBuildCompletion does not mutate plan criteria", () => {
    const spec = emptyBuildSpec({ projectId: "p1" });
    const tp = resolveTurnPlan({
      content: "Publish it.",
      buildSpec: spec,
      projectId: "p1",
    });
    const before = JSON.stringify(tp.completionCriteria);
    validateBuildCompletion(
      tp,
      observationsWithFailedBuild("p1"),
      spec,
    );
    assert.equal(JSON.stringify(tp.completionCriteria), before);
  });
});

describe("failed attempt recording", () => {
  beforeEach(() => resetBuildSpecStoreForTests());

  it("recordFailedAttempt keeps canonical spec", () => {
    ensureBuildSpec({ projectId: "p1" });
    const obs = observationsWithFailedBuild("p1");
    const v = validateBuildCompletion(
      {
        objective: "x",
        subject: { projectId: "p1" },
        operations: [],
        completionCriteria: [{ id: "b", kind: "build_succeeds" }],
        complexity: "routine",
      },
      obs,
      loadBuildSpec("p1"),
    );
    recordFailedAttempt("p1", obs, v);
    assert.equal(loadBuildSpec("p1")?.buildSpecVersion, 1);
  });
});
