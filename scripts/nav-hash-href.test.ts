import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  navHrefHashId,
  navHrefRoutePath,
} from "../lib/ai/build/plan/nav-href.ts";
import { assertNavCoveredBySitemap } from "../lib/ai/build/plan/normalize.ts";
import type { BuildPlanJson } from "../lib/ai/build/plan/types.ts";

describe("nav href route path", () => {
  it("treats /#section as home route, not a missing page path", () => {
    assert.equal(navHrefRoutePath("/#services"), "/");
    assert.equal(navHrefRoutePath("/#contact"), "/");
    assert.equal(navHrefHashId("/#services"), "services");
    assert.equal(navHrefRoutePath("#hero"), null);
    assert.equal(navHrefRoutePath("/about#team"), "/about");
  });
});

describe("landing-page hash nav validation", () => {
  const plan: BuildPlanJson = {
    version: 1,
    kind: "site",
    sitemap: [{ id: "home", path: "/", title: "Home" }],
    pages: [
      {
        id: "home",
        path: "/",
        title: "Home",
        sections: [
          { id: "services", role: "features" },
          { id: "contact", role: "form" },
        ],
      },
    ],
    nav: [
      { label: "Services", href: "/#services" },
      { label: "Contact", href: "/#contact" },
    ],
    componentNeeds: [],
    validationChecklist: [],
  };

  it("sitemap coverage accepts /#anchors against home", () => {
    assert.deepEqual(assertNavCoveredBySitemap(plan), []);
  });

  it("route-file check would only require app/page for /#anchors", () => {
    const files = new Set(["app/page.tsx"]);
    const issues: string[] = [];
    for (const item of plan.nav) {
      const routePath = navHrefRoutePath(item.href);
      if (!routePath) continue;
      const candidates =
        routePath === "/"
          ? ["app/page.tsx"]
          : [`app${routePath}/page.tsx`];
      if (!candidates.some((p) => files.has(p))) {
        issues.push(`Nav href ${item.href} has no App Router page file`);
      }
    }
    assert.deepEqual(issues, []);
  });
});
