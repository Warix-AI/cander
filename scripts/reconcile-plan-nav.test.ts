/**
 * Reconcile BuildPlan nav with SiteSpec so landing one-shots don't fail validation.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { reconcilePlanNavWithSiteSpec } from "../lib/ai/build/reconcile-plan-spec.ts";
import type { BuildPlanJson } from "../lib/ai/build/plan/types.ts";
import type { SiteSpec } from "../lib/ai/build/site-spec.ts";
import { navHrefRoutePath } from "../lib/ai/build/plan/nav-href.ts";

const baseSpec: SiteSpec = {
  businessName: "Panda",
  tagline: "Order online",
  industry: "restaurant",
  intent: "menus",
  phone: "",
  email: "",
  location: "",
  ctaPrimary: { label: "Order Online", href: "/contact" },
  nav: [
    { label: "Menu", href: "/menu" },
    { label: "Contact", href: "/contact" },
  ],
  headerVariant: "sticky-cta",
  footerVariant: "simple-bar",
  theme: {
    layoutStyle: "warm-local",
    primary: "#c00",
    primaryForeground: "#fff",
    accent: "#111",
    background: "#fff",
    foreground: "#111",
    muted: "#f5f5f5",
    mutedForeground: "#666",
    border: "#e5e5e5",
    radius: "12px",
    fontDisplay: "system-ui",
    fontBody: "system-ui",
    spacingScale: "comfortable",
  },
  pages: [
    {
      id: "home",
      path: "/",
      title: "Panda",
      sections: [
        {
          id: "hero",
          kind: "features",
          variant: "split",
          title: "Panda",
          body: "Menus",
        },
      ],
    },
  ],
  customGaps: [],
};

const plan: BuildPlanJson = {
  version: 1,
  kind: "site",
  sitemap: [{ id: "home", path: "/", title: "Home" }],
  pages: [
    {
      id: "home",
      path: "/",
      title: "Home",
      sections: [{ id: "hero", role: "hero", title: "Panda" }],
    },
  ],
  nav: [
    { label: "Menu", href: "/menu" },
    { label: "Contact", href: "/contact" },
  ],
  componentNeeds: [],
  validationChecklist: [],
};

describe("reconcilePlanNavWithSiteSpec", () => {
  it("rewrites landing /menu and /contact to hash nav and adds sections", () => {
    const out = reconcilePlanNavWithSiteSpec({
      plan,
      spec: baseSpec,
      brief: {
        status: "building",
        completedSteps: 8,
        answers: { site_depth: "landing" },
        updatedAt: new Date().toISOString(),
      },
      userContent: "Create a single landing page for Panda",
    });
    assert.equal(out.mode, "landing");
    assert.deepEqual(
      out.plan.nav.map((n) => n.href),
      ["/#menu", "/#contact"],
    );
    assert.equal(navHrefRoutePath(out.plan.nav[0]!.href), "/");
    assert.ok(out.spec.pages.length === 1);
    assert.ok(out.spec.pages[0]!.sections.some((s) => s.id === "menu"));
    assert.ok(out.spec.pages[0]!.sections.some((s) => s.id === "contact"));
  });

  it("expands SiteSpec pages for multi-page nav", () => {
    const out = reconcilePlanNavWithSiteSpec({
      plan: {
        ...plan,
        sitemap: [
          { id: "home", path: "/", title: "Home" },
          { id: "menu", path: "/menu", title: "Menu" },
          { id: "contact", path: "/contact", title: "Contact" },
        ],
        pages: [
          ...plan.pages,
          {
            id: "menu",
            path: "/menu",
            title: "Menu",
            sections: [{ id: "menu-main", role: "services", title: "Menu" }],
          },
          {
            id: "contact",
            path: "/contact",
            title: "Contact",
            sections: [{ id: "contact-main", role: "form", title: "Contact" }],
          },
        ],
      },
      spec: baseSpec,
      brief: {
        status: "building",
        completedSteps: 8,
        answers: { site_depth: "multi" },
        updatedAt: new Date().toISOString(),
      },
    });
    assert.equal(out.mode, "multipage");
    const paths = out.spec.pages.map((p) => p.path).sort();
    assert.ok(paths.includes("/menu"));
    assert.ok(paths.includes("/contact"));
  });
});
