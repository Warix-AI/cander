import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertNavCoveredBySitemap,
  normalizeBuildPlanRecord,
  normalizeImplementationManifest,
  normalizeProjectSpec,
  normalizeResearchManifest,
} from "../lib/ai/build/plan/normalize.ts";
import { renderBuildPlanMarkdown } from "../lib/ai/build/plan/markdown.ts";

describe("plan-first types normalize", () => {
  it("round-trips ProjectSpec", () => {
    const raw = {
      version: 1,
      kind: "site",
      businessName: "Green Canopy Tree Care",
      intent: "Local tree service marketing site",
      goals: ["Book estimates"],
      ctas: [{ label: "Get a quote", href: "/contact", primary: true }],
    };
    const spec = normalizeProjectSpec(raw);
    assert.ok(spec);
    assert.equal(spec.businessName, "Green Canopy Tree Care");
    assert.equal(spec.kind, "site");
    assert.equal(spec.ctas[0]?.label, "Get a quote");
  });

  it("rejects incomplete ProjectSpec", () => {
    assert.equal(normalizeProjectSpec({ kind: "site" }), null);
  });

  it("normalizes BuildPlan and flags nav gaps", () => {
    const plan = normalizeBuildPlanRecord({
      markdown: "",
      json: {
        version: 1,
        kind: "site",
        sitemap: [{ id: "home", path: "/", title: "Home" }],
        pages: [
          {
            id: "home",
            path: "/",
            title: "Home",
            sections: [{ id: "hero", role: "hero", title: "Hero" }],
          },
        ],
        nav: [
          { label: "Home", href: "/" },
          { label: "Contact", href: "/contact" },
        ],
        componentNeeds: [
          {
            role: "hero",
            designIntent: "warm local landscaping marketing",
          },
        ],
        validationChecklist: ["Nav routes exist"],
      },
    });
    assert.ok(plan);
    assert.equal(plan.json.componentNeeds[0]?.role, "hero");
    const issues = assertNavCoveredBySitemap(plan.json);
    assert.ok(issues.some((i) => i.includes("/contact")));
    const md = renderBuildPlanMarkdown(plan.json);
    assert.match(md, /Build plan/);
    assert.match(md, /warm local landscaping marketing/);
    assert.ok(!md.includes("tree care query"));
  });

  it("normalizes ResearchManifest + ImplementationManifest", () => {
    const research = normalizeResearchManifest({
      version: 1,
      roles: [
        {
          role: "hero",
          designIntent: "warm local landscaping marketing",
          queries: ["hero marketing landscaping"],
          candidates: [
            {
              id: "1",
              score: 0.9,
              reasons: ["role match"],
              source: "twenty_first",
            },
          ],
          rejected: [{ id: "bad", reason: "semantic mismatch" }],
          fallback: "catalog",
          deps: ["framer-motion"],
          primitives: ["button"],
          assets: [],
          config: [],
        },
      ],
      packageDependencies: { "framer-motion": "^11" },
    });
    assert.ok(research);
    assert.equal(research.roles[0]?.fallback, "catalog");
    assert.equal(research.packageDependencies["framer-motion"], "^11");

    const impl = normalizeImplementationManifest({
      files: [{ path: "package.json" }, "app/page.tsx"],
      routes: [{ path: "/", pageId: "home" }],
      tasks: ["scaffold"],
      validation: { ok: false, technical: ["missing /contact"], visual: [] },
    });
    assert.equal(impl.files.length, 2);
    assert.equal(impl.validation.ok, false);
    assert.ok(impl.validation.technical[0]?.includes("/contact"));
  });
});

describe("plan-first Phase 2 heuristics", () => {
  it("tree-care brief yields role needs with designIntent, not query tree", async () => {
    const { projectSpecFromBriefHeuristic } = await import(
      "../lib/ai/build/plan/heuristics.ts"
    );
    const { buildPlanFromSpecHeuristic } = await import(
      "../lib/ai/build/plan/heuristics.ts"
    );
    const brief = {
      status: "building" as const,
      completedSteps: 8,
      answers: {
        business_name: "Green Canopy Tree Care",
        industry: "tree care / landscaping",
        intent: "Local tree service bookings",
        audience: "homeowners",
        tone: "warm local",
        primary_goal: "Book estimates",
      },
      updatedAt: new Date().toISOString(),
    };
    const spec = projectSpecFromBriefHeuristic(brief, "Build my site");
    assert.equal(spec.businessName, "Green Canopy Tree Care");
    const plan = buildPlanFromSpecHeuristic(spec);
    const roles = plan.json.componentNeeds.map((c) => c.role);
    assert.ok(roles.includes("hero"));
    assert.ok(roles.includes("services"));
    assert.ok(roles.includes("faq"));
    for (const need of plan.json.componentNeeds) {
      assert.ok(need.designIntent.length > 0);
      assert.notEqual(need.designIntent.trim().toLowerCase(), "tree");
      assert.match(need.designIntent, /marketing|landscap|warm|local|site/i);
    }
    assert.ok(plan.markdown.includes("Build plan"));
    assert.equal(assertNavCoveredBySitemap(plan.json).length, 0);
  });
});
