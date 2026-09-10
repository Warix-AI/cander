import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  conflictingSiblingPaths,
  deletePathsForPreferredWrites,
  duplicateAppRouterValidationIssues,
  findDuplicateAppRouterRoutes,
  parseAppRouterFile,
} from "../lib/ai/build/routes/app-router-conflicts.ts";
import { assessPreviewHealth } from "../lib/build/preview/health.ts";
import { composeSiteFromSpec } from "../lib/ai/build/compose-site.ts";
import type { SiteSpec } from "../lib/ai/build/site-spec.ts";

const minimalSpec = {
  businessName: "Acme",
  tagline: "We build",
  industry: "services",
  intent: "leads",
  phone: "",
  email: "",
  location: "",
  ctaPrimary: { label: "Contact", href: "#contact" },
  nav: [{ label: "Home", href: "/" }],
  pages: [
    {
      id: "home",
      path: "/",
      title: "Home",
      sections: [
        {
          id: "hero",
          kind: "features",
          variant: "split",
          title: "Hello",
          body: "World",
          ctaLabel: "Go",
          ctaHref: "#contact",
        },
      ],
    },
  ],
  theme: {
    layoutStyle: "clean-saas",
    primary: "#111",
    primaryForeground: "#fff",
    accent: "#06c",
    background: "#fff",
    foreground: "#111",
    muted: "#f5f5f5",
    mutedForeground: "#666",
    border: "#e5e5e5",
    radius: "8px",
    fontDisplay: "system-ui",
    fontBody: "system-ui",
    spacingScale: "comfortable",
  },
  headerVariant: "sticky-cta",
  footerVariant: "simple-bar",
  customGaps: [],
} as SiteSpec;

describe("app router conflicts", () => {
  it("parses route keys", () => {
    const ref = parseAppRouterFile("app/page.tsx");
    assert.equal(ref?.key, "app/page");
    assert.equal(ref?.ext, ".tsx");
  });

  it("lists sibling deletes for preferred TSX writes", () => {
    const dels = deletePathsForPreferredWrites([
      { path: "app/page.tsx" },
      { path: "app/layout.tsx" },
      { path: "app/robots.ts" },
    ]);
    assert.ok(dels.includes("app/page.js"));
    assert.ok(dels.includes("app/layout.js"));
    assert.ok(dels.includes("app/robots.js"));
    assert.ok(!dels.includes("app/page.tsx"));
  });

  it("detects duplicate page.js + page.tsx", () => {
    const issues = findDuplicateAppRouterRoutes([
      "app/page.js",
      "app/page.tsx",
      "package.json",
    ]);
    assert.equal(issues.length, 1);
    assert.match(issues[0]!.message, /Duplicate App Router/);
    assert.deepEqual(
      duplicateAppRouterValidationIssues(["app/page.js", "app/page.tsx"]),
      [issues[0]!.message],
    );
  });

  it("conflictingSiblingPaths excludes preferred", () => {
    assert.deepEqual(
      conflictingSiblingPaths("app/about/page.tsx").sort(),
      ["app/about/page.js", "app/about/page.jsx", "app/about/page.ts"].sort(),
    );
  });
});

describe("composeSiteFromSpec TSX", () => {
  it("emits app/page.tsx and layout.tsx only (no .js routes)", () => {
    const files = composeSiteFromSpec(minimalSpec);
    const paths = files.map((f) => f.path);
    assert.ok(paths.includes("app/page.tsx"));
    assert.ok(paths.includes("app/layout.tsx"));
    assert.ok(paths.includes("app/robots.ts"));
    assert.ok(paths.includes("app/sitemap.ts"));
    assert.ok(!paths.some((p) => /^app\/.*\.(js|jsx)$/.test(p)));
    assert.equal(duplicateAppRouterValidationIssues(paths).length, 0);
  });
});

describe("preview health", () => {
  it("fails on HTTP 500", () => {
    const h = assessPreviewHealth({ status: 500, bodyText: "<html></html>" });
    assert.equal(h.ok, false);
    assert.match(h.reason || "", /HTTP 500/);
  });

  it("fails on __next_error body", () => {
    const h = assessPreviewHealth({
      status: 200,
      bodyText: '<script>self.__next_error__</script>',
    });
    assert.equal(h.ok, false);
  });

  it("passes healthy 200 HTML", () => {
    const h = assessPreviewHealth({
      status: 200,
      bodyText: "<!DOCTYPE html><html><body>ok</body></html>",
    });
    assert.equal(h.ok, true);
  });
});
