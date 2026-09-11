/**
 * Hard UI-source enforcement for website CREATE (Truth regression + gates).
 */
import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { resolveBuilderFeatureFlags } from "../lib/build/jobs/builder-flags.ts";
import {
  buildProgressiveTemplateQueries,
  buildTemplateQueries,
  scoreTemplate,
  installTemplate,
  runTemplateAgent,
} from "../builder/template-agent.mjs";
import {
  auditUiSource,
  chooseTemplateOrAbort,
  writeUiManifest,
  readUiManifest,
} from "../builder/ui-source.mjs";

function makeLog() {
  const events = [];
  return {
    events,
    emit: (type, message, data) => {
      events.push({ type, message, data });
    },
  };
}

describe("CANDER_ALLOW_NATIVE_SITE_UI", () => {
  const keys = ["CANDER_ALLOW_NATIVE_SITE_UI", "CANDER_BUILDER_IMPROVED"];
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

  it("defaults OFF", () => {
    const f = resolveBuilderFeatureFlags();
    assert.equal(f.allowNativeSiteUi, false);
  });

  it("can be enabled for developer debugging", () => {
    process.env.CANDER_ALLOW_NATIVE_SITE_UI = "1";
    assert.equal(resolveBuilderFeatureFlags().allowNativeSiteUi, true);
  });
});

