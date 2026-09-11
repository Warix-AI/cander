/**
 * Website 21st template-first policy tests.
 */
import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import { mkdtempSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { resolveBuilderFeatureFlags } from "../lib/build/jobs/builder-flags.ts";
import { normalizeProjectSpec } from "../lib/ai/build/plan/normalize.ts";
import { sanitizeUserProgress } from "../lib/build/jobs/user-progress.ts";
import {
  buildTemplateQueries,
  scoreTemplate,
  installTemplate,
  inferMissingComponentPurposes,
} from "../builder/template-agent.mjs";
import { normalizeGet } from "../builder/twenty-first.mjs";

describe("websiteTemplateFirst flag", () => {
  const keys = ["CANDER_BUILDER_IMPROVED", "CANDER_WEBSITE_21ST_TEMPLATE_FIRST", "CANDER_ALLOW_NATIVE_SITE_UI"];
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

  it("defaults on with improved builder", () => {
    const f = resolveBuilderFeatureFlags();
    assert.equal(f.websiteTemplateFirst, true);
    assert.equal(f.allowNativeSiteUi, false);
  });

  it("can be disabled independently", () => {
    process.env.CANDER_WEBSITE_21ST_TEMPLATE_FIRST = "0";
    const f = resolveBuilderFeatureFlags();
    assert.equal(f.websiteTemplateFirst, false);
    assert.equal(f.improved, true);
  });
});

describe("template query generation", () => {
  it("uses design brief to target template searches", () => {
    const queries = buildTemplateQueries(
      {
        intent: "Reusable launch systems",
        designBrief: {
          purpose: "aerospace company",
          styleDirection: "Technical",
          colorDirection: "Dark mode",
          primaryGoal: "Drive contact inquiries",
        },
        visual: { direction: "technical" },
      },
      "Orbital",
    );
    assert.ok(queries.length >= 3);
    assert.ok(queries.some((q) => /aerospace|orbital|technical|premium|dark/i.test(q)));
    assert.ok(queries.every((q) => /template|website|landing/i.test(q)));
  });

  it("specializes SaaS vs portfolio queries", () => {
    const saas = buildTemplateQueries({
      designBrief: { purpose: "SaaS product analytics", primaryGoal: "Start free trial" },
    });
    assert.ok(saas.some((q) => /saas/i.test(q)));
    const portfolio = buildTemplateQueries({
      designBrief: { purpose: "architecture studio portfolio", styleDirection: "editorial" },
    });
    assert.ok(portfolio.some((q) => /portfolio/i.test(q)));
  });
});

describe("template scoring and install", () => {
  it("scores multi-file templates higher and prefers style match", () => {
    const weak = scoreTemplate(
      { code: "export default function X(){return <div/>}", files: [], dependencies: [] },
      { name: "Tiny", description: "" },
      { designBrief: { styleDirection: "premium", purpose: "aerospace" } },
      "modern website",
    );
    const strong = scoreTemplate(
      {
        code: "header nav footer hero aerospace premium dark",
        files: [
          { path: "page.tsx", content: "nav hero footer" },
          { path: "Header.tsx", content: "nav" },
        ],
        dependencies: ["framer-motion"],
      },
      { name: "Aerospace Premium", description: "dark premium landing" },
      { designBrief: { styleDirection: "premium", purpose: "aerospace" } },
      "dark premium aerospace website template",
    );
    assert.ok(strong.score > weak.score);
  });

  it("installs template files under components/twenty-first/template", () => {
    const dir = mkdtempSync(join(tmpdir(), "cander-tpl-"));
    try {
      const result = installTemplate(
        dir,
        {
          id: "tpl-1",
          name: "Modern Landing",
          code: "",
          files: [
            { path: "Landing.tsx", content: "export default function Landing(){return <main/>}" },
            { path: "components/Hero.tsx", content: "export function Hero(){return null}" },
          ],
          dependencies: [],
        },
        { id: "tpl-1", name: "Modern Landing" },
      );
      assert.equal(result.ok, true);
      assert.ok(existsSync(join(dir, "components/twenty-first/template/Landing.tsx")));
      assert.ok(existsSync(join(dir, "components/twenty-first/template/components/Hero.tsx")));
      assert.ok(existsSync(join(dir, "components/twenty-first/template/README.md")));
      const body = readFileSync(join(dir, "components/twenty-first/template/Landing.tsx"), "utf8");
      assert.match(body, /21st\.dev template/);
      assert.match(body, /export default function Landing/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("normalizeGet accepts multi-file template payloads", () => {
    const art = normalizeGet(
      {
        id: "t1",
        name: "Full Site",
        files: [
          { path: "app/page.tsx", content: "export default function Page(){}" },
          { name: "Header.tsx", content: "export function Header(){}" },
        ],
        dependencies: ["lucide-react"],
      },
      "t1",
    );
    assert.ok(art);
    assert.equal(art!.files?.length, 2);
    assert.ok(art!.dependencies.includes("lucide-react"));
  });
});

describe("missing components after template", () => {
  it("infers gaps the template lacks", () => {
    const missing = inferMissingComponentPurposes(
      {
        features: ["FAQ", "Testimonials", "Contact form"],
        pages: [{ path: "/pricing", title: "Pricing" }],
      },
      "nav header hero features cta footer",
    );
    assert.ok(missing.includes("faq"));
    assert.ok(missing.includes("testimonials"));
    assert.ok(missing.includes("pricing") || missing.includes("contact"));
  });

  it("does not re-request sections already present", () => {
    const missing = inferMissingComponentPurposes(
      { features: ["FAQ"] },
      "nav hero faq accordion footer contact form",
    );
    assert.ok(!missing.includes("faq"));
    assert.ok(!missing.includes("contact"));
  });
});

describe("designSystem lineage persistence", () => {
  it("normalizes designSystem on project_spec", () => {
    const spec = normalizeProjectSpec({
      version: 1,
      kind: "site",
      businessName: "Orbital",
      intent: "Launch systems",
      goals: [],
      ctas: [],
      designSystem: {
        source: "21st",
        templateId: "tpl-99",
        templateName: "Aerospace Premium",
        templateRoot: "components/twenty-first/template",
        templateFiles: ["components/twenty-first/template/Landing.tsx"],
        dependencies: ["framer-motion"],
        components: { navbar: "Header.tsx", footer: "Footer.tsx" },
        layoutRules: { shell: "Reuse navbar/footer" },
      },
    });
    assert.ok(spec?.designSystem);
    assert.equal(spec!.designSystem!.templateId, "tpl-99");
    assert.equal(spec!.designSystem!.source, "21st");
    assert.equal(spec!.designSystem!.components?.navbar, "Header.tsx");
  });

  it("keeps native fallback lineage for old/non-template projects", () => {
    const spec = normalizeProjectSpec({
      version: 1,
      kind: "site",
      businessName: "Legacy",
      intent: "Old site",
      goals: [],
      ctas: [],
      designSystem: {
        source: "derived",
        fallbackReason: "pre_template_project",
      },
    });
    assert.equal(spec!.designSystem!.source, "derived");
    assert.equal(spec!.designSystem!.fallbackReason, "pre_template_project");
  });
});

describe("template-first status language", () => {
  it("maps template statuses to clean product language", () => {
    assert.equal(sanitizeUserProgress("Finding the right design…"), "Finding the right design…");
    assert.equal(sanitizeUserProgress("Reviewing website templates…"), "Finding the right design…");
    assert.equal(sanitizeUserProgress("Customizing the template…"), "Finding the right design…");
    assert.equal(sanitizeUserProgress("Adding the sections you need…"), "Adding the sections you need…");
  });
});