describe("progressive template search (Truth-like)", () => {
  it("expands beyond niche industry queries", () => {
    const passes = buildProgressiveTemplateQueries(
      {
        designBrief: {
          purpose: "aerospace company",
          styleDirection: "Technical",
          colorDirection: "Dark mode",
        },
      },
      "Truth",
    );
    assert.ok(passes.length >= 4);
    const flat = passes.flat();
    assert.ok(flat.some((q) => /aerospace/i.test(q)));
    assert.ok(flat.some((q) => /SaaS|marketing|company website|landing/i.test(q)));
    assert.ok(flat.some((q) => /modern marketing website template/i.test(q)));
  });

  it("scores structural SaaS templates highly even without industry match", () => {
    const saas = scoreTemplate(
      {
        code: "nav header hero features cta footer pricing",
        files: [
          { path: "page.tsx", content: "nav hero features footer" },
          { path: "Header.tsx", content: "nav" },
        ],
        dependencies: ["framer-motion"],
      },
      { name: "SaaS Marketing", description: "modern SaaS landing" },
      { designBrief: { styleDirection: "premium", purpose: "aerospace defense" } },
      "modern marketing website template",
    );
    const empty = scoreTemplate(
      { code: "div", files: [], dependencies: [] },
      { name: "Empty", description: "" },
      { designBrief: { purpose: "aerospace" } },
      "aerospace",
    );
    assert.ok(saas.score > empty.score);
    assert.ok(saas.score >= 10);
  });

  it("never chooses native when a usable candidate exists", () => {
    const decision = chooseTemplateOrAbort({
      candidates: [{ artifact: { code: "export default function T(){return null}" } }],
      allowNativeSiteUi: false,
    });
    assert.equal(decision.action, "select");
  });

  it("aborts instead of native when no candidates and override off", () => {
    const decision = chooseTemplateOrAbort({ candidates: [], allowNativeSiteUi: false });
    assert.equal(decision.action, "abort");
    assert.equal(decision.reason, "ui_source_unavailable");
  });

  it("Truth regression: niche miss + broad hit installs template, not native", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cander-truth-"));
    try {
      const log = makeLog();
      let searchCalls = 0;
      const twentyFirst = {
        async search(query, _limit, opts) {
          searchCalls += 1;
          assert.equal(opts?.type, "template");
          if (/aerospace/i.test(query)) return [];
          return [
            {
              id: "saas-99",
              name: "Premium SaaS Landing",
              description: "modern marketing website",
            },
          ];
        },
        async get(id) {
          assert.equal(id, "saas-99");
          return {
            id: "saas-99",
            name: "Premium SaaS Landing",
            code: "",
            files: [
              {
                path: "Landing.tsx",
                content:
                  "export default function Landing(){return <main><nav/><section className='hero'/><footer/></main>}",
              },
            ],
            dependencies: [],
          };
        },
      };
      const result = await runTemplateAgent({
        twentyFirst,
        log,
        projectSpec: {
          designBrief: {
            purpose: "aerospace company",
            styleDirection: "Technical",
            colorDirection: "Dark mode",
          },
        },
        projectName: "Truth",
        deadlineMs: Date.now() + 10 * 60_000,
        repoDir: dir,
        allowNativeSiteUi: false,
      });
      assert.ok(!result.abort);
      assert.ok(result.selected);
      assert.equal(result.designSystem.source, "21st");
      assert.notEqual(result.fallbackReason, "no_suitable_template");
      assert.equal(result.designSystem.templateId, "saas-99");
      assert.ok(existsSync(join(dir, "components/twenty-first/template/Landing.tsx")));
      assert.ok(existsSync(join(dir, ".cander/ui-manifest.json")));
      assert.ok(searchCalls >= 2, "must broaden search after niche miss");
      const manifest = readUiManifest(dir);
      assert.equal(manifest?.template?.id, "saas-99");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("aborts CREATE when 21st returns nothing (no native fallback)", async () => {
    const log = makeLog();
    const twentyFirst = {
      async search() {
        return [];
      },
      async get() {
        throw new Error("unreachable");
      },
    };
    const result = await runTemplateAgent({
      twentyFirst,
      log,
      projectSpec: { designBrief: { purpose: "anything" } },
      projectName: "Empty",
      deadlineMs: Date.now() + 10 * 60_000,
      repoDir: null,
      allowNativeSiteUi: false,
    });
    assert.equal(result.abort, true);
    assert.equal(result.abortReason, "ui_source_unavailable");
    assert.notEqual(result.designSystem.source, "native");
  });
});

describe("UI provenance acceptance", () => {
  it("fails when selected components are unused (Truth path)", () => {
    const dir = mkdtempSync(join(tmpdir(), "cander-ui-"));
    try {
      mkdirSync(join(dir, "components/twenty-first/template"), { recursive: true });
      mkdirSync(join(dir, "components/twenty-first"), { recursive: true });
      mkdirSync(join(dir, "app"), { recursive: true });
      mkdirSync(join(dir, "components/site"), { recursive: true });
      writeFileSync(
        join(dir, "components/twenty-first/template/Landing.tsx"),
        "/** sourceType: 21st_template */\nexport default function Landing(){return <main/>}\n",
      );
      writeFileSync(
        join(dir, "components/twenty-first/hero-26630.tsx"),
        "export function ProductHero(){return <section className='hero'/>}\n",
      );
      writeFileSync(
        join(dir, "app/page.tsx"),
        'import Landing from "@/components/twenty-first/template/Landing";\nexport default function Page(){return <Landing/>}\n',
      );
      writeUiManifest(dir, {
        template: { id: "t1", name: "T", files: ["components/twenty-first/template/Landing.tsx"], root: "components/twenty-first/template" },
        approvedComponents: [
          { id: "26630", purpose: "hero", path: "components/twenty-first/hero-26630.tsx" },
        ],
      });
      const audit = auditUiSource({
        repoDir: dir,
        mode: "create",
        projectKind: "site",
        allowNativeSiteUi: false,
        selectedTemplate: {
          componentId: "t1",
          localPath: "components/twenty-first/template",
          files: ["components/twenty-first/template/Landing.tsx"],
        },
        selectedComponents: [
          {
            componentId: "26630",
            name: "Product Hero",
            purpose: "hero",
            localPath: "components/twenty-first/hero-26630.tsx",
          },
        ],
        designSystem: { source: "21st", templateId: "t1", templateRoot: "components/twenty-first/template" },
      });
      assert.equal(audit.ok, false);
      assert.ok(audit.issues.some((i) => /never imported\/rendered/i.test(i)));
      assert.equal(audit.metrics.templateRendered, true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects unauthorized Hero without provenance", () => {
    const dir = mkdtempSync(join(tmpdir(), "cander-ui-"));
    try {
      mkdirSync(join(dir, "components/twenty-first/template"), { recursive: true });
      mkdirSync(join(dir, "components/site"), { recursive: true });
      mkdirSync(join(dir, "app"), { recursive: true });
      writeFileSync(
        join(dir, "components/twenty-first/template/Landing.tsx"),
        "export default function Landing(){return <main/>}\n",
      );
      writeFileSync(
        join(dir, "app/page.tsx"),
        'import Landing from "@/components/twenty-first/template/Landing";\nexport default function Page(){return <Landing/>}\n',
      );
      const hero = `export function Hero(){
  return (
    <section className="relative min-h-screen flex items-center justify-center bg-black text-white">
      <div className="container mx-auto px-6 py-24 grid gap-8">
        <h1 className="text-5xl font-bold tracking-tight">Invented Hero</h1>
        <p className="text-lg text-zinc-400 max-w-xl">This was written from scratch without 21st provenance.</p>
        <button className="rounded-full bg-white text-black px-6 py-3">CTA</button>
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-2xl border border-white/10 p-6">A</div>
          <div className="rounded-2xl border border-white/10 p-6">B</div>
          <div className="rounded-2xl border border-white/10 p-6">C</div>
        </div>
      </div>
    </section>
  );
}
`;
      writeFileSync(join(dir, "components/site/Hero.tsx"), hero);
      const audit = auditUiSource({
        repoDir: dir,
        mode: "create",
        projectKind: "site",
        selectedTemplate: {
          componentId: "t1",
          localPath: "components/twenty-first/template",
          files: ["components/twenty-first/template/Landing.tsx"],
        },
        selectedComponents: [],
        designSystem: { source: "21st", templateId: "t1" },
      });
      assert.equal(audit.ok, false);
      assert.ok(audit.issues.some((i) => /Hero/i.test(i) && /no approved/i.test(i)));
      assert.ok(audit.metrics.unauthorizedVisualComponents.includes("components/site/Hero.tsx"));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("allows glue components without provenance", () => {
    const dir = mkdtempSync(join(tmpdir(), "cander-ui-"));
    try {
      mkdirSync(join(dir, "components/twenty-first/template"), { recursive: true });
      mkdirSync(join(dir, "components/site"), { recursive: true });
      mkdirSync(join(dir, "app"), { recursive: true });
      writeFileSync(
        join(dir, "components/twenty-first/template/Landing.tsx"),
        "export default function Landing(){return <main/>}\n",
      );
      writeFileSync(
        join(dir, "app/page.tsx"),
        'import Landing from "@/components/twenty-first/template/Landing";\nexport default function Page(){return <Landing/>}\n',
      );
      writeFileSync(
        join(dir, "components/site/AuthGuard.tsx"),
        "export function AuthGuard({children}:{children:React.ReactNode}){return children}\n",
      );
      const audit = auditUiSource({
        repoDir: dir,
        mode: "create",
        projectKind: "site",
        selectedTemplate: {
          componentId: "t1",
          localPath: "components/twenty-first/template",
          files: ["components/twenty-first/template/Landing.tsx"],
        },
        selectedComponents: [],
        designSystem: { source: "21st", templateId: "t1" },
      });
      assert.equal(audit.ok, true);
      assert.equal(audit.metrics.nativeUiUsed, false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("accepts derived components with provenance headers", () => {
    const dir = mkdtempSync(join(tmpdir(), "cander-ui-"));
    try {
      mkdirSync(join(dir, "components/twenty-first/template"), { recursive: true });
      mkdirSync(join(dir, "components/site"), { recursive: true });
      mkdirSync(join(dir, "app"), { recursive: true });
      writeFileSync(
        join(dir, "components/twenty-first/template/Landing.tsx"),
        "export default function Landing(){return <main/>}\n",
      );
      writeFileSync(
        join(dir, "app/page.tsx"),
        'import Landing from "@/components/twenty-first/template/Landing";\nimport { IndustriesGrid } from "@/components/site/IndustriesGrid";\nexport default function Page(){return <><Landing/><IndustriesGrid/></>}\n',
      );
      writeFileSync(
        join(dir, "components/site/IndustriesGrid.tsx"),
        `/**
 * sourceType: derived_project_component
 * derivedFrom: FeatureGrid
 * originalSourceType: 21st_template
 * originalSourceId: t1
 */
export function IndustriesGrid(){
  return (
    <section className="py-24 container mx-auto grid gap-8 md:grid-cols-3">
      <div className="rounded-xl border p-6 shadow-sm">One</div>
      <div className="rounded-xl border p-6 shadow-sm">Two</div>
      <div className="rounded-xl border p-6 shadow-sm">Three</div>
    </section>
  );
}
`,
      );
      const audit = auditUiSource({
        repoDir: dir,
        mode: "create",
        projectKind: "site",
        selectedTemplate: {
          componentId: "t1",
          localPath: "components/twenty-first/template",
          files: ["components/twenty-first/template/Landing.tsx"],
        },
        selectedComponents: [],
        designSystem: { source: "21st", templateId: "t1" },
      });
      assert.equal(audit.ok, true);
      assert.ok(audit.metrics.derivedProjectComponents >= 1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fails CREATE when designSystem.source is native", () => {
    const dir = mkdtempSync(join(tmpdir(), "cander-ui-"));
    try {
      mkdirSync(join(dir, "app"), { recursive: true });
      writeFileSync(join(dir, "app/page.tsx"), "export default function Page(){return <main/>}\n");
      const audit = auditUiSource({
        repoDir: dir,
        mode: "create",
        projectKind: "site",
        selectedComponents: [],
        designSystem: { source: "native", fallbackReason: "no_suitable_template" },
      });
      assert.equal(audit.ok, false);
      assert.ok(audit.issues.some((i) => /source "21st"/i.test(i)));
      assert.equal(audit.metrics.nativeUiUsed, true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("legacy native sites can still edit without forced redesign", () => {
    const dir = mkdtempSync(join(tmpdir(), "cander-ui-"));
    try {
      mkdirSync(join(dir, "app"), { recursive: true });
      writeFileSync(join(dir, "app/page.tsx"), "export default function Page(){return <main/>}\n");
      const audit = auditUiSource({
        repoDir: dir,
        mode: "edit",
        projectKind: "site",
        isLegacyNativeSite: true,
        selectedComponents: [],
        designSystem: { source: "native" },
      });
      assert.equal(audit.ok, true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("template install still works", () => {
  it("writes provenance headers", () => {
    const dir = mkdtempSync(join(tmpdir(), "cander-tpl-"));
    try {
      const result = installTemplate(
        dir,
        {
          id: "tpl-1",
          name: "Modern Landing",
          files: [{ path: "Landing.tsx", content: "export default function Landing(){return null}" }],
        },
        { id: "tpl-1", name: "Modern Landing" },
      );
      assert.equal(result.ok, true);
      const body = readFileSync(join(dir, "components/twenty-first/template/Landing.tsx"), "utf8");
      assert.match(body, /sourceType: 21st_template/);
      assert.match(body, /sourceId: tpl-1/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("query helper compatibility", () => {
  it("buildTemplateQueries still flattens progressive passes", () => {
    const q = buildTemplateQueries({ designBrief: { purpose: "law firm", styleDirection: "editorial" } });
    assert.ok(q.length >= 3);
  });
});
